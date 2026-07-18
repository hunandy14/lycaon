import { useEffect, useRef, useState } from 'react';
import { api, type ChatMessage } from '../api';
import { Toast } from './Toast';

const NICK_KEY = 'lycaon:chatnick';
/** 判定「貼底」的容許誤差（px）：捲動位置在底部這個範圍內才視為要跟著自動捲動 */
const STICK_THRESHOLD = 40;

/** 觀戰頁聊天訊息時間 HH:MM */
const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 觀戰頁聊天室：GET 歷史 + SSE append；暱稱存 localStorage，首次送出前詢問。
 *  disabled：同樂已關閉（GM 中途關掉）時停用輸入，但保留已載入的歷史訊息可看。 */
export function WatchChat({ token, live, disabled }: { token: string; live: boolean; disabled?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nick, setNick] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 使用者是否貼在底部（上捲查看歷史時不搶捲動） */
  const stickRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void api.getChat(token).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const es = new EventSource(`/api/watch/${token}/stream`);
    es.addEventListener('chat', (ev) => {
      try {
        const msg = JSON.parse((ev as MessageEvent).data) as ChatMessage;
        setMessages((prev) => [...prev, msg]);
      } catch {
        // 忽略解析失敗
      }
    });
    return () => es.close();
  }, [token]);

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
    const trimmedNick = nick.trim();
    const trimmedText = text.trim();
    if (trimmedNick.length < 1 || trimmedNick.length > 12) return;
    if (trimmedText.length < 1 || trimmedText.length > 200) return;
    setSending(true);
    try {
      localStorage.setItem(NICK_KEY, trimmedNick);
      stickRef.current = true;
      await api.sendChat(token, trimmedNick, trimmedText);
      setText('');
    } catch (e) {
      setErr((e as Error).message || '送出失敗，請稍後再試');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel chat-panel" style={{ marginTop: 10, marginBottom: 30 }}>
      <div className="panel-title" style={{ fontSize: '0.95rem' }}>
        💬 聊天室 {live && !disabled ? <span className="live-dot on">●</span> : null}
        {disabled && <span className="small faint" style={{ marginLeft: 6 }}>（同樂已關閉，僅供查看）</span>}
      </div>
      <div ref={listRef} className="chat-list" onScroll={handleScroll}>
        {messages.length === 0 && <p className="faint small center">還沒有人說話，來當第一個吧</p>}
        {messages.map((m) => (
          <div key={m.id} className="chat-row">
            <span className="chat-nick">{m.nick}</span>
            <span className="chat-text">{m.text}</span>
            <span className="chat-time">{fmtTime(m.createdAt)}</span>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="text-input chat-nick-input"
          placeholder="暱稱"
          maxLength={12}
          value={nick}
          disabled={disabled}
          onChange={(e) => setNick(e.target.value)}
        />
        <input
          className="text-input chat-text-input"
          placeholder={disabled ? '聊天室已停用' : '說點什麼…'}
          maxLength={200}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={disabled || sending || !nick.trim() || !text.trim()}
          onClick={() => void send()}
        >
          送出
        </button>
      </div>
      <Toast message={err} onClose={() => setErr(null)} />
    </section>
  );
}
