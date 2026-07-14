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

export function VoteRecorder({ state, voters, targets, storageKey, weightOf, busy, submitLabel, onSubmit }: Props) {
  const [choices, setChoices] = useState<Record<number, Choice>>(() => loadDraft(storageKey));

  useEffect(() => {
    saveDraft(storageKey, choices);
  }, [storageKey, choices]);

  const set = (voter: SeatId, c: Choice) => setChoices((prev) => ({ ...prev, [voter]: prev[voter] === c ? undefined : c }));
  const allAbstain = () => setChoices(Object.fromEntries(voters.map((v) => [v, 'abstain' as Choice])));
  const clear = () => setChoices({});

  const ballots: Ballot[] = voters
    .filter((v) => choices[v] !== undefined)
    .map((v) => ({ voter: v, target: choices[v] === 'abstain' ? null : (choices[v] as SeatId) }));

  const result = tally(ballots, weightOf);
  const votedCount = ballots.length;

  const submit = () => {
    onSubmit(ballots);
    clearDraft(storageKey);
    setChoices({});
  };

  return (
    <div>
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

      <div className="tally">
        {result.counts.size === 0 ? (
          <span className="faint small">尚未記錄票數（{votedCount}/{voters.length}）</span>
        ) : (
          [...result.counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([seat, n]) => (
              <span key={seat} className="tally-item">
                {seat} 號 <b>{fmtCount(n)}</b>{result.top.includes(seat) && result.top.length >= 1 ? ' 🔺' : ''}
              </span>
            ))
        )}
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <button className="btn btn-sm grow" onClick={allAbstain}>全部棄票</button>
        <button className="btn btn-sm grow" onClick={clear}>清除</button>
      </div>
      <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={submit}>
        {submitLabel}
      </button>
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
