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

/** 上游 SSE 單塊（OpenAI 相容 chat.completion.chunk）中我們唯一在乎的欄位 */
type UpstreamChunk = { choices?: { delta?: { content?: unknown } }[] };

/**
 * 串流呼叫上游對話補全（stream:true，標準 OpenAI SSE：`data: {...}` 逐塊、`data: [DONE]` 結尾），
 * 以 async generator 逐塊 yield content delta。錯誤語義：非 2xx / 逾時（AbortController 60s 全程預算）/
 * 全程無任何內容皆 throw，錯誤訊息絕不含 token。可傳外部 signal（如 client 斷線）提前中止上游。
 */
export async function* askAiStream(
  messages: AiMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  const base = process.env.AI_BASE_URL;
  const token = process.env.AI_TOKEN;
  const model = process.env.AI_MODEL;
  if (!base || !token || !model) throw new Error('AI 尚未設定');

  const url = `${base.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });
  if (signal?.aborted) controller.abort();

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: controller.signal,
      });
    } catch (e) {
      // AbortError 的原生訊息是英文且無資訊量，統一轉成人類可讀繁中（不含 token）
      if (controller.signal.aborted) throw new Error('AI 回應逾時或已中止');
      throw e;
    }

    if (!res.ok) {
      // 回應本文可能含上游錯誤描述（但絕不含我方 token）；截前 200 字方便 GM 排錯
      const body = await res.text().catch(() => '');
      throw new Error(`AI 上游回應 ${res.status}：${body.slice(0, 200)}`);
    }
    if (!res.body) throw new Error('AI 上游未回傳串流本文');

    // 解析 SSE：以行為單位累積 buffer，只認 `data:` 行；[DONE] 即收尾
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let sawContent = false;
    try {
      readLoop: while (true) {
        let chunk: Awaited<ReturnType<typeof reader.read>>;
        try {
          chunk = await reader.read();
        } catch (e) {
          if (controller.signal.aborted) throw new Error('AI 回應逾時或已中止');
          throw e;
        }
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') break readLoop;
          let parsed: UpstreamChunk;
          try {
            parsed = JSON.parse(payload) as UpstreamChunk;
          } catch {
            continue; // 單塊解析失敗直接略過（上游偶發雜訊不至於整段報廢）
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta !== '') {
            sawContent = true;
            yield delta;
          }
        }
      }
    } finally {
      // 無論收到 [DONE]、傳輸層 EOF 還是中止/例外，都要 cancel 底層 reader：
      // [DONE] 只是應用層標記，此時 fetch stream 尚未讀到 EOF，不 cancel 會讓 undici 連線
      // 留在半讀狀態、無法歸還連線池（每次成功問答洩漏一條上游連線）。cancel 對已收尾的 stream 是安全 no-op。
      await reader.cancel().catch(() => {});
    }
    if (!sawContent) throw new Error('AI 回應缺少內容');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}
