import { useState } from 'react';
import { activeCandidates, electionVoters, type SeatId } from '@lycaon/engine';
import { SeatGrid } from '../components/SeatGrid';
import { VoteRecorder } from '../components/VoteRecorder';
import { InterruptBar } from './InterruptBar';
import { seatText } from '../ui/seatText';
import type { PanelProps } from './types';

export function SheriffPanel(props: PanelProps) {
  const { state } = props;
  const election = state.election!;
  const nominating = election.candidates.length === 0;

  return (
    <div>
      <SeatGrid state={state} />
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">🎖️ 警長競選</div>
        {nominating ? <NominateStep {...props} /> : <ElectionStep {...props} />}
      </div>
      <InterruptBar {...props} allowKnight={false} />
    </div>
  );
}

function NominateStep({ state, dispatch, busy }: PanelProps) {
  const [picked, setPicked] = useState<SeatId[]>([]);
  const alive = state.players.filter((p) => p.alive).map((p) => p.seat);
  const toggle = (s: SeatId) => setPicked((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s].sort((a, b) => a - b)));

  return (
    <div>
      <div className="panel-hint">勾選上警（參選警長）的玩家。</div>
      <div className="checklist">
        {alive.map((s) => (
          <button key={s} className={`check-seat ${picked.includes(s) ? 'on' : ''}`} onClick={() => toggle(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="actionbar">
        <button className="btn grow" disabled={busy} onClick={() => dispatch({ type: 'SHERIFF_ELECTION_SKIPPED' })}>
          無人上警・跳過
        </button>
        <button className="btn btn-primary grow" disabled={busy || picked.length === 0} onClick={() => dispatch({ type: 'SHERIFF_NOMINATED', candidates: picked })}>
          確認上警（{picked.length}）
        </button>
      </div>
    </div>
  );
}

function ElectionStep({ state, dispatch, busy }: PanelProps) {
  const election = state.election!;
  const active = activeCandidates(state);
  const voters = electionVoters(state);
  const isPk = !!election.pkSeats;

  // 競選人 ≤ 1：無需投票，直接定案
  if (active.length <= 1) {
    return (
      <div>
        <div className="todo-card">
          {active.length === 1 ? <>僅 <b>{seatText(state, active[0]!)}</b> 一人競選，直接當選。</> : '無人競選，本局無警長。'}
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => dispatch({ type: 'SHERIFF_VOTED', ballots: [] })}>
          確認
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="panel-hint">
        {isPk ? 'PK 輪：' : ''}競選人：{active.map((s) => `${s}號`).join('、')}
      </div>
      <div className="row row-wrap" style={{ gap: 6, marginBottom: 10 }}>
        {active.map((s) => (
          <button key={s} className="pill" disabled={busy} onClick={() => dispatch({ type: 'SHERIFF_WITHDRAWN', seat: s })}>
            {s} 號退水
          </button>
        ))}
      </div>
      <VoteRecorder
        state={state}
        voters={voters}
        targets={active}
        storageKey={`sheriff:${state.day}:${election.round}`}
        weightOf={() => 1}
        busy={busy}
        submitLabel="結算警長票"
        onSubmit={(ballots) => dispatch({ type: 'SHERIFF_VOTED', ballots })}
      />
    </div>
  );
}
