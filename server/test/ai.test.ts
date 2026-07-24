import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { askAiStream } from '../src/ai';

/** 組一個最小可用的 SSE 上游回應（一塊 delta + [DONE]），供 fetch mock 回傳 */
function sseResponse(): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: '嗨' } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const ENV_KEYS = ['AI_BASE_URL', 'AI_TOKEN', 'AI_MODEL', 'AI_DISABLE_THINKING'] as const;

describe('askAiStream request body（chat_template_kwargs.enable_thinking）', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.AI_BASE_URL = 'https://example.invalid/v1';
    process.env.AI_TOKEN = 'test-token';
    process.env.AI_MODEL = '@cf/zai-org/glm-4.7-flash';
    delete process.env.AI_DISABLE_THINKING;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
  });

  it('AI_DISABLE_THINKING=1：request body 含 chat_template_kwargs.enable_thinking=false', async () => {
    process.env.AI_DISABLE_THINKING = '1';
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    vi.stubGlobal('fetch', fetchMock);

    const out: string[] = [];
    for await (const delta of askAiStream([{ role: 'user', content: '哈囉' }])) out.push(delta);
    expect(out.join('')).toBe('嗨');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("AI_DISABLE_THINKING='true'：同樣送出 enable_thinking=false", async () => {
    process.env.AI_DISABLE_THINKING = 'true';
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    vi.stubGlobal('fetch', fetchMock);

    const out: string[] = [];
    for await (const delta of askAiStream([{ role: 'user', content: '哈囉' }])) out.push(delta);
    expect(out.join('')).toBe('嗨');

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('未設定 AI_DISABLE_THINKING：request body 不含 chat_template_kwargs 欄位', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    vi.stubGlobal('fetch', fetchMock);

    const out: string[] = [];
    for await (const delta of askAiStream([{ role: 'user', content: '哈囉' }])) out.push(delta);
    expect(out.join('')).toBe('嗨');

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty('chat_template_kwargs');
  });

  it("AI_DISABLE_THINKING 為其他值（如 '0'）：視為未開啟，不送該欄位", async () => {
    process.env.AI_DISABLE_THINKING = '0';
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    vi.stubGlobal('fetch', fetchMock);

    const out: string[] = [];
    for await (const delta of askAiStream([{ role: 'user', content: '哈囉' }])) out.push(delta);
    expect(out.join('')).toBe('嗨');

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty('chat_template_kwargs');
  });
});
