import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ChatMessage, type ChatScope } from '../api';
import { Toast } from './Toast';

/** 每輪對局的「上次開窗時間」，供未讀紅點判斷（GamePage 與此 sheet 共用同一把 key） */
export const chatSeenKey = (id: string) => `lycaon:chatseen:${id}`;

const POLL_MS = 3000;

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** GM 聊天監看底部彈窗：陰間／陽間雙分頁，GM 發言帶金色徽章、免暱稱（固定 'GM'）。
 *  沒有走 SSE——checkAuth 只認 x-room-password 標頭，EventSource 無法自訂標頭，故改用輪詢
 *  （單一 GET /chat 一次回兩房，開窗期間每 3 秒刷新一次）。 */
export function GmChatSheet({
  id,
  initialScope = 'ghost',
  onClose,
}: {
  id: string;
  initialScope?: ChatScope;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ChatScope>(initialScope);
  const [byScope, setByScope] = useState<{ watch: ChatMessage[]; ghost: ChatMessage[] }>({ watch: [], ghost: [] });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api.getGmChat(id);
      setByScope(r);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(iv);
  }, [refresh]);

  // 開窗即視為已讀
  useEffect(() => {
    localStorage.setItem(chatSeenKey(id), new Date().toISOString());
  }, [id]);

  const messages = byScope[tab];

  useEffect(() => {
    if (stickRef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const send = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 1 || trimmed.length > 200) return;
    setSending(true);
    try {
      stickRef.current = true;
      await api.sendGmChat(id, tab, trimmed);
      setText('');
      void refresh();
    } catch (e) {
      setErr((e as Error).message || '送出失敗，請稍後再試');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">💬 聊天監看</div>

        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <button className={`btn btn-sm grow ${tab === 'ghost' ? 'btn-primary' : ''}`} onClick={() => setTab('ghost')}>
            👻 陰間
          </button>
          <button className={`btn btn-sm grow ${tab === 'watch' ? 'btn-primary' : ''}`} onClick={() => setTab('watch')}>
            ☀️ 陽間
          </button>
        </div>

        <div ref={listRef} className="chat-list" onScroll={handleScroll}>
          {messages.length === 0 && <p className="faint small center">還沒有人說話</p>}
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
            placeholder={`以 GM 身分發言到${tab === 'ghost' ? '陰間' : '陽間'}…`}
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
          />
          <button className="btn btn-primary btn-sm" disabled={sending || !text.trim()} onClick={() => void send()}>
            送出
          </button>
        </div>

        <button className="btn btn-block" style={{ marginTop: 14 }} onClick={onClose}>關閉</button>
        <Toast message={err} onClose={() => setErr(null)} />
      </div>
    </div>
  );
}
