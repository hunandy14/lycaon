import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { GameConfig, GameEvent, GameProgress } from '@lycaon/engine';
import { replay, validate, validateConfig, gameProgress, BOARD_PRESETS } from '@lycaon/engine';
import type { EventStore } from '../db';

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
    store.createGame(id, title, JSON.stringify(config), now);
    store.append(id, { type: 'GAME_CREATED', config }, now);
    syncStatus(store, id);
    return c.json({ id }, 201);
  });

  app.get('/:id', (c) => {
    const game = store.getGame(c.req.param('id'));
    if (!game) return c.json({ error: '對局不存在' }, 404);
    const envelopes = store.loadEnvelopes(game.id);
    return c.json({
      id: game.id,
      title: game.title,
      status: game.status,
      envelopes,
      redoCount: store.redoCount(game.id),
    });
  });

  app.delete('/:id', (c) => {
    const id = c.req.param('id');
    if (!store.getGame(id)) return c.json({ error: '對局不存在' }, 404);
    store.deleteGame(id);
    return c.json({ ok: true });
  });

  app.post('/:id/events', async (c) => {
    const id = c.req.param('id');
    if (!store.getGame(id)) return c.json({ error: '對局不存在' }, 404);
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
    return c.json({ seq, envelope: { seq, at: now, event: body.event } });
  });

  app.post('/:id/undo', async (c) => {
    const id = c.req.param('id');
    if (!store.getGame(id)) return c.json({ error: '對局不存在' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { toSeq?: number };
    try {
      const headSeq = store.undo(id, body.toSeq);
      syncStatus(store, id);
      return c.json({ headSeq, redoCount: store.redoCount(id) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.post('/:id/redo', (c) => {
    const id = c.req.param('id');
    if (!store.getGame(id)) return c.json({ error: '對局不存在' }, 404);
    try {
      const headSeq = store.redo(id);
      syncStatus(store, id);
      return c.json({ headSeq, redoCount: store.redoCount(id) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  return app;
}
