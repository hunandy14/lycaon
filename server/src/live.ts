/**
 * 對局變更通知中樞（單進程內存版；PM2 為 fork 單實例，見 ecosystem.config.cjs）。
 * append/undo/redo/分享設定變更時 notify，觀戰端 SSE 收到後重新拉取過濾快照。
 */
type Listener = () => void;

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

export function notify(gameId: string): void {
  const set = subs.get(gameId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      // 個別監聽者失敗不影響其他人
    }
  }
}
