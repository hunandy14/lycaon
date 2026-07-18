/**
 * 對局變更通知中樞（單進程內存版；PM2 為 fork 單實例，見 ecosystem.config.cjs）。
 * append/undo/redo/分享設定變更時 notify update，觀戰端 SSE 收到後重新拉取過濾快照。
 * 聊天訊息另走 notifyChat，觀戰端 SSE 收到後直接 append（不重拉快照）。
 */
import type { ChatMessage } from './db';

export type LiveEvent = { kind: 'update' } | { kind: 'chat'; message: ChatMessage };

type Listener = (event: LiveEvent) => void;

const subs = new Map<string, Set<Listener>>();

export function subscribe(gameId: string, fn: Listener): () => void {
  let set = subs.get(gameId);
  if (!set) subs.set(gameId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) subs.delete(gameId);
  };
}

function emit(gameId: string, event: LiveEvent): void {
  const set = subs.get(gameId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      // 個別監聽者失敗不影響其他人
    }
  }
}

export function notify(gameId: string): void {
  emit(gameId, { kind: 'update' });
}

export function notifyChat(gameId: string, message: ChatMessage): void {
  emit(gameId, { kind: 'chat', message });
}
