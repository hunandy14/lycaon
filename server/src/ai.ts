/**
 * AI 上游呼叫（OpenAI 相容 /chat/completions；定位為 Cloudflare Workers AI 端點）。
 * 金鑰全部來自環境變數（server/.env，gitignored）：AI_BASE_URL / AI_TOKEN / AI_MODEL。
 * 錯誤訊息一律不含 token。
 */

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 三個環境變數齊備才算啟用（缺任一 → 前端顯示未設定、POST 回 503） */
export function aiEnabled(): boolean {
  return !!(process.env.AI_BASE_URL && process.env.AI_TOKEN && process.env.AI_MODEL);
}

const TIMEOUT_MS = 60000;

/** 呼叫上游對話補全；成功回傳 assistant 內容，任何失敗（含非 2xx、逾時、缺內容）皆 throw */
export async function askAi(messages: AiMessage[]): Promise<string> {
  const base = process.env.AI_BASE_URL;
  const token = process.env.AI_TOKEN;
  const model = process.env.AI_MODEL;
  if (!base || !token || !model) throw new Error('AI 尚未設定');

  const url = `${base.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 回應本文可能含上游錯誤描述（但絕不含我方 token）；截前 200 字方便 GM 排錯
    const body = await res.text().catch(() => '');
    throw new Error(`AI 上游回應 ${res.status}：${body.slice(0, 200)}`);
  }

  const data = (await res.json().catch(() => null)) as
    | { choices?: { message?: { content?: unknown } }[] }
    | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('AI 回應缺少內容');
  }
  return content;
}
