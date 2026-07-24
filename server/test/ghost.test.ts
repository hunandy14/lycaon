import { describe, expect, it, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { openDb, EventStore } from '../src/db';
import { watchRoutes } from '../src/routes/watch';
import { ghostRoutes } from '../src/routes/ghost';
import { gamesRoutes } from '../src/routes/games';
import { hashPassword } from '../src/auth';
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

afterEach(() => {
  vi.useRealTimers();
});

function setup(shareOverrides: Partial<typeof DEFAULT_SHARE> = {}, passwordHash: string | null = null) {
  const store = new EventStore(openDb(':memory:'));
  store.createGame('g1', 'test', JSON.stringify(config), NOW, passwordHash);
  store.append('g1', { type: 'GAME_CREATED', config }, NOW);
  const watchToken = 'watchtok1';
  const ghostToken = 'ghosttok1';
  store.updateShare(
    'g1',
    watchToken,
    JSON.stringify({ ...DEFAULT_SHARE, enabled: true, showChat: true, ghostEnabled: true, ...shareOverrides })
  );
  store.updateGhost('g1', ghostToken);
  const app = new Hono();
  app.route('/api/watch', watchRoutes(store));
  app.route('/api/ghost', ghostRoutes(store));
  app.route('/api/games', gamesRoutes(store));
  return { store, app, watchToken, ghostToken };
}

describe('陰間端 token 隔離', () => {
  it('watch token 打 ghost API 一律 404', async () => {
    const { app, watchToken } = setup();
    const get = await app.request(`/api/ghost/${watchToken}`);
    expect(get.status).toBe(404);
    const chat = await app.request(`/api/ghost/${watchToken}/chat`);
    expect(chat.status).toBe(404);
  });

  it('ghost token 打 watch API 一律 404', async () => {
    const { app, ghostToken } = setup();
    const get = await app.request(`/api/watch/${ghostToken}`);
    expect(get.status).toBe(404);
    const chat = await app.request(`/api/watch/${ghostToken}/chat`);
    expect(chat.status).toBe(404);
  });
});

describe('陰間端 canReveal 降級', () => {
  it('ghostCanReveal=false 時降級回觀眾等級：god:false、無底牌', async () => {
    const { app, ghostToken } = setup({ ghostCanReveal: false });
    const res = await app.request(`/api/ghost/${ghostToken}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.god).toBe(false);
    // 觀眾視角欄位：role 應被過濾為 null（無底牌），且沒有 GhostView 專屬欄位
    expect(body.players.every((p: { role: string | null }) => p.role === null)).toBe(true);
    expect(body.seerChecks).toBeUndefined();
    expect(body.pendingDeaths).toBeUndefined();
  });

  it('ghostCanReveal=true 時回全知視角：god:true、有底牌', async () => {
    const { app, ghostToken } = setup({ ghostCanReveal: true });
    const res = await app.request(`/api/ghost/${ghostToken}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.god).toBe(true);
    expect(body.canReveal).toBe(true);
    expect(body.players.every((p: { role: string | null }) => typeof p.role === 'string')).toBe(true);
  });

  it('陰間模式未開啟（ghostEnabled=false）：連結一律 404', async () => {
    const { app, ghostToken } = setup({ ghostEnabled: false });
    const res = await app.request(`/api/ghost/${ghostToken}`);
    expect(res.status).toBe(404);
  });
});

describe('聊天分房隔離', () => {
  it('陰間房訊息不出現在觀戰端聊天列表', async () => {
    const { app, watchToken, ghostToken } = setup();
    const post = await app.request(`/api/ghost/${ghostToken}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
      body: JSON.stringify({ nick: '死者甲', text: '陰間哈囉', scope: 'ghost' }),
    });
    expect(post.status).toBe(201);

    const watchHist = await app.request(`/api/watch/${watchToken}/chat`);
    const watchBody = await watchHist.json();
    expect(watchBody.messages).toEqual([]);

    const ghostHist = await app.request(`/api/ghost/${ghostToken}/chat?scope=ghost`);
    const ghostBody = await ghostHist.json();
    expect(ghostBody.messages).toHaveLength(1);
    expect(ghostBody.messages[0]).toMatchObject({ nick: '死者甲', text: '陰間哈囉', scope: 'ghost' });
  });

  it('陽間房訊息透過 ghost 端 POST（scope=watch）能被觀戰端讀到', async () => {
    const { app, watchToken, ghostToken } = setup();
    const post = await app.request(`/api/ghost/${ghostToken}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.2' },
      body: JSON.stringify({ nick: '死者甲', text: '陽間哈囉', scope: 'watch' }),
    });
    expect(post.status).toBe(201);

    const watchHist = await app.request(`/api/watch/${watchToken}/chat`);
    const watchBody = await watchHist.json();
    expect(watchBody.messages).toHaveLength(1);
    expect(watchBody.messages[0]).toMatchObject({ text: '陽間哈囉', scope: 'watch' });
  });

  it('resolveScope 白名單：scope=ai 一律落在 ghost 房，ai 房完全不受影響（防重構回退）', async () => {
    const { app, ghostToken } = setup({}, hashPassword('1234'));

    const post = await app.request(`/api/ghost/${ghostToken}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '3.3.3.3' },
      body: JSON.stringify({ nick: '死者甲', text: '假冒 ai 房', scope: 'ai' }),
    });
    expect(post.status).toBe(201);
    const posted = await post.json();
    expect(posted.scope).toBe('ghost'); // 白名單外一律落 ghost，不是照抄 body.scope

    // GET ?scope=ai 同理讀不到獨立的 ai 房，讀到的是 ghost 房內容
    const getAi = await app.request(`/api/ghost/${ghostToken}/chat?scope=ai`);
    const getAiBody = await getAi.json();
    expect(getAiBody.messages).toHaveLength(1);
    expect(getAiBody.messages[0]).toMatchObject({ text: '假冒 ai 房', scope: 'ghost' });

    // 與明確 scope=ghost 讀到的內容一致，證明兩者是同一間房
    const getGhost = await app.request(`/api/ghost/${ghostToken}/chat?scope=ghost`);
    const getGhostBody = await getGhost.json();
    expect(getGhostBody.messages).toEqual(getAiBody.messages);

    // 真正的 ai 房（GM 規則助手，走 /api/games/:id/ai-chat）完全沒被寫進東西
    const gmAi = await app.request(`/api/games/g1/ai-chat`, { headers: { 'x-room-password': '1234' } });
    expect(gmAi.status).toBe(200);
    const gmAiBody = await gmAi.json();
    expect(gmAiBody.messages).toEqual([]);
  });
});

describe('GM 聊天通道權限與 rate limit', () => {
  it('未帶密碼打 GM 聊天：回 401', async () => {
    const { app } = setup({}, hashPassword('1234'));
    const get = await app.request(`/api/games/g1/chat`);
    expect(get.status).toBe(401);

    const post = await app.request(`/api/games/g1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope: 'ghost', text: 'GM 說話' }),
    });
    expect(post.status).toBe(401);
  });

  it('帶正確密碼可讀寫 GM 聊天', async () => {
    const { app } = setup({}, hashPassword('1234'));
    const post = await app.request(`/api/games/g1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-room-password': '1234' },
      body: JSON.stringify({ scope: 'ghost', text: 'GM 說話' }),
    });
    expect(post.status).toBe(201);
    const msg = await post.json();
    expect(msg.isGm).toBe(true);
    expect(msg.nick).toBe('GM');

    const get = await app.request(`/api/games/g1/chat`, {
      headers: { 'x-room-password': '1234' },
    });
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.ghost).toHaveLength(1);
    expect(body.watch).toEqual([]);
  });

  it('GM 發言免 rate limit：連續兩則皆成功（同一秒內）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const { app } = setup({}, hashPassword('1234'));

    const first = await app.request(`/api/games/g1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-room-password': '1234' },
      body: JSON.stringify({ scope: 'ghost', text: '第一則' }),
    });
    expect(first.status).toBe(201);

    const second = await app.request(`/api/games/g1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-room-password': '1234' },
      body: JSON.stringify({ scope: 'ghost', text: '第二則' }),
    });
    expect(second.status).toBe(201);
  });
});
