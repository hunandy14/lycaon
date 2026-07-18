import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { PhaseBanner } from '../components/PhaseBanner';
import { StatusBar } from '../components/StatusBar';
import { ShareSheet } from '../components/ShareSheet';
import { UnlockGate } from '../components/UnlockGate';
import { Toast } from '../components/Toast';
import { PhasePanel } from '../panels/PhasePanel';
import { useWakeLock } from '../hooks/useWakeLock';
import { api } from '../api';
import { GmChatSheet, chatSeenKey } from '../components/GmChatSheet';

export function GamePage() {
  const { id = '' } = useParams();
  const g = useGame(id);
  const [shareOpen, setShareOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAvailable, setChatAvailable] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
  useWakeLock(g.state?.phase.t !== 'ended');

  useEffect(() => {
    if (g.state?.config.title) document.title = `${g.state.config.title} · 狼人殺 GM`;
  }, [g.state?.config.title]);

  // 陽間或陰間聊天室啟用時才顯示監看入口；順便用兩房最新訊息時間判斷未讀紅點
  useEffect(() => {
    if (!g.state) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const info = await api.getShare(id);
        const available = info.settings.showChat || info.settings.ghostEnabled;
        if (cancelled) return;
        setChatAvailable(available);
        if (!available) {
          setChatUnread(false);
          return;
        }
        const chat = await api.getGmChat(id);
        if (cancelled) return;
        const latest = [...chat.watch, ...chat.ghost].reduce<string | null>(
          (acc, m) => (!acc || m.createdAt > acc ? m.createdAt : acc),
          null,
        );
        const seen = localStorage.getItem(chatSeenKey(id));
        setChatUnread(!!latest && (!seen || latest > seen));
      } catch {
        // 靜默失敗：聊天監看是輔助功能，不擋主流程
      }
    };
    void poll();
    const iv = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [id, g.state]);

  if (g.loading) return <div className="app"><p className="center muted" style={{ marginTop: 60 }}>載入對局中…</p></div>;
  if (g.needPassword) return <UnlockGate busy={g.busy} error={g.error} onUnlock={g.unlock} />;
  if (!g.state) {
    return (
      <div className="app">
        <p className="center muted" style={{ marginTop: 60 }}>{g.error ?? '找不到對局'}</p>
        <Link to="/" className="btn btn-block" style={{ marginTop: 16 }}>← 回首頁</Link>
      </div>
    );
  }

  const state = g.state;
  const canUndo = g.envelopes.length > 1; // 保留建局事件

  return (
    <div className="app">
      <PhaseBanner
        state={state}
        redoCount={g.redoCount}
        busy={g.busy}
        onUndo={() => g.undo()}
        onRedo={() => g.redo()}
        canUndo={canUndo}
      />
      <StatusBar state={state} />

      <PhasePanel state={state} dispatch={g.dispatch} busy={g.busy} />

      <div className="row" style={{ marginTop: 20, justifyContent: 'center', gap: 16 }}>
        <button className="btn btn-ghost btn-sm faint" onClick={() => setShareOpen(true)}>📡 同樂</button>
        {chatAvailable && (
          <button
            className="btn btn-ghost btn-sm faint"
            onClick={() => {
              setChatUnread(false);
              setChatOpen(true);
            }}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <MessageCircle size={15} /> 聊天
            {chatUnread && (
              <span
                aria-label="有新訊息"
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--danger)',
                }}
              />
            )}
          </button>
        )}
        <Link to={`/game/${id}/timeline`} className="btn btn-ghost btn-sm faint">📜 時間軸</Link>
        <Link to="/" className="btn btn-ghost btn-sm faint">🏠 首頁</Link>
      </div>

      {shareOpen && <ShareSheet id={id} onClose={() => setShareOpen(false)} />}
      {chatOpen && <GmChatSheet id={id} onClose={() => setChatOpen(false)} />}
      <Toast message={g.error} onClose={g.clearError} />
    </div>
  );
}
