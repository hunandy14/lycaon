import type { Context } from 'hono';

/**
 * 聊天共用小工具：watch/ghost（未來 GM）路由共用同一套 rate limit 與 IP 取值邏輯。
 * rate limit：同一 key 每 3 秒最多 1 則（單進程 in-memory，同 live.ts 前提）。
 */
export const CHAT_RATE_LIMIT_MS = 3000;
const lastChatAt = new Map<string, number>();

export function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
}

/** true = 命中限制（應回 429）；同時記錄本次時間戳供下一次比對 */
export function rateLimited(key: string): boolean {
  const now = Date.now();
  const last = lastChatAt.get(key);
  if (last !== undefined && now - last < CHAT_RATE_LIMIT_MS) return true;
  lastChatAt.set(key, now);
  return false;
}
