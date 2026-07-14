import { phaseLabel, type GameState } from '@lycaon/engine';

interface Props {
  state: GameState;
  redoCount: number;
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
}

const STAGE_LABEL: Record<string, string> = {
  sheriff: '警長競選',
  announce: '公佈死訊',
  speech: '發言・投票',
  pk: 'PK 投票',
  dayEnd: '等待天黑',
};

export function PhaseBanner({ state, redoCount, busy, onUndo, onRedo, canUndo }: Props) {
  const isNight = state.phase.t === 'night';
  const sub =
    state.phase.t === 'night'
      ? '天黑請閉眼'
      : state.phase.t === 'day'
        ? STAGE_LABEL[state.phase.stage] ?? ''
        : state.phase.t === 'setup'
          ? '準備開局'
          : '對局結束';
  return (
    <div className="banner">
      <div className="banner-row">
        <div className="grow">
          <div className={`banner-phase ${isNight ? 'banner-night' : 'banner-day'}`}>
            {isNight ? '🌙 ' : state.phase.t === 'day' ? '☀️ ' : ''}
            {phaseLabel(state)}
          </div>
          <div className="banner-sub">{sub}</div>
        </div>
        <button className="btn btn-sm btn-ghost" disabled={!canUndo || busy} onClick={onUndo} title="撤銷上一步">
          ↶ 撤銷
        </button>
        <button className="btn btn-sm btn-ghost" disabled={redoCount === 0 || busy} onClick={onRedo} title="重做">
          ↷
        </button>
      </div>
    </div>
  );
}
