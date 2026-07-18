import { useEffect, useRef, useState } from 'react';
import { api, type ChatMessage, type ChatScope } from '../api';
import { Toast } from './Toast';

const NICK_KEY = 'lycaon:chatnick';
/** 判定「貼底」的容許誤差（px）：捲動位置在底部這個範圍內才視為要跟著自動捲動 */
const STICK_THRESHOLD = 40;
/** GM 模式沒有 SSE（checkAuth 只認 x-room-password 標頭，EventSource 無法自訂標頭），改輪詢 */
const GM_POLL_MS = 3000;

/** 聊天訊息時間 HH:MM */
const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

type ChatRoomProps =
  | {
      /** 觀戰/陰間端：base='watch' 走 /api/watch（同樂邀請連結），base='ghost' 走 /api/ghost 並帶 scope 分房。 */
      gm?: false;
      token: string;
      base?: 'watch' | 'ghost';
      scope?: ChatScope;
      live: boolean;
      disabled?: boolean;
    }
  | {
      /** GM 監看／發言：走 /api/games/:id/chat（需房主密碼）；免暱稱、固定顯示暱稱 'GM'。 */
      gm: true;
      gameId: string;
      scope: ChatScope;
    };

/** 聊天室內容層（訊息列表＋輸入列＋SSE/輪詢同步＋暱稱 localStorage＋黏底捲動＋GM 徽章＋錯誤 Toast）。
 *  不含外框標題／關閉鈕（那些由 ChatFab 面板提供）。從 WatchChat.tsx 抽出，GmChatSheet.tsx 的
 *  GM 輪詢邏輯併入為 gm=true 分支。 */
export function ChatRoom(props: ChatRoomProps) {
  const gm = props.gm === true;
  const scope: ChatScope = props.scope ?? 'watch';
  const base = !gm ? props.base ?? 'watch' : undefined;
  const token = !gm ? props.token : undefined;
  const gameId = gm ? props.gameId : undefined;
  const live = !gm && props.live;
  const disabled = !gm && !!props.disabled;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nick, setNick] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 使用者是否貼在底部（上捲查看歷史時不搶捲動） */
  const stickRef = useRef(true);

  // 載入歷史 + 同步：非 gm 一次性 GET（SSE 另開 effect 補即時更新）；gm 改定時輪詢兩者皆有
  useEffect(() => {
    if (gm) {
      let cancelled = false;
      const refresh = async () => {
        try {
          const r = await api.getGmChat(gameId!);
          if (!cancelled) setMessages(r[scope]);
        } catch (e) {
          if (!cancelled) setErr((e as Error).message);
        }
      };
      void refresh();
      const iv = setInterval(() => void refresh(), GM_POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(iv);
      };
    }

    let cancelled = false;
    void api.getChat(base!, token!, scope).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });
    return () => {
      cancelled = true;
    };
  }, [gm, gameId, base, token, scope]);

  useEffect(() => {
    if (gm) return;
    const es = new EventSource(`/api/${base}/${token}/stream`);
    es.addEventListener('chat', (ev) => {
      try {
        const msg = JSON.parse((ev as MessageEvent).data) as ChatMessage;
        if (msg.scope !== scope) return; // 陰間 stream 兩房皆轉發，這裡篩出自己這間
        setMessages((prev) => [...prev, msg]);
      } catch {
        // 忽略解析失敗
      }
    });
    return () => es.close();
  }, [gm, base, token, scope]);

  useEffect(() => {
    if (stickRef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  };

  const send = async () => {
    if (disabled) return;
    const trimmedText = text.trim();
    if (trimmedText.length < 1 || trimmedText.length > 200) return;
    setSending(true);
    try {
      stickRef.current = true;
      if (gm) {
        await api.sendGmChat(gameId!, scope, trimmedText);
      } else {
        const trimmedNick = nick.trim();
        if (trimmedNick.length < 1 || trimmedNick.length > 12) {
          setSending(false);
          return;
        }
        localStorage.setItem(NICK_KEY, trimmedNick);
        await api.sendChat(base!, token!, trimmedNick, trimmedText, scope);
      }
      setText('');
    } catch (e) {
      setErr((e as Error).message || '送出失敗，請稍後再試');
    } finally {
      setSending(false);
    }
  };

  const canSend = !disabled && !sending && !!text.trim() && (gm || !!nick.trim());

  return (
    <div className="chat-room">
      {live && !disabled && <span className="chat-room-live live-dot on">●</span>}
      {disabled && <p className="faint small" style={{ marginBottom: 6 }}>（同樂已關閉，僅供查看）</p>}
      <div ref={listRef} className="chat-list" onScroll={handleScroll}>
        {messages.length === 0 && <p className="faint small center">還沒有人說話，來當第一個吧</p>}
        {messages.map((m) => (
          <div key={m.id} className="chat-row">
            <span className="chat-nick">
              {m.nick}
              {m.isGm && <span className="chip chip-idiot" style={{ marginLeft: 4 }}>GM</span>}
            </span>
            <span className="chat-text">{m.text}</span>
            <span className="chat-time">{fmtTime(m.createdAt)}</span>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        {!gm && (
          <input
            className="text-input chat-nick-input"
            placeholder="暱稱"
            maxLength={12}
            value={nick}
            disabled={disabled}
            onChange={(e) => setNick(e.target.value)}
          />
        )}
        <input
          className="text-input chat-text-input"
          placeholder={disabled ? '聊天室已停用' : gm ? `以 GM 身分發言到${scope === 'ghost' ? '陰間' : '陽間'}…` : '說點什麼…'}
          maxLength={200}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
        />
        <button className="btn btn-primary btn-sm" disabled={!canSend} onClick={() => void send()}>
          送出
        </button>
      </div>
      <Toast message={err} onClose={() => setErr(null)} />
    </div>
  );
}
