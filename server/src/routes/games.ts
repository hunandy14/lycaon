import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';
import { nanoid } from 'nanoid';
import type { GameConfig, GameEvent, GameProgress, ShareSettings } from '@lycaon/engine';
import { replay, validate, validateConfig, gameProgress, buildGameReport, buildSituationSummary, BOARD_PRESETS, DEFAULT_SHARE } from '@lycaon/engine';
import type { ChatScope, EventStore, GameRow } from '../db';
import { hashPassword, verifyPassword } from '../auth';
import { notify, notifyChat, subscribe } from '../live';
import { aiEnabled, askAi, type AiMessage } from '../ai';
import { buildSystemPrompt, capSituation, buildConversation } from '../aiPrompt';
import { parseShare } from './watch';

/**
 * 夜間祕密行動：觀戰端本來就拉夜幕看不到，這些事件不推 SSE——連「更新的時機」都藏住，
 * 杜絕偷看的活人從推播節奏反推 GM 進行到哪一步。天亮/投票/公佈死訊等照常推。
 */
const NIGHT_SECRET_EVENTS = new Set<GameEvent['type']>([
  'GUARD_ACTED',
  'WOLVES_ACTED',
  'SEED_WOLF_ACTED',
  'WITCH_ACTED',
  'SEER_ACTED',
  'CUPID_LINKED',
]);

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
    store.upsertRoster(config.seats.map((s) => s.name ?? '').filter(Boolean), now);
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
    if (!NIGHT_SECRET_EVENTS.has(body.event.type)) notify(id); // 夜間祕密行動不推播
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
    return c.json({ token: game.share_token, ghostToken: game.ghost_token, settings: parseShare(game) });
  });

  app.post('/:id/share', async (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    const patch = (await c.req.json().catch(() => ({}))) as Partial<ShareSettings>;
    const settings: ShareSettings = { ...DEFAULT_SHARE, ...parseShare(game), ...patch };
    // token 首次開啟時生成，之後固定（開關不換連結）；ghost token 比照 share token 的做法
    const token = game.share_token ?? (settings.enabled ? nanoid(12) : null);
    const ghostToken = game.ghost_token ?? (settings.ghostEnabled ? nanoid(12) : null);
    store.updateShare(game.id, token, JSON.stringify(settings));
    if (ghostToken && ghostToken !== game.ghost_token) store.updateGhost(game.id, ghostToken);
    notify(game.id);
    return c.json({ token, ghostToken, settings });
  });

  // ── GM 聊天監看（一律過房主密碼；GM 發言免 rate limit、nick 固定 'GM'、isGm=1） ──
  app.get('/:id/chat', (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    return c.json({
      watch: store.listChat(game.id, 'watch', 50),
      ghost: store.listChat(game.id, 'ghost', 50),
    });
  });

  app.post('/:id/chat', async (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;

    let body: { scope?: unknown; text?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '格式錯誤' }, 400);
    }
    const scope: ChatScope = body.scope === 'watch' ? 'watch' : 'ghost';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length < 1 || text.length > 200) return c.json({ error: '訊息長度需為 1–200 字' }, 400);

    // GM 端免 rate limit（房主已過密碼驗證，不是匿名觀眾）
    const message = store.appendChat(game.id, 'GM', text, new Date().toISOString(), scope, true);
    notifyChat(game.id, message);
    return c.json(message, 201);
  });

  app.get('/:id/chat/stream', (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    const gameId = game.id;

    return streamSSE(c, async (stream) => {
      let alive = true;
      const unsub = subscribe(gameId, (event) => {
        if (event.kind === 'update') {
          void stream.writeSSE({ event: 'update', data: String(Date.now()) });
        } else if (event.kind === 'chat') {
          // GM 端兩房都要看：陰間＋陽間
          void stream.writeSSE({ event: 'chat', data: JSON.stringify(event.message) });
        }
      });
      stream.onAbort(() => {
        alive = false;
        unsub();
      });
      await stream.writeSSE({ event: 'hello', data: 'ok' });
      while (alive) {
        await stream.sleep(25000);
        if (alive) await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });

  // ── AI 規則問答（GM 專用；scope 'ai' 獨立房，不進 watch/ghost SSE、與觀戰無關；一律過房主密碼） ──
  app.get('/:id/ai-chat', (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    return c.json({ enabled: aiEnabled(), messages: store.listChat(game.id, 'ai', 200) });
  });

  app.post('/:id/ai-chat', async (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const denied = checkAuth(game, c, true);
    if (denied) return denied;
    // AI 未設定：不入歷史，直接回 503（與「上游失敗」的 502 語意分開）
    if (!aiEnabled()) return c.json({ error: 'AI 規則助手尚未設定（server/.env 需填 AI_BASE_URL/AI_TOKEN/AI_MODEL）' }, 503);

    let body: { text?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '格式錯誤' }, 400);
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length < 1 || text.length > 500) return c.json({ error: '訊息長度需為 1–500 字' }, 400);

    // GM 問題先入歷史：即使 AI 上游失敗，問題也留著（可檢視/重試），是預期行為
    const question = store.appendChat(game.id, 'GM', text, new Date().toISOString(), 'ai', true);

    // 組戰況：replay → GameState、buildGameReport → GameReport → buildSituationSummary（過長截斷防撞 context）
    const envelopes = store.loadEnvelopes(game.id);
    const situation = capSituation(buildSituationSummary(replay(envelopes), buildGameReport(envelopes)));

    // system 一則 + AI 房歷史（GM=user、AI=assistant）；buildConversation 取近況並修正孤兒提問／確保嚴格交替
    const history = store
      .listChat(game.id, 'ai', 200)
      .map((m): AiMessage => ({ role: m.isGm ? 'user' : 'assistant', content: m.text }));
    const messages: AiMessage[] = [
      { role: 'system', content: buildSystemPrompt(situation) },
      ...buildConversation(history),
    ];

    let replyText: string;
    try {
      replyText = await askAi(messages);
    } catch (e) {
      return c.json({ error: `AI 回應失敗：${(e as Error).message}` }, 502);
    }
    const reply = store.appendChat(game.id, 'AI', replyText, new Date().toISOString(), 'ai', false);
    return c.json({ question, reply });
  });

  return app;
}
