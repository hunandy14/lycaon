import { useEffect, useRef, useState } from 'react';
import { api, type ChatMessage } from '../api';

const NICK_KEY = 'lycaon:chatnick';

/** 觀戰頁聊天訊息時間 HH:MM */
const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 觀戰頁聊天室：GET 歷史 + SSE append；暱稱存 localStorage，首次送出前詢問 */
export function WatchChat({ token, live }: { token: string; live: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nick, setNick] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const trimmedNick = nick.trim();
    const trimmedText = text.trim();
    if (trimmedNick.length < 1 || trimmedNick.length > 12) return;
    if (trimmedText.length < 1 || trimmedText.length > 200) return;
    setSending(true);
    try {
      localStorage.setItem(NICK_KEY, trimmedNick);
      await api.sendChat(token, trimmedNick, trimmedText);
      setText('');
    } catch {
      // 送出失敗（429/400 等）：邊界收尾另做
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel chat-panel" style={{ marginTop: 10, marginBottom: 30 }}>
      <div className="panel-title" style={{ fontSize: '0.95rem' }}>
        💬 聊天室 {live ? <span className="live-dot on">●</span> : null}
      </div>
      <div ref={listRef} className="chat-list">
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
          onChange={(e) => setNick(e.target.value)}
        />
        <input
          className="text-input chat-text-input"
          placeholder="說點什麼…"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
        />
        <button className="btn btn-primary btn-sm" disabled={sending || !nick.trim() || !text.trim()} onClick={() => void send()}>
          送出
        </button>
      </div>
    </section>
  );
}
