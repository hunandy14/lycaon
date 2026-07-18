import { Link, useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../hooks/useGame';
import { Toast } from '../components/Toast';
import { UnlockGate } from '../components/UnlockGate';
import type { TimelineEntry } from '@lycaon/engine';

export function TimelinePage() {
  const { id = '' } = useParams();
  const g = useGame(id);
  const nav = useNavigate();

  if (g.loading) return <div className="app"><p className="center muted" style={{ marginTop: 60 }}>載入中…</p></div>;
  if (g.needPassword) return <UnlockGate busy={g.busy} error={g.error} onUnlock={g.unlock} />;
  if (!g.state) return <div className="app"><p className="center muted" style={{ marginTop: 60 }}>找不到對局</p></div>;

  const log = g.state.log;
  const active = g.state.phase.t !== 'ended';

  // 依「天/階段」分組
  const groups: { label: string; entries: TimelineEntry[] }[] = [];
  for (const e of log) {
    const last = groups[groups.length - 1];
    if (!last || last.label !== e.phase) groups.push({ label: e.phase, entries: [e] });
    else last.entries.push(e);
  }

  const revertTo = async (seq: number) => {
    if (!confirm(`回退到第 ${seq} 步之前？這一步及之後的所有操作會被撤銷（可用重做復原）。`)) return;
    await g.undo(seq);
    nav(`/game/${id}`);
  };

  return (
    <div className="app">
      <header className="row" style={{ alignItems: 'center', padding: '14px 0' }}>
        <Link to={`/game/${id}`} className="btn btn-ghost btn-sm">← 返回</Link>
        <h2 className="grow center" style={{ fontSize: '1.1rem' }}>時間軸</h2>
        <Link to={`/game/${id}/report`} className="btn btn-ghost btn-sm">📊 報表</Link>
      </header>

      <div className="timeline">
        {groups.map((grp, gi) => (
          <div key={gi}>
            <div className="tl-day">{grp.label}</div>
            {grp.entries.map((e, i) => (
              <div key={`${e.seq}-${i}`} className="tl-entry">
                <span className="tl-seq">#{e.seq}</span>
                <span className={`tl-text ${e.secret ? 'tl-secret' : ''}`}>{e.text}</span>
                {active && e.seq > 1 && (
                  <button className="btn btn-sm btn-ghost faint tl-revert" onClick={() => revertTo(e.seq)} title="回退到此步之前">
                    ↶
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {log.length === 0 && <p className="center muted" style={{ marginTop: 40 }}>尚無事件</p>}

      <Toast message={g.error} onClose={g.clearError} />
    </div>
  );
}
