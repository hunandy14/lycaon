import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { openDb, EventStore } from '../src/db';
import { gamesRoutes } from '../src/routes/games';
import { hashPassword } from '../src/auth';
import { aiEnabled, askAiStream } from '../src/ai';
import { DEFAULT_RULES, type GameConfig } from '@lycaon/engine';

// AI 上游整組 mock：aiEnabled 預設 true、askAiStream 為 async generator 逐塊 yield（各測試可覆寫）
vi.mock('../src/ai', () => ({
  aiEnabled: vi.fn(() => true),
  askAiStream: vi.fn(),
}));

/** 讓 mock 的 askAiStream 逐塊 yield 指定字串（模擬上游 SSE delta） */
function mockStream(...chunks: string[]) {
  vi.mocked(askAiStream).mockImplementation(async function* () {
    for (const c of chunks) yield c;
  });
}

/** 串流回應事件型別（與 routes/games.ts 的 AiStreamEvent 對齊；測試端自行宣告驗證協議） */
type StreamEvent =
  | { t: 'delta'; text: string }
  | { t: 'done'; question: Record<string, unknown>; reply: Record<string, unknown> }
  | { t: 'error'; message: string };

/** 讀完整串流本文並解析 NDJSON（一行一事件）；同時保證 server 端串流 callback 已跑完 */
async function readEvents(res: Response): Promise<StreamEvent[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as StreamEvent);
}

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
  mockStream('AI 的', '固定回覆');
});

describe('AI 規則問答（串流）', () => {
  it('POST：NDJSON 串流——delta 拼接=完整回覆，done 附已落庫的 question+reply，DB 存全文', async () => {
    const { app, store } = setup();
    const res = await post(app, '女巫可以自救嗎？');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('ndjson');

    const events = await readEvents(res);
    const deltas = events.filter((e): e is Extract<StreamEvent, { t: 'delta' }> => e.t === 'delta');
    expect(deltas.map((e) => e.text).join('')).toBe('AI 的固定回覆');
    const last = events.at(-1)!;
    expect(last.t).toBe('done');
    if (last.t !== 'done') throw new Error('unreachable');
    expect(last.question).toMatchObject({ nick: 'GM', isGm: true, scope: 'ai', text: '女巫可以自救嗎？' });
    expect(last.reply).toMatchObject({ nick: 'AI', isGm: false, scope: 'ai', text: 'AI 的固定回覆' });

    // DB 語義不變：問題先存、AI 全文串流完成後才落庫（永遠是完整訊息）
    const hist = store.listChat('g1', 'ai', 200);
    expect(hist).toHaveLength(2);
    expect(hist[0]).toMatchObject({ nick: 'GM', isGm: true });
    expect(hist[1]).toMatchObject({ nick: 'AI', isGm: false, text: 'AI 的固定回覆' });
    // 不外溢到觀戰/陰間房
    expect(store.listChat('g1', 'watch', 200)).toEqual([]);
    expect(store.listChat('g1', 'ghost', 200)).toEqual([]);
  });

  it('POST：送給 askAiStream 的 messages 首則為 system（含戰況），末則為 user（GM 問題）', async () => {
    const { app } = setup();
    await readEvents(await post(app, '守衛能連守嗎？'));
    const messages = vi.mocked(askAiStream).mock.calls[0]![0];
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toContain('【目前戰況】');
    expect(messages[0]!.content).toContain('【引擎原始碼】');
    expect(messages.at(-1)).toMatchObject({ role: 'user', content: '守衛能連守嗎？' });
  });

  it('GET：回傳 enabled 與歷史訊息', async () => {
    const { app } = setup();
    await readEvents(await post(app, '第一問'));
    const res = await app.request('/api/games/g1/ai-chat', { headers: { 'x-room-password': PW } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toMatchObject({ nick: 'GM', text: '第一問' });
  });

  it('未帶密碼：GET/POST 皆 401（非串流 JSON 短路）', async () => {
    const { app } = setup();
    const get = await app.request('/api/games/g1/ai-chat');
    expect(get.status).toBe(401);
    const p = await post(app, '哈囉', false);
    expect(p.status).toBe(401);
  });

  it('text 空字串或超過 500 字：回 400 且不入歷史（非串流 JSON 短路）', async () => {
    const { app, store } = setup();
    const empty = await post(app, '   ');
    expect(empty.status).toBe(400);
    const tooLong = await post(app, 'a'.repeat(501));
    expect(tooLong.status).toBe(400);
    expect(store.listChat('g1', 'ai', 200)).toEqual([]);
    expect(vi.mocked(askAiStream)).not.toHaveBeenCalled();
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

  it('AI 上游開場即失敗：以 error 事件收尾（繁中訊息），GM 問題已入歷史、無 AI 訊息落庫', async () => {
    vi.mocked(askAiStream).mockImplementation(async function* () {
      throw new Error('AI 上游回應 500：boom');
      yield ''; // 讓 TS 認得這是 generator（實際不會執行）
    });
    const { app, store } = setup();
    const res = await post(app, '守衛能連守嗎？');
    expect(res.status).toBe(200); // 串流已開，錯誤以事件表達
    const events = await readEvents(res);
    expect(events.at(-1)).toMatchObject({ t: 'error', message: 'AI 回應失敗：AI 上游回應 500：boom' });

    const hist = store.listChat('g1', 'ai', 200);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ nick: 'GM', isGm: true, text: '守衛能連守嗎？' });
  });

  it('AI 上游中途失敗（已吐部分 delta）：error 事件收尾、半截回覆不落庫', async () => {
    vi.mocked(askAiStream).mockImplementation(async function* () {
      yield '前半段';
      throw new Error('上游斷線');
    });
    const { app, store } = setup();
    const events = await readEvents(await post(app, '獵人被毒能開槍嗎？'));
    // 已下發的 delta 存在，但最後以 error 收尾
    expect(events[0]).toMatchObject({ t: 'delta', text: '前半段' });
    expect(events.at(-1)).toMatchObject({ t: 'error', message: 'AI 回應失敗：上游斷線' });
    // DB：只有問題，沒有半截 AI 訊息
    const hist = store.listChat('g1', 'ai', 200);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ nick: 'GM', isGm: true });
  });

  it('前一問上游失敗留下孤兒提問：下一問組出的對話仍嚴格 user/assistant 交替（孤兒被丟棄、不會卡死）', async () => {
    const { app, store } = setup();
    // 第一問：上游失敗 → 問題留在歷史成孤兒（沒有對應 assistant 回覆）
    vi.mocked(askAiStream).mockImplementationOnce(async function* () {
      throw new Error('boom');
      yield '';
    });
    const first = await post(app, '第一問（會失敗）');
    const firstEvents = await readEvents(first);
    expect(firstEvents.at(-1)!.t).toBe('error');
    expect(store.listChat('g1', 'ai', 200)).toHaveLength(1);

    // 第二問：上游恢復 → 應成功且不因孤兒破壞交替
    const secondEvents = await readEvents(await post(app, '第二問（成功）'));
    expect(secondEvents.at(-1)!.t).toBe('done');

    // 檢查第二次送給 askAiStream 的 messages：system 起頭、其後嚴格交替、不得出現連續兩則 user
    const messages = vi.mocked(askAiStream).mock.calls.at(-1)![0];
    expect(messages[0]!.role).toBe('system');
    for (let i = 1; i < messages.length - 1; i++) {
      expect(messages[i]!.role).not.toBe(messages[i + 1]!.role);
    }
    // 最後一則為最新問題；孤兒舊問題不再參與送出的對話
    expect(messages.at(-1)).toMatchObject({ role: 'user', content: '第二問（成功）' });
    expect(messages.some((m) => m.content === '第一問（會失敗）')).toBe(false);
  });
});
