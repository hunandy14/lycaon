import { useState } from 'react';
import { eligibleTargets, roleName } from '@lycaon/engine';
import { SeatGrid } from '../components/SeatGrid';
import { PickSheet } from '../components/PickSheet';
import { seatText } from '../ui/seatText';
import type { PanelProps } from './types';

const SHOOT_LABEL = { hunter: '獵人開槍', blackWolfKing: '黑狼王發動技能', whiteWolfExplode: '白狼王自爆帶人' } as const;

export function ResolvePanel({ state, dispatch, busy }: PanelProps) {
  const [shooting, setShooting] = useState(false);
  const [badging, setBadging] = useState(false);
  const head = state.actionQueue[0]!;

  return (
    <div>
      <SeatGrid state={state} />
      <div className="panel" style={{ marginTop: 14 }}>
        {head.kind === 'lastWords' && (
          <>
            <div className="panel-title">🕯️ 遺言</div>
            <div className="todo-card">請 <b>{seatText(state, head.seat)}</b>【{roleName(state.players.find((p) => p.seat === head.seat)!.role)}】發表遺言。</div>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => dispatch({ type: 'LAST_WORDS_DONE', seat: head.seat })}>
              遺言結束
            </button>
          </>
        )}

        {head.kind === 'shoot' && (
          <>
            <div className="panel-title">🔫 {SHOOT_LABEL[head.via]}</div>
            <div className="todo-card">
              <b>{seatText(state, head.seat)}</b>【{roleName(state.players.find((p) => p.seat === head.seat)!.role)}】
              {head.via === 'whiteWolfExplode' ? '自爆，可帶走一人。' : '出局，可翻牌開槍帶走一人。'}
            </div>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => setShooting(true)}>
              選擇目標
            </button>
          </>
        )}

        {head.kind === 'badge' && (
          <>
            <div className="panel-title">🎖️ 警徽移交</div>
            <div className="todo-card">警長出局，選擇移交警徽的對象，或撕毀警徽。</div>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => setBadging(true)}>
              移交／撕毀警徽
            </button>
          </>
        )}

        {state.actionQueue.length > 1 && (
          <div className="faint small center" style={{ marginTop: 10 }}>
            還有 {state.actionQueue.length - 1} 項待處理
          </div>
        )}
      </div>

      {shooting && head.kind === 'shoot' && (
        <PickSheet
          state={state}
          title={SHOOT_LABEL[head.via]}
          hint={`${seatText(state, head.seat)} 選擇帶走的對象`}
          eligible={eligibleTargets(state, 'shoot')}
          confirmLabel="開槍帶走"
          danger
          allowNone
          noneLabel="放棄開槍"
          onCancel={() => setShooting(false)}
          onConfirm={(seat) => {
            setShooting(false);
            dispatch({ type: 'SHOT_FIRED', shooter: head.seat, target: seat });
          }}
        />
      )}

      {badging && head.kind === 'badge' && (
        <PickSheet
          state={state}
          title="警徽移交"
          hint="選擇繼任警長，或撕毀警徽（本局不再有警長）"
          eligible={eligibleTargets(state, 'badge')}
          confirmLabel="移交警徽"
          allowNone
          noneLabel="撕毀警徽"
          onCancel={() => setBadging(false)}
          onConfirm={(seat) => {
            setBadging(false);
            dispatch({ type: 'BADGE_TRANSFERRED', to: seat });
          }}
        />
      )}
    </div>
  );
}
