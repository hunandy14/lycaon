import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGame } from '../hooks/useGame';
import { PhaseBanner } from '../components/PhaseBanner';
import { StatusBar } from '../components/StatusBar';
import { Toast } from '../components/Toast';
import { PhasePanel } from '../panels/PhasePanel';
import { useWakeLock } from '../hooks/useWakeLock';

export function GamePage() {
  const { id = '' } = useParams();
  const g = useGame(id);
  useWakeLock(g.state?.phase.t !== 'ended');

  useEffect(() => {
    if (g.state?.config.title) document.title = `${g.state.config.title} · 狼人殺 GM`;
  }, [g.state?.config.title]);

  if (g.loading) return <div className="app"><p className="center muted" style={{ marginTop: 60 }}>載入對局中…</p></div>;
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
        <Link to={`/game/${id}/timeline`} className="btn btn-ghost btn-sm faint">📜 時間軸</Link>
        <Link to="/" className="btn btn-ghost btn-sm faint">🏠 首頁</Link>
      </div>

      <Toast message={g.error} onClose={g.clearError} />
    </div>
  );
}
