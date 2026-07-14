import { useEffect, useState } from 'react';
import { fmtCount, tally, type Ballot, type GameState, type SeatId } from '@lycaon/engine';

interface Props {
  state: GameState;
  voters: SeatId[];
  targets: SeatId[];
  storageKey: string;
  weightOf: (voter: SeatId) => number;
  busy: boolean;
  submitLabel: string;
  onSubmit: (ballots: Ballot[]) => void;
}

type Choice = SeatId | 'abstain' | undefined;
type Mode = 'cluster' | 'matrix';

/** 目標配色（唱票模式的票流標籤；索引依 targets 順序） */
const TARGET_COLORS = ['#7c5cff', '#38bdf8', '#fbbf24', '#4ade80', '#f472b6', '#fb923c', '#a3e635', '#22d3ee'];

export function VoteRecorder({ state, voters, targets, storageKey, weightOf, busy, submitLabel, onSubmit }: Props) {
  const [choices, setChoices] = useState<Record<number, Choice>>(() => loadDraft(storageKey));
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('lycaon:voteMode') as Mode) ?? 'cluster');
  const [activeTarget, setActiveTarget] = useState<SeatId | null>(null);

  useEffect(() => {
    saveDraft(storageKey, choices);
  }, [storageKey, choices]);

  const switchMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem('lycaon:voteMode', m);
  };

  const targetColor = (t: SeatId) => TARGET_COLORS[targets.indexOf(t) % TARGET_COLORS.length]!;

  // 已表態（含明確棄票）的選票；未表態在結算時自動補為棄票
  const recorded = voters.filter((v) => choices[v] !== undefined);
  const unrecorded = voters.filter((v) => choices[v] === undefined);
  const ballots: Ballot[] = recorded.map((v) => ({ voter: v, target: choices[v] === 'abstain' ? null : (choices[v] as SeatId) }));
  const result = tally(ballots, weightOf);

  const clear = () => {
    setChoices({});
    setActiveTarget(null);
  };

  const submit = () => {
    // 未表態自動補明確棄票，讓事件流留下每個人的表態（覆盤用）
    const full: Ballot[] = voters.map((v) => ({
      voter: v,
      target: choices[v] === undefined || choices[v] === 'abstain' ? null : (choices[v] as SeatId),
    }));
    onSubmit(full);
    clearDraft(storageKey);
    setChoices({});
    setActiveTarget(null);
  };

  return (
    <div>
      <div className="seg" role="tablist">
        <button className={`seg-btn ${mode === 'cluster' ? 'on' : ''}`} onClick={() => switchMode('cluster')}>
          👆 唱票
        </button>
        <button className={`seg-btn ${mode === 'matrix' ? 'on' : ''}`} onClick={() => switchMode('matrix')}>
          ☰ 表格
        </button>
      </div>

      {mode === 'cluster' ? (
        <ClusterInput
          state={state}
          voters={voters}
          targets={targets}
          choices={choices}
          setChoices={setChoices}
          activeTarget={activeTarget}
          setActiveTarget={setActiveTarget}
          targetColor={targetColor}
        />
      ) : (
        <MatrixInput state={state} voters={voters} targets={targets} choices={choices} setChoices={setChoices} />
      )}

      <div className="tally">
        {result.counts.size === 0 ? (
          <span className="faint small">尚未記票（{recorded.length}/{voters.length}）</span>
        ) : (
          [...result.counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([seat, n]) => (
              <span key={seat} className="tally-item" style={{ borderColor: targetColor(seat) }}>
                {seat} 號 <b style={{ color: targetColor(seat) }}>{fmtCount(n)}</b>
                {result.top.includes(seat) ? ' 🔺' : ''}
              </span>
            ))
        )}
      </div>

      {unrecorded.length > 0 && (
        <div className="faint small" style={{ marginBottom: 8 }}>
          未表態（結算視為棄票）：{unrecorded.join('、')}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <button className="btn btn-sm grow" onClick={clear}>清除重記</button>
      </div>
      <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={submit}>
        {submitLabel}
      </button>
    </div>
  );
}

/** 唱票模式：先點被投者（唱票對象），再逐個點出手勢投他的人 */
function ClusterInput({
  state,
  voters,
  targets,
  choices,
  setChoices,
  activeTarget,
  setActiveTarget,
  targetColor,
}: {
  state: GameState;
  voters: SeatId[];
  targets: SeatId[];
  choices: Record<number, Choice>;
  setChoices: React.Dispatch<React.SetStateAction<Record<number, Choice>>>;
  activeTarget: SeatId | null;
  setActiveTarget: (t: SeatId | null) => void;
  targetColor: (t: SeatId) => string;
}) {
  const picking = activeTarget === null;
  const seats = state.players.filter((p) => p.alive).map((p) => p.seat);

  const tapSeat = (seat: SeatId) => {
    if (picking) {
      if (targets.includes(seat)) setActiveTarget(seat);
      return;
    }
    if (!voters.includes(seat)) return;
    setChoices((prev) => ({ ...prev, [seat]: prev[seat] === activeTarget ? undefined : activeTarget }));
  };

  return (
    <div>
      <div className="cluster-bar">
        {picking ? (
          <span className="muted">點選<b>被投的人</b>（唱票對象）</span>
        ) : (
          <>
            <span>
              🎯 唱票對象：<b style={{ color: targetColor(activeTarget) }}>{activeTarget} 號</b>
              <span className="muted small">　點出手勢投他的人</span>
            </span>
            <button className="btn btn-sm" onClick={() => setActiveTarget(null)}>換對象</button>
          </>
        )}
      </div>
      <div className="cluster-grid">
        {seats.map((seat) => {
          const c = choices[seat];
          const isTargetable = picking && targets.includes(seat);
          const isVotable = !picking && voters.includes(seat);
          const disabled = picking ? !isTargetable : !isVotable && seat !== activeTarget;
          const votedFor = typeof c === 'number' ? c : null;
          return (
            <button
              key={seat}
              className={[
                'cl-cell',
                seat === activeTarget ? 'cl-active-target' : '',
                votedFor !== null ? 'cl-voted' : '',
                disabled ? 'cl-disabled' : '',
              ].join(' ')}
              style={
                {
                  '--tcolor': seat === activeTarget ? targetColor(seat) : votedFor !== null ? targetColor(votedFor) : 'var(--border)',
                } as React.CSSProperties
              }
              disabled={disabled && seat !== activeTarget}
              onClick={() => tapSeat(seat)}
            >
              <span className="cl-num">
                {seat}
                {state.sheriff === seat ? '★' : ''}
              </span>
              {seat === activeTarget ? (
                <span className="cl-badge" style={{ color: targetColor(seat) }}>🎯</span>
              ) : votedFor !== null ? (
                <span className="cl-badge" style={{ color: targetColor(votedFor) }}>→{votedFor}</span>
              ) : c === 'abstain' ? (
                <span className="cl-badge faint">棄</span>
              ) : (
                <span className="cl-badge faint">·</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 表格模式：每位投票者一列，逐票點選（總覽清晰、可微調任何一票） */
function MatrixInput({
  state,
  voters,
  targets,
  choices,
  setChoices,
}: {
  state: GameState;
  voters: SeatId[];
  targets: SeatId[];
  choices: Record<number, Choice>;
  setChoices: React.Dispatch<React.SetStateAction<Record<number, Choice>>>;
}) {
  const set = (voter: SeatId, c: Choice) =>
    setChoices((prev) => ({ ...prev, [voter]: prev[voter] === c ? undefined : c }));

  return (
    <div style={{ maxHeight: '38vh', overflowY: 'auto', marginBottom: 8 }}>
      {voters.map((v) => (
        <div key={v} className="vote-voter">
          <span className="vote-voter-label">{v} 號{state.sheriff === v ? ' ★' : ''}</span>
          <div className="vote-targets">
            {targets.map((t) => (
              <button key={t} className={`vote-chip ${choices[v] === t ? 'sel' : ''}`} onClick={() => set(v, t)}>
                {t}
              </button>
            ))}
            <button className={`vote-chip abstain ${choices[v] === 'abstain' ? 'sel' : ''}`} onClick={() => set(v, 'abstain')}>
              棄
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- 草稿存 localStorage（斷線/誤觸重整不丟失）----
function loadDraft(key: string): Record<number, Choice> {
  try {
    return JSON.parse(localStorage.getItem(`vote:${key}`) ?? '{}');
  } catch {
    return {};
  }
}
function saveDraft(key: string, v: Record<number, Choice>) {
  try {
    localStorage.setItem(`vote:${key}`, JSON.stringify(v));
  } catch {
    /* 忽略 */
  }
}
function clearDraft(key: string) {
  try {
    localStorage.removeItem(`vote:${key}`);
  } catch {
    /* 忽略 */
  }
}
