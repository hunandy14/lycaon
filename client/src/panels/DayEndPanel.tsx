import { SeatGrid } from '../components/SeatGrid';
import type { PanelProps } from './types';

export function DayEndPanel({ state, dispatch, busy }: PanelProps) {
  return (
    <div>
      <SeatGrid state={state} />
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">🌇 白天結束</div>
        <div className="panel-hint">今天的流程已完成，準備進入第 {state.day + 1} 夜。</div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => dispatch({ type: 'DAY_ENDED' })}>
          🌙 進入下一夜
        </button>
      </div>
    </div>
  );
}
