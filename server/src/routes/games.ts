import { Hono } from 'hono';
import type { Context } from 'hono';
import { nanoid } from 'nanoid';
import type { GameConfig, GameEvent, GameProgress, ShareSettings } from '@lycaon/engine';
import { replay, validate, validateConfig, gameProgress, BOARD_PRESETS, DEFAULT_SHARE } from '@lycaon/engine';
import type { EventStore, GameRow } from '../db';
import { hashPassword, verifyPassword } from '../auth';
import { notify } from '../live';
import { parseShare } from './watch';

/**
 * 房主管理密碼把關（兩道鎖之一，另一道是 CF Access 擋整站）。
 * 寫入（事件/undo/redo/刪除/分享設定）永遠需密碼；讀取（GET /:id 完整事件流）在對局
 * 進行中需密碼、結束後開放（報表/時間軸可直接分享連結）。無設密碼的局（舊局）不上鎖。
 */
function checkAuth(game: GameRow, c: Context, forWrite: boolean): Response | null {
  if (!game.password_hash) return null; // 未設密碼 = 不上鎖
  if (!forWrite && game.status !== 'active') return null; // 結束/中止後讀取開放
  const pw = c.req.header('x-room-password');
  if (pw && verifyPassword(pw, game.password_hash)) return null;
  return c.json({ error: '需要房主管理密碼', needPassword: true }, 401);
}

/** 由重播結果同步 games.status（winner → finished；GAME_ABORTED → aborted）與進度快照 */
function syncStatus(store: EventStore, gameId: string, at?: string): GameProgress | null {
  const envelopes = store.loadEnvelopes(gameId);
  if (envelopes.length === 0) return null;
  const state = replay(envelopes);
  const status = state.winner ? 'finished' : state.phase.t === 'ended' ? 'aborted' : 'active';
  const progress = gameProgress(state);
  store.updateGameStatus(gameId, status, JSON.stringify(progress), at ?? new Date().toISOString());
  return progress;
}

export function gamesRoutes(store: EventStore): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const games = store.listGames().map((g) => {
      const config = JSON.parse(g.config_json) as GameConfig;
      // 舊局沒有快照：懶補一次（重播後存回，維持原 updated_at），之後走快取
      const progress = g.progress_json
        ? (JSON.parse(g.progress_json) as GameProgress)
        : syncStatus(store, g.id, g.updated_at);
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        playerCount: config.playerCount,
        presetId: config.presetId ?? 'custom',
        progress,
        locked: !!g.password_hash,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      };
    });
    return c.json({ games });
  });

  app.post('/', async (c) => {
    const config = (await c.req.json()) as GameConfig;
    const errors = validateConfig(config);
    if (errors.length > 0) return c.json({ error: errors.join('；') }, 400);

    const id = nanoid(10);
    const now = new Date().toISOString();
    const preset = BOARD_PRESETS.find((p) => p.id === config.presetId);
    const title = config.title || `${preset?.name ?? `${config.playerCount} 人自訂局`}`;
    // 建局密碼經 x-room-password 標頭帶入（空 = 不上鎖）；建局裝置自行存 localStorage
    const pw = c.req.header('x-room-password');
    const passwordHash = pw ? hashPassword(pw) : null;
    store.createGame(id, title, JSON.stringify(config), now, passwordHash);
    store.append(id, { type: 'GAME_CREATED', config }, now);
    syncStatus(store, id);
    return c.json({ id }, 201);
  });

  app.get('/:id', (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, false);
    if (denied) return denied;
    const envelopes = store.loadEnvelopes(game.id);
    return c.json({
      id: game.id,
      title: game.title,
      status: game.status,
      envelopes,
      redoCount: store.redoCount(game.id),
      locked: !!game.password_hash,
    });
  });

  app.delete('/:id', (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    store.deleteGame(game.id);
    return c.json({ ok: true });
  });

  app.post('/:id/events', async (c) => {
    const id = c.req.param('id');
    const game = store.getGame(id);
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    const body = (await c.req.json()) as { event: GameEvent; expectedSeq: number };

    const head = store.headSeq(id);
    if (body.expectedSeq !== head) {
      return c.json({ error: `狀態已變更（預期 seq ${body.expectedSeq}，實際 ${head}），請重新整理`, headSeq: head }, 409);
    }

    const state = replay(store.loadEnvelopes(id));
    const result = validate(state, body.event);
    if (!result.ok) return c.json({ error: result.reason }, 400);

    const now = new Date().toISOString();
    const seq = store.append(id, body.event, now);
    syncStatus(store, id);
    notify(id);
    return c.json({ seq, envelope: { seq, at: now, event: body.event } });
  });

  app.post('/:id/undo', async (c) => {
    const id = c.req.param('id');
    const game = store.getGame(id);
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as { toSeq?: number };
    try {
      const headSeq = store.undo(id, body.toSeq);
      syncStatus(store, id);
      notify(id);
      return c.json({ headSeq, redoCount: store.redoCount(id) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.post('/:id/redo', (c) => {
    const id = c.req.param('id');
    const game = store.getGame(id);
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    try {
      const headSeq = store.redo(id);
      syncStatus(store, id);
      notify(id);
      return c.json({ headSeq, redoCount: store.redoCount(id) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // ── 同樂模式（GM 端）：查詢/更新分享設定（皆需房主密碼） ──
  app.get('/:id/share', (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    return c.json({ token: game.share_token, settings: parseShare(game) });
  });

  app.post('/:id/share', async (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    const patch = (await c.req.json().catch(() => ({}))) as Partial<ShareSettings>;
    const settings: ShareSettings = { ...DEFAULT_SHARE, ...parseShare(game), ...patch };
    // token 首次開啟時生成，之後固定（開關不換連結）
    const token = game.share_token ?? (settings.enabled ? nanoid(12) : null);
    store.updateShare(game.id, token, JSON.stringify(settings));
    notify(game.id);
    return c.json({ token, settings });
  });

  return app;
}
