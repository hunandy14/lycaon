import { useState } from 'react';
import type { GameState, SeatId } from '@lycaon/engine';
import { SeatGrid } from './SeatGrid';

interface Props {
  state: GameState;
  title: string;
  hint?: string;
  eligible: SeatId[];
  confirmLabel: string;
  danger?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  onConfirm: (seat: SeatId | null) => void;
  onCancel: () => void;
}

/** 底部彈出的單一座位選擇器（開槍、決鬥、自爆、警徽移交共用） */
export function PickSheet({ state, title, hint, eligible, confirmLabel, danger, allowNone, noneLabel, onConfirm, onCancel }: Props) {
  const [sel, setSel] = useState<SeatId | null>(null);
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">{title}</div>
        {hint && <div className="panel-hint">{hint}</div>}
        <SeatGrid state={state} eligible={eligible} selected={sel !== null ? [sel] : []} onPick={setSel} />
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn grow" onClick={onCancel}>取消</button>
          {allowNone && (
            <button className="btn grow" onClick={() => onConfirm(null)}>{noneLabel ?? '不選'}</button>
          )}
          <button
            className={`btn grow ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={sel === null}
            onClick={() => onConfirm(sel)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
