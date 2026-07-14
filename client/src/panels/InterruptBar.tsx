import { useState } from 'react';
import { eligibleTargets, type SeatId } from '@lycaon/engine';
import { PickSheet } from '../components/PickSheet';
import type { PanelProps } from './types';

/**
 * 白天可隨時插入的中斷事件：狼人自爆（sheriff/speech 階段）、騎士決鬥（僅 speech）。
 */
export function InterruptBar({ state, dispatch, busy, allowKnight }: PanelProps & { allowKnight: boolean }) {
  const [sheet, setSheet] = useState<'explode' | 'duel' | null>(null);

  const knight = state.players.find((p) => p.role === 'knight');
  const knightAvailable = allowKnight && knight?.alive && !knight.skillUsed;
  const anyWolfAlive = eligibleTargets(state, 'explode').length > 0;

  return (
    <>
      <div className="interrupt-bar">
        {anyWolfAlive && (
          <button className="btn btn-danger" disabled={busy} onClick={() => setSheet('explode')}>
            💥 狼人自爆
          </button>
        )}
        {knightAvailable && (
          <button className="btn" disabled={busy} onClick={() => setSheet('duel')} style={{ borderColor: 'var(--god)', color: 'var(--god)' }}>
            ⚔️ 騎士決鬥
          </button>
        )}
      </div>

      {sheet === 'explode' && (
        <PickSheet
          state={state}
          title="狼人自爆"
          hint="選擇自爆的狼人；自爆後立即進入黑夜。白狼王自爆可再帶走一人。"
          eligible={eligibleTargets(state, 'explode')}
          confirmLabel="確認自爆"
          danger
          onCancel={() => setSheet(null)}
          onConfirm={(seat) => {
            if (seat !== null) dispatch({ type: 'WOLF_EXPLODED', seat });
            setSheet(null);
          }}
        />
      )}

      {sheet === 'duel' && knight && (
        <PickSheet
          state={state}
          title="騎士決鬥"
          hint="騎士翻牌指定一人決鬥：對方是狼→對方出局並立即天黑；對方是好人→騎士殉職。"
          eligible={eligibleTargets(state, 'duel')}
          confirmLabel="確認決鬥"
          onCancel={() => setSheet(null)}
          onConfirm={(seat) => {
            if (seat !== null) dispatch({ type: 'KNIGHT_DUELED', knight: knight.seat, target: seat as SeatId });
            setSheet(null);
          }}
        />
      )}
    </>
  );
}
