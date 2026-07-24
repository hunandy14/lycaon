import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { openDb, EventStore } from '../src/db';
import { gamesRoutes } from '../src/routes/games';
import { hashPassword } from '../src/auth';
import { aiEnabled, askAi } from '../src/ai';
import { DEFAULT_RULES, type GameConfig } from '@lycaon/engine';

// AI 上游整組 mock：aiEnabled 預設 true、askAi 回固定字串（各測試可覆寫）
vi.mock('../src/ai', () => ({
  aiEnabled: vi.fn(() => true),
  askAi: vi.fn(async () => 'AI 的固定回覆'),
}));

const config: GameConfig = {
  playerCount: 6,
  seats: (['seer', 'witch', 'villager', 'villager', 'werewolf', 'werewolf'] as const).map((role, i) => ({
    seat: i + 1,
    role,
  })),
  rules: { ...DEFAULT_RULES, sheriffEnabled: false },
};

const NOW = '2026-01-01T00:00:00.000Z';
const PW = '1234';

function setup() {
  const store = new EventStore(openDb(':memory:'));
  store.createGame('g1', 'test', JSON.stringify(config), NOW, hashPassword(PW));
  store.append('g1', { type: 'GAME_CREATED', config }, NOW);
  const app = new Hono();
  app.route('/api/games', gamesRoutes(store));
  return { store, app };
}

function post(app: Hono, text: string, withPassword = true) {
  return app.request('/api/games/g1/ai-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withPassword ? { 'x-room-password': PW } : {}),
    },
    body: JSON.stringify({ text }),
  });
}

beforeEach(() => {
  vi.clearAllMocks(); // 清呼叫紀錄，讓每則測試的 toHaveBeenCalled 斷言獨立
  vi.mocked(aiEnabled).mockReturnValue(true);
  vi.mocked(askAi).mockResolvedValue('AI 的固定回覆');
});

describe('AI 規則問答', () => {
  it('POST：GM 問題與 AI 回覆各存一則 scope=ai（nick/isGm 正確），回傳 question+reply', async () => {
    const { app, store } = setup();
    const res = await post(app, '女巫可以自救嗎？');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.question).toMatchObject({ nick: 'GM', isGm: true, scope: 'ai', text: '女巫可以自救嗎？' });
    expect(body.reply).toMatchObject({ nick: 'AI', isGm: false, scope: 'ai', text: 'AI 的固定回覆' });

    const hist = store.listChat('g1', 'ai', 200);
    expect(hist).toHaveLength(2);
    expect(hist[0]).toMatchObject({ nick: 'GM', isGm: true });
    expect(hist[1]).toMatchObject({ nick: 'AI', isGm: false });
    // 不外溢到觀戰/陰間房
    expect(store.listChat('g1', 'watch', 200)).toEqual([]);
    expect(store.listChat('g1', 'ghost', 200)).toEqual([]);
  });

  it('POST：送給 askAi 的 messages 首則為 system（含戰況），末則為 user（GM 問題）', async () => {
    const { app } = setup();
    await post(app, '守衛能連守嗎？');
    const messages = vi.mocked(askAi).mock.calls[0]![0];
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toContain('【目前戰況】');
    expect(messages[0]!.content).toContain('【引擎原始碼】');
    expect(messages.at(-1)).toMatchObject({ role: 'user', content: '守衛能連守嗎？' });
  });

  it('GET：回傳 enabled 與歷史訊息', async () => {
    const { app } = setup();
    await post(app, '第一問');
    const res = await app.request('/api/games/g1/ai-chat', { headers: { 'x-room-password': PW } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toMatchObject({ nick: 'GM', text: '第一問' });
  });

  it('未帶密碼：GET/POST 皆 401', async () => {
    const { app } = setup();
    const get = await app.request('/api/games/g1/ai-chat');
    expect(get.status).toBe(401);
    const p = await post(app, '哈囉', false);
    expect(p.status).toBe(401);
  });

  it('text 空字串或超過 500 字：回 400 且不入歷史', async () => {
    const { app, store } = setup();
    const empty = await post(app, '   ');
    expect(empty.status).toBe(400);
    const tooLong = await post(app, 'a'.repeat(501));
    expect(tooLong.status).toBe(400);
    expect(store.listChat('g1', 'ai', 200)).toEqual([]);
    expect(vi.mocked(askAi)).not.toHaveBeenCalled();
  });

  it('AI 未設定（aiEnabled=false）：POST 回 503 且問題不入歷史、GET enabled=false', async () => {
    vi.mocked(aiEnabled).mockReturnValue(false);
    const { app, store } = setup();
    const res = await post(app, '女巫可以自救嗎？');
    expect(res.status).toBe(503);
    expect(store.listChat('g1', 'ai', 200)).toEqual([]);

    const get = await app.request('/api/games/g1/ai-chat', { headers: { 'x-room-password': PW } });
    const body = await get.json();
    expect(body.enabled).toBe(false);
  });

  it('AI 上游失敗（askAi throw）：POST 回 502，GM 問題已入歷史', async () => {
    vi.mocked(askAi).mockRejectedValue(new Error('AI 上游回應 500：boom'));
    const { app, store } = setup();
    const res = await post(app, '守衛能連守嗎？');
    expect(res.status).toBe(502);
    const hist = store.listChat('g1', 'ai', 200);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ nick: 'GM', isGm: true, text: '守衛能連守嗎？' });
  });
});
