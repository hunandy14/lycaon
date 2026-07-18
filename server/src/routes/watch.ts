import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ShareSettings } from '@lycaon/engine';
import { buildGameReport, buildSpectatorView, replay, DEFAULT_SHARE } from '@lycaon/engine';
import type { EventStore, GameRow } from '../db';
import { subscribe, notifyChat } from '../live';

/** 聊天 rate limit：同一 token 每 IP 每 3 秒最多 1 則（單進程 in-memory，同 live.ts 前提） */
const CHAT_RATE_LIMIT_MS = 3000;
const lastChatAt = new Map<string, number>();

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
}

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
        } else if (event.kind === 'chat') {
          void stream.writeSSE({ event: 'chat', data: JSON.stringify(event.message) });
        }
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

  app.get('/:token/chat', (c) => {
    const hit = resolve(c.req.param('token'));
    if (!hit) return c.json({ error: '同樂模式未開啟或連結無效' }, 404);
    return c.json({ messages: store.listChat(hit.game.id, 50) });
  });

  app.post('/:token/chat', async (c) => {
    const hit = resolve(c.req.param('token'));
    if (!hit) return c.json({ error: '同樂模式未開啟或連結無效' }, 404);

    let body: { nick?: unknown; text?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '格式錯誤' }, 400);
    }
    const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (nick.length < 1 || nick.length > 12) return c.json({ error: '暱稱長度需為 1–12 字' }, 400);
    if (text.length < 1 || text.length > 200) return c.json({ error: '訊息長度需為 1–200 字' }, 400);

    const token = c.req.param('token');
    const ip = clientIp(c);
    const rateKey = `${token}:${ip}`;
    const now = Date.now();
    const last = lastChatAt.get(rateKey);
    if (last !== undefined && now - last < CHAT_RATE_LIMIT_MS) {
      return c.json({ error: '請稍後再送出' }, 429);
    }
    lastChatAt.set(rateKey, now);

    const message = store.appendChat(hit.game.id, nick, text, new Date().toISOString());
    notifyChat(hit.game.id, message);
    return c.json(message, 201);
  });

  return app;
}
