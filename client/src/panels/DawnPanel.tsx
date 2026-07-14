import { buildDawnAnnouncement } from '@lycaon/engine';
import { SeatGrid } from '../components/SeatGrid';
import type { PanelProps } from './types';

export function DawnPanel({ state, dispatch, busy }: PanelProps) {
  const text = buildDawnAnnouncement(state);
  const pendingSeats = [...new Set(state.pendingDeaths.map((d) => d.seat))].sort((a, b) => a - b);

  return (
    <div>
      <SeatGrid
        state={state}
        markers={Object.fromEntries(pendingSeats.map((s) => [s, <span key={s} className="chip chip-pending">昨夜死亡</span>]))}
      />
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">📢 公佈死訊</div>
        <div className="announce">{text}</div>
        <div className="panel-hint" style={{ marginTop: 10 }}>照著唸給玩家聽，然後按下公佈。</div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => dispatch({ type: 'DEATHS_ANNOUNCED' })}>
          公佈死訊
        </button>
      </div>
    </div>
  );
}
