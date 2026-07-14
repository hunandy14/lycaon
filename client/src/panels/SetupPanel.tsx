import { SeatGrid } from '../components/SeatGrid';
import type { PanelProps } from './types';

export function SetupPanel({ state, dispatch, busy }: PanelProps) {
  return (
    <div>
      <SeatGrid state={state} />
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">🌙 準備開始</div>
        <div className="panel-hint">確認每位玩家已看過自己的身分牌，按下開始第一夜。</div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => dispatch({ type: 'NIGHT_STARTED' })}>
          天黑請閉眼，開始第一夜
        </button>
      </div>
    </div>
  );
}
