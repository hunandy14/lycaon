import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ShareSettings } from '@lycaon/engine';
import { buildGameReport, buildSpectatorView, replay, DEFAULT_SHARE } from '@lycaon/engine';
import type { EventStore, GameRow } from '../db';
import { subscribe } from '../live';

export function parseShare(row: GameRow): ShareSettings {
  if (!row.share_json) return { ...DEFAULT_SHARE };
  try {
    return { ...DEFAULT_SHARE, ...(JSON.parse(row.share_json) as Partial<ShareSettings>) };
  } catch {
    return { ...DEFAULT_SHARE };
  }
}

/** 觀戰端（無 GM 權限；一律回過濾後的快照，過濾在 server 端執行） */
export function watchRoutes(store: EventStore): Hono {
  const app = new Hono();

  const resolve = (token: string): { game: GameRow; settings: ShareSettings } | null => {
    if (!token) return null;
    const game = store.getGameByShareToken(token);
    if (!game) return null;
    const settings = parseShare(game);
    if (!settings.enabled) return null;
    return { game, settings };
  };

  app.get('/:token', (c) => {
    const hit = resolve(c.req.param('token'));
    if (!hit) return c.json({ error: '同樂模式未開啟或連結無效' }, 404);
    const { game, settings } = hit;

    const envelopes = store.loadEnvelopes(game.id);
    const state = replay(envelopes);
    const report = buildGameReport(envelopes);
    const view = buildSpectatorView(state, settings, report);
    return c.json({ title: game.title, ...view });
  });

  app.get('/:token/stream', (c) => {
    const hit = resolve(c.req.param('token'));
    if (!hit) return c.json({ error: '同樂模式未開啟或連結無效' }, 404);
    const gameId = hit.game.id;

    return streamSSE(c, async (stream) => {
      let alive = true;
      const unsub = subscribe(gameId, (event) => {
        if (event.kind === 'update') {
          void stream.writeSSE({ event: 'update', data: String(Date.now()) });
        }
        // chat 事件的推播於步驟 3 加入聊天路由後啟用
      });
      stream.onAbort(() => {
        alive = false;
        unsub();
      });
      await stream.writeSSE({ event: 'hello', data: 'ok' });
      // 心跳維持連線（cloudflared/瀏覽器閒置逾時）
      while (alive) {
        await stream.sleep(25000);
        if (alive) await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });

  return app;
}
