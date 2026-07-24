import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bot, Ghost, MessageCircle } from 'lucide-react';
import { useGame } from '../hooks/useGame';
import { PhaseBanner } from '../components/PhaseBanner';
import { StatusBar } from '../components/StatusBar';
import { ShareSheet } from '../components/ShareSheet';
import { UnlockGate } from '../components/UnlockGate';
import { Toast } from '../components/Toast';
import { PhasePanel } from '../panels/PhasePanel';
import { useWakeLock } from '../hooks/useWakeLock';
import type { ShareSettings } from '@lycaon/engine';
import { api } from '../api';
import { ChatFab } from '../components/ChatFab';
import { ChatRoom } from '../components/ChatRoom';
import { useChatUnread } from '../hooks/useChatUnread';
import { GhostSheet } from '../components/GhostSheet';

export function GamePage() {
  const { id = '' } = useParams();
  const g = useGame(id);
  const [shareOpen, setShareOpen] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [openChat, setOpenChat] = useState<'ghost' | 'watch' | 'ai' | null>(null);
  const [shareSettings, setShareSettings] = useState<ShareSettings | null>(null);
  useWakeLock(g.state?.phase.t !== 'ended');

  useEffect(() => {
    if (g.state?.config.title) document.title = `${g.state.config.title} · 狼人殺 GM`;
  }, [g.state?.config.title]);

  // 陽間或陰間聊天球是否顯示，取決於同樂設定（showChat/ghostEnabled）；輪詢跟原本一致（15 秒）
  useEffect(() => {
    if (!g.state) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const info = await api.getShare(id);
        if (!cancelled) setShareSettings(info.settings);
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

  const ghostChatAvailable = !!shareSettings?.ghostEnabled;
  const watchChatAvailable = !!shareSettings?.showChat;
  const ghostUnread = useChatUnread({ gm: true, gameId: id, scope: 'ghost' }, openChat === 'ghost', ghostChatAvailable);
  const watchUnread = useChatUnread({ gm: true, gameId: id, scope: 'watch' }, openChat === 'watch', watchChatAvailable);
  // AI 規則助手球永遠顯示（不受同樂/陰間開關影響），疊在其他已顯示的聊天球之上；GM 自己發起的對話不需要未讀徽章
  const aiSlot = (ghostChatAvailable ? 1 : 0) + (watchChatAvailable ? 1 : 0);

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
        <button className="btn btn-ghost btn-sm faint" onClick={() => setGhostOpen(true)}>👻 陰間</button>
        <Link to={`/game/${id}/timeline`} className="btn btn-ghost btn-sm faint">📜 時間軸</Link>
        <Link to="/" className="btn btn-ghost btn-sm faint">🏠 首頁</Link>
      </div>

      {shareOpen && <ShareSheet id={id} onClose={() => setShareOpen(false)} />}
      {ghostOpen && <GhostSheet id={id} onClose={() => setGhostOpen(false)} />}
      <Toast message={g.error} onClose={g.clearError} />

      {ghostChatAvailable && (
        <ChatFab
          icon={Ghost}
          label="陰間聊天室（GM）"
          accent="#a78bfa"
          unread={ghostUnread}
          open={openChat === 'ghost'}
          onToggle={() => setOpenChat((v) => (v === 'ghost' ? null : 'ghost'))}
          slot={0}
        >
          <ChatRoom gm gameId={id} scope="ghost" />
        </ChatFab>
      )}
      {watchChatAvailable && (
        <ChatFab
          icon={MessageCircle}
          label="陽間聊天室（GM）"
          accent="var(--accent)"
          unread={watchUnread}
          open={openChat === 'watch'}
          onToggle={() => setOpenChat((v) => (v === 'watch' ? null : 'watch'))}
          slot={ghostChatAvailable ? 1 : 0}
        >
          <ChatRoom gm gameId={id} scope="watch" />
        </ChatFab>
      )}
      <ChatFab
        icon={Bot}
        label="AI 規則助手"
        accent="#14b8a6"
        open={openChat === 'ai'}
        onToggle={() => setOpenChat((v) => (v === 'ai' ? null : 'ai'))}
        slot={aiSlot}
        size="lg"
      >
        <ChatRoom ai gameId={id} />
      </ChatFab>
    </div>
  );
}
