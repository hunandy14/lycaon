import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ShareSettings } from '@lycaon/engine';
import { buildGameReport, buildGhostView, buildSpectatorView, replay } from '@lycaon/engine';
import type { ChatScope, EventStore, GameRow } from '../db';
import { subscribe, notifyChat } from '../live';
import { parseShare } from './watch';
import { clientIp, rateLimited } from './chatUtil';

/**
 * 陰間端（死者視角）：token 即憑證，免密碼（見 SPEC 紀律 2）。
 * `ghostCanReveal===false` 時降級回觀眾等級快照（過濾一律在 server 端做，這裡才是「藏底牌」的
 * 唯一守門處，client 不負責藏）。
 */
export function ghostRoutes(store: EventStore): Hono {
  const app = new Hono();

  const resolve = (token: string): { game: GameRow; settings: ShareSettings } | null => {
    if (!token) return null;
    const game = store.getGameByGhostToken(token);
    if (!game) return null;
    const settings = parseShare(game);
    if (!settings.ghostEnabled) return null;
    return { game, settings };
  };

  app.get('/:token', (c) => {
    const hit = resolve(c.req.param('token'));
    if (!hit) return c.json({ error: '陰間模式未開啟或連結無效' }, 404);
    const { game, settings } = hit;

    const envelopes = store.loadEnvelopes(game.id);
    const state = replay(envelopes);
    const report = buildGameReport(envelopes);
    if (settings.ghostCanReveal) {
      const view = buildGhostView(state, settings, report);
      return c.json({ title: game.title, ...view });
    }
    // 未開眼權限：全知資料連網路層都不出去，直接降級成觀眾視角
    const view = buildSpectatorView(state, settings, report);
    return c.json({ title: game.title, ...view, god: false });
  });

  app.get('/:token/stream', (c) => {
    const hit = resolve(c.req.param('token'));
    if (!hit) return c.json({ error: '陰間模式未開啟或連結無效' }, 404);
    const gameId = hit.game.id;

    return streamSSE(c, async (stream) => {
      let alive = true;
      const unsub = subscribe(gameId, (event) => {
        if (event.kind === 'update') {
          void stream.writeSSE({ event: 'update', data: String(Date.now()) });
        } else if (event.kind === 'chat') {
          // 陰間頁有陰陽雙聊天室，兩房訊息都轉發（比對照 watch 端只轉 watch 房）
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

  const resolveScope = (raw: string | undefined): ChatScope => (raw === 'watch' ? 'watch' : 'ghost');

  app.get('/:token/chat', (c) => {
    const hit = resolve(c.req.param('token'));
    if (!hit) return c.json({ error: '陰間模式未開啟或連結無效' }, 404);
    const scope = resolveScope(c.req.query('scope'));
    if (scope === 'watch' && !hit.settings.showChat) return c.json({ messages: [] });
    return c.json({ messages: store.listChat(hit.game.id, scope, 50) });
  });

  app.post('/:token/chat', async (c) => {
    const hit = resolve(c.req.param('token'));
    if (!hit) return c.json({ error: '陰間模式未開啟或連結無效' }, 404);

    let body: { nick?: unknown; text?: unknown; scope?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '格式錯誤' }, 400);
    }
    const scope = resolveScope(typeof body.scope === 'string' ? body.scope : undefined);
    if (scope === 'watch' && !hit.settings.showChat) return c.json({ error: '陽間聊天室未開啟' }, 404);

    const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (nick.length < 1 || nick.length > 12) return c.json({ error: '暱稱長度需為 1–12 字' }, 400);
    if (text.length < 1 || text.length > 200) return c.json({ error: '訊息長度需為 1–200 字' }, 400);

    const token = c.req.param('token');
    const rateKey = `ghost:${token}:${scope}:${clientIp(c)}`;
    if (rateLimited(rateKey)) return c.json({ error: '請稍後再送出' }, 429);

    const message = store.appendChat(hit.game.id, nick, text, new Date().toISOString(), scope);
    notifyChat(hit.game.id, message);
    return c.json(message, 201);
  });

  return app;
}
