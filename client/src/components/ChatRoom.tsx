import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, SendHorizontal } from 'lucide-react';
import { api, roomPass, type ChatMessage, type ChatScope } from '../api';
import { Toast } from './Toast';

const NICK_KEY = 'lycaon:chatnick';
/** NickChip 改名時廣播，讓同頁所有 ChatRoom 同步拿到新暱稱 */
const NICK_EVENT = 'lycaon-nick-changed';

/** 暱稱 chip（放在 ChatFab 標題列）：顯示目前暱稱，點了原地改，存 localStorage 全站共用 */
export function NickChip() {
  const [nick, setNick] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = () => {
    setDraft(nick);
    setEditing(true);
  };
  const save = () => {
    const v = draft.trim().slice(0, 12);
    setEditing(false);
    if (!v || v === nick) return;
    setNick(v);
    localStorage.setItem(NICK_KEY, v);
    window.dispatchEvent(new Event(NICK_EVENT));
  };

  if (editing) {
    return (
      <span className="fab-nick fab-nick-editing">
        <input
          className="fab-nick-input"
          autoFocus
          maxLength={12}
          placeholder="你的暱稱"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <button type="button" className="fab-nick-btn" aria-label="儲存暱稱" onMouseDown={(e) => e.preventDefault()} onClick={save}>
          <Check size={14} />
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={`fab-nick ${nick ? '' : 'fab-nick-empty'}`} onClick={start} aria-label="修改暱稱">
      {nick || '取個暱稱'}
      <Pencil size={12} />
    </button>
  );
}
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
      ai?: false;
      token: string;
      base?: 'watch' | 'ghost';
      scope?: ChatScope;
      live: boolean;
      disabled?: boolean;
    }
  | {
      /** GM 監看／發言：走 /api/games/:id/chat（需房主密碼）；免暱稱、固定顯示暱稱 'GM'。 */
      gm: true;
      ai?: false;
      gameId: string;
      scope: ChatScope;
    }
  | {
      /** GM × AI 規則助手：走 /api/games/:id/ai-chat（需房主密碼）。GM 提問、AI 回覆，無暱稱列、無 SSE/輪詢
       *  （單一寫者，開面板時 GET 一次即可）。與上兩變體差異夠大，實際渲染另開 AiChatRoom。 */
      gm?: false;
      ai: true;
      gameId: string;
    };

/** 聊天室內容層：依 props.ai 分流到 AI 助手模式（見下方 AiChatRoom），其餘沿用觀戰/陰間/GM 監看的既有邏輯。
 *  不含外框標題／關閉鈕（那些由 ChatFab 面板提供）。從 WatchChat.tsx 抽出，GmChatSheet.tsx 的
 *  GM 輪詢邏輯併入為 gm=true 分支。 */
export function ChatRoom(props: ChatRoomProps) {
  if (props.ai === true) return <AiChatRoom gameId={props.gameId} />;
  return <StandardChatRoom {...props} />;
}

type StandardChatRoomProps = Exclude<ChatRoomProps, { ai: true }>;

function StandardChatRoom(props: StandardChatRoomProps) {
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

  // 暱稱在標題列的 NickChip 改（見 NickChip），這裡監聽廣播保持同步
  useEffect(() => {
    const sync = () => setNick(localStorage.getItem(NICK_KEY) ?? '');
    window.addEventListener(NICK_EVENT, sync);
    return () => window.removeEventListener(NICK_EVENT, sync);
  }, []);
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
          setErr('先點右上角取個暱稱');
          setSending(false);
          return;
        }
        await api.sendChat(base!, token!, trimmedNick, trimmedText, scope);
      }
      setText('');
    } catch (e) {
      setErr((e as Error).message || '送出失敗，請稍後再試');
    } finally {
      setSending(false);
    }
  };

  const canSend = !disabled && !sending && !!text.trim();

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
        <button
          className="btn btn-primary btn-sm chat-send-btn"
          disabled={!canSend}
          aria-label="送出"
          onClick={() => void send()}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
      <Toast message={err} onClose={() => setErr(null)} />
    </div>
  );
}

/** 問答文字長度上限（比照 server 契約：trim 後 1–500 字） */
const AI_TEXT_MAX = 500;

/** GM × AI 規則助手（gm=true 的第三變體）：無暱稱列，GM 提問／AI 回覆。無 SSE、無輪詢——單一寫者
 *  （只有 GM 自己會發言），開面板時 GET 一次歷史即可。送出後本地先樂觀顯示提問泡泡＋「思考中…」佔位
 *  （鎖定輸入），成功後用 server 回的 question/reply 取代本地暫存；502/503 失敗時僅移除思考中佔位、
 *  問題泡泡照留（server 502 情況下問題其實已寫入歷史，只是這裡沒有真正 id 可對齊，就地保留顯示即可）。 */
function AiChatRoom({ gameId }: { gameId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const localIdRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    void api
      .getAiChat(gameId, roomPass.get(gameId))
      .then((r) => {
        if (cancelled) return;
        setEnabled(r.enabled);
        setMessages(r.messages);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message || '規則助手載入失敗');
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (stickRef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  };

  const send = async () => {
    if (enabled !== true || sending) return;
    const trimmedText = text.trim();
    if (trimmedText.length < 1 || trimmedText.length > AI_TEXT_MAX) return;
    const localId = localIdRef.current--;
    const localQuestion: ChatMessage = {
      id: localId,
      gameId,
      nick: 'GM',
      text: trimmedText,
      scope: 'ai',
      isGm: true,
      createdAt: new Date().toISOString(),
    };
    stickRef.current = true;
    setMessages((prev) => [...prev, localQuestion]);
    setText('');
    setSending(true);
    try {
      const r = await api.sendAiChat(gameId, roomPass.get(gameId), trimmedText);
      setMessages((prev) => [...prev.filter((m) => m.id !== localId), r.question, r.reply]);
    } catch (e) {
      // 問題泡泡保留：只清「思考中」佔位（由 sending 狀態控制），不移除 localQuestion
      setErr((e as Error).message || 'AI 助手回覆失敗');
    } finally {
      setSending(false);
    }
  };

  const canSend = enabled === true && !sending && !!text.trim() && text.trim().length <= AI_TEXT_MAX;

  if (enabled === false) {
    return <p className="faint small center" style={{ marginTop: 16 }}>AI 助手未設定（見 server/.env.example）</p>;
  }

  return (
    <div className="chat-room ai-chat-room">
      <div ref={listRef} className="chat-list" onScroll={handleScroll}>
        {enabled === null && <p className="faint small center">載入中…</p>}
        {enabled === true && messages.length === 0 && !sending && (
          <p className="faint small center">問點規則問題吧，例如「獵人被毒死能不能開槍？」</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`ai-msg-row ${m.isGm ? 'ai-msg-gm' : 'ai-msg-ai'}`}>
            {!m.isGm && (
              <span className="chip chip-ai ai-msg-badge">
                <span aria-hidden="true">🤖</span> 規則助手
              </span>
            )}
            <span className="ai-msg-bubble">{m.text}</span>
          </div>
        ))}
        {sending && (
          <div className="ai-msg-row ai-msg-ai">
            <span className="chip chip-ai ai-msg-badge">
              <span aria-hidden="true">🤖</span> 規則助手
            </span>
            <span className="ai-msg-bubble ai-msg-thinking">思考中…</span>
          </div>
        )}
      </div>
      <div className="chat-input-row">
        <input
          className="text-input chat-text-input"
          placeholder={enabled === true ? '問點規則問題…' : '規則助手未啟用'}
          maxLength={AI_TEXT_MAX}
          value={text}
          disabled={enabled !== true || sending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
        />
        <button
          className="btn btn-primary btn-sm chat-send-btn"
          disabled={!canSend}
          aria-label="送出"
          onClick={() => void send()}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
      <Toast message={err} onClose={() => setErr(null)} />
    </div>
  );
}
