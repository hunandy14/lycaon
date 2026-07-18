import { describe, expect, it, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { openDb, EventStore } from '../src/db';
import { watchRoutes } from '../src/routes/watch';
import { DEFAULT_RULES, DEFAULT_SHARE, type GameConfig } from '@lycaon/engine';

const config: GameConfig = {
  playerCount: 6,
  seats: (['seer', 'witch', 'villager', 'villager', 'werewolf', 'werewolf'] as const).map((role, i) => ({
    seat: i + 1,
    role,
  })),
  rules: { ...DEFAULT_RULES, sheriffEnabled: false },
};

const NOW = '2026-01-01T00:00:00.000Z';

function setup(shareOverrides: Partial<typeof DEFAULT_SHARE> = { enabled: true }) {
  const store = new EventStore(openDb(':memory:'));
  store.createGame('g1', 'test', JSON.stringify(config), NOW);
  store.append('g1', { type: 'GAME_CREATED', config }, NOW);
  const token = 'tok1';
  store.updateShare('g1', token, JSON.stringify({ ...DEFAULT_SHARE, ...shareOverrides }));
  const app = new Hono();
  app.route('/api/watch', watchRoutes(store));
  return { store, app, token };
}

describe('觀戰聊天室', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('GET 歷史：空局回傳空陣列', async () => {
    const { app, token } = setup();
    const res = await app.request(`/api/watch/${token}/chat`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([]);
  });

  it('POST 成功寫入並可由 GET 讀回（依 id 升冪）', async () => {
    const { app, token } = setup();
    const res = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
      body: JSON.stringify({ nick: '小明', text: '哈囉' }),
    });
    expect(res.status).toBe(201);
    const msg = await res.json();
    expect(msg.nick).toBe('小明');
    expect(msg.text).toBe('哈囉');
    expect(msg.gameId).toBe('g1');

    const hist = await app.request(`/api/watch/${token}/chat`);
    const body = await hist.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ nick: '小明', text: '哈囉' });
  });

  it('暱稱長度驗證：空字串或超過 12 字回 400', async () => {
    const { app, token } = setup();
    const empty = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.2' },
      body: JSON.stringify({ nick: '', text: '哈囉' }),
    });
    expect(empty.status).toBe(400);

    const tooLong = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.3' },
      body: JSON.stringify({ nick: '一二三四五六七八九十十一十二十三', text: '哈囉' }),
    });
    expect(tooLong.status).toBe(400);
  });

  it('訊息長度驗證：空字串或超過 200 字回 400', async () => {
    const { app, token } = setup();
    const empty = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '3.3.3.3' },
      body: JSON.stringify({ nick: '小明', text: '   ' }),
    });
    expect(empty.status).toBe(400);

    const tooLong = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '3.3.3.4' },
      body: JSON.stringify({ nick: '小明', text: 'a'.repeat(201) }),
    });
    expect(tooLong.status).toBe(400);
  });

  it('token 無效：GET/POST 皆回 404', async () => {
    const { app } = setup();
    const get = await app.request(`/api/watch/nope/chat`);
    expect(get.status).toBe(404);

    const post = await app.request(`/api/watch/nope/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nick: '小明', text: '哈囉' }),
    });
    expect(post.status).toBe(404);
  });

  it('同樂未開啟：token 存在但 enabled=false 一律 404', async () => {
    const { app, token } = setup({ enabled: false });
    const get = await app.request(`/api/watch/${token}/chat`);
    expect(get.status).toBe(404);

    const post = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nick: '小明', text: '哈囉' }),
    });
    expect(post.status).toBe(404);
  });

  it('rate limit：同一 IP 3 秒內第二則回 429，間隔後恢復正常', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const { app, token } = setup();

    const first = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ nick: '小明', text: '第一則' }),
    });
    expect(first.status).toBe(201);

    const second = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ nick: '小明', text: '第二則' }),
    });
    expect(second.status).toBe(429);

    vi.setSystemTime(new Date(Date.parse(NOW) + 3100));
    const third = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ nick: '小明', text: '第三則' }),
    });
    expect(third.status).toBe(201);
  });

  it('rate limit：不同 IP 互不影響', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const { app, token } = setup();

    const a = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '5.5.5.5' },
      body: JSON.stringify({ nick: 'A', text: 'hi' }),
    });
    expect(a.status).toBe(201);

    const b = await app.request(`/api/watch/${token}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '6.6.6.6' },
      body: JSON.stringify({ nick: 'B', text: 'hi' }),
    });
    expect(b.status).toBe(201);
  });
});
