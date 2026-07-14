import { useState } from 'react';
import { eligibleTargets, exileVoters } from '@lycaon/engine';
import { SeatGrid } from '../components/SeatGrid';
import { VoteRecorder } from '../components/VoteRecorder';
import { InterruptBar } from './InterruptBar';
import { SpeechTimer } from '../components/SpeechTimer';
import type { PanelProps } from './types';

export function VotePanel(props: PanelProps) {
  const { state, dispatch, busy } = props;
  const isPk = state.phase.t === 'day' && state.phase.stage === 'pk';
  const [voting, setVoting] = useState(false);

  const voters = exileVoters(state);
  const targets = eligibleTargets(state, 'exile');

  return (
    <div>
      <SeatGrid state={state} />

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">{isPk ? '⚖️ PK 投票' : '🗣️ 發言・放逐投票'}</div>

        {isPk && (
          <div className="todo-card">PK 台上：{state.exile?.pkSeats?.map((s) => `${s} 號`).join(' vs ')}，台上玩家不可投票。</div>
        )}

        {!voting ? (
          <>
            {!isPk && <SpeechTimer />}
            <div className="panel-hint">發言結束後，開始記錄放逐投票。</div>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => setVoting(true)}>
              開始記錄投票
            </button>
          </>
        ) : (
          <>
            <div className="panel-hint">記錄放逐投票（警長 1.5 票）：唱票＝先點被投者再點出手勢的人；表格＝逐人總覽微調。</div>
            <VoteRecorder
              state={state}
              voters={voters}
              targets={targets}
              storageKey={`exile:${state.day}:${isPk ? 'pk' : 'r1'}`}
              weightOf={(v) => (state.sheriff === v ? 1.5 : 1)}
              busy={busy}
              submitLabel="結算放逐票"
              onSubmit={(ballots) => {
                setVoting(false);
                dispatch({ type: 'EXILE_VOTED', ballots });
              }}
            />
            <button className="btn btn-ghost btn-sm btn-block faint" style={{ marginTop: 8 }} onClick={() => setVoting(false)}>
              返回發言
            </button>
          </>
        )}
      </div>

      {!voting && !isPk && <InterruptBar {...props} allowKnight />}
    </div>
  );
}
