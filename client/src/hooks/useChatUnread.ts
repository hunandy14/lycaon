import { useEffect, useState } from 'react';
import { api, type ChatScope } from '../api';

const POLL_MS = 5000;

const seenKey = (key: string) => `lycaon:seen:${key}`;

type UnreadArgs =
  | { gm?: false; base: 'watch' | 'ghost'; token: string; scope?: ChatScope }
  | { gm: true; gameId: string; scope: ChatScope };

/** 未讀數（跨 ChatFab 各房共用）：輪詢訊息列表，比對 localStorage(lycaon:seen:<key>) 記的
 *  「最後已讀訊息 id」。面板開啟中視為持續已讀（游標跟著推到最新、回傳 0）；關閉時回傳
 *  id 大於已讀游標的訊息數。key 依房間分開（base+token+scope 或 gm+gameId+scope）。
 *  enabled=false 時完全不輪詢（例如聊天室未開啟時不必打 API）。 */
export function useChatUnread(args: UnreadArgs, open: boolean, enabled = true): number {
  const gm = args.gm === true;
  const scope: ChatScope = args.scope ?? 'watch';
  const base = !gm ? args.base : undefined;
  const token = !gm ? args.token : undefined;
  const gameId = gm ? args.gameId : undefined;
  const key = gm ? `gm:${gameId}:${scope}` : `${base}:${token}:${scope}`;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const messages = gm ? (await api.getGmChat(gameId!))[scope] : await api.getChat(base!, token!, scope);
        if (cancelled) return;
        const seen = Number(localStorage.getItem(seenKey(key)) ?? 0);
        if (open) {
          const latestId = messages.reduce((m, x) => Math.max(m, x.id), 0);
          if (latestId > seen) localStorage.setItem(seenKey(key), String(latestId));
          setUnread(0);
        } else {
          setUnread(messages.filter((m) => m.id > seen).length);
        }
      } catch {
        // 未讀徽章非關鍵功能，靜默失敗即可
      }
    };
    void refresh();
    const iv = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [gm, gameId, base, token, scope, key, open, enabled]);

  return unread;
}
