import { useState } from 'react';
import { buildNightPlan, currentNightStep, eligibleTargets, ROLE_META, type SeatId } from '@lycaon/engine';
import { SeatGrid } from '../components/SeatGrid';
import { seatText } from '../ui/seatText';
import type { PanelProps } from './types';

const STEP_TITLE = { guard: '🛡️ 守衛', wolves: '🐺 狼人', witch: '🧪 女巫', seer: '🔮 預言家' } as const;
const STEP_HINT = {
  guard: '守衛請睜眼，選擇今晚守護的對象',
  wolves: '狼人請睜眼，選擇擊殺對象',
  witch: '女巫請睜眼',
  seer: '預言家請睜眼，選擇查驗對象',
} as const;

export function NightWizard(props: PanelProps) {
  const { state } = props;
  const plan = buildNightPlan(state);
  const step = currentNightStep(state);
  const activeSteps = plan.filter((s) => s.active);
  const activeIndex = step ? activeSteps.findIndex((s) => s.id === step.id) : activeSteps.length;

  return (
    <div>
      <StepDots total={activeSteps.length} current={activeIndex} />
      {step === null ? (
        <NightComplete {...props} />
      ) : step.id === 'witch' ? (
        <WitchStep {...props} />
      ) : (
        <PickStep {...props} kind={step.id} />
      )}
    </div>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="step-dots">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`step-dot ${i < current ? 'done' : ''} ${i === current ? 'active' : ''}`} />
      ))}
    </div>
  );
}

function PickStep({ state, dispatch, busy, kind }: PanelProps & { kind: 'guard' | 'wolves' | 'seer' }) {
  const [sel, setSel] = useState<SeatId | null>(null);
  const purpose = kind === 'guard' ? 'guard' : kind === 'wolves' ? 'wolfKill' : 'seerCheck';
  const eligible = eligibleTargets(state, purpose);
  const canEmpty = kind === 'guard' || kind === 'wolves'; // 空守 / 空刀

  const confirm = async () => {
    if (kind === 'guard') await dispatch({ type: 'GUARD_ACTED', target: sel });
    else if (kind === 'wolves') await dispatch({ type: 'WOLVES_ACTED', target: sel });
    else if (sel !== null) await dispatch({ type: 'SEER_ACTED', target: sel });
    setSel(null);
  };

  return (
    <div>
      <SeatGrid state={state} eligible={eligible} selected={sel !== null ? [sel] : []} onPick={setSel} />
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">{STEP_TITLE[kind]}</div>
        <div className="panel-hint">{STEP_HINT[kind]}</div>
        {sel !== null && <div className="todo-card">已選擇：<b>{seatText(state, sel)}</b></div>}
        <div className="actionbar">
          {canEmpty && (
            <button className="btn grow" disabled={busy} onClick={() => { setSel(null); dispatch(kind === 'guard' ? { type: 'GUARD_ACTED', target: null } : { type: 'WOLVES_ACTED', target: null }); }}>
              {kind === 'guard' ? '空守' : '空刀'}
            </button>
          )}
          <button className="btn btn-primary grow" disabled={busy || sel === null} onClick={confirm}>
            確認
          </button>
        </div>
      </div>
    </div>
  );
}

function WitchStep({ state, dispatch, busy }: PanelProps) {
  const [poison, setPoison] = useState<SeatId | null>(null);
  const [mode, setMode] = useState<'idle' | 'poison'>('idle');
  const knifed = state.night.wolfTarget;
  const witchSeat = state.config.seats.find((s) => s.role === 'witch')?.seat;

  const canSave = state.potions.antidote && knifed !== null && (() => {
    if (knifed !== witchSeat) return true;
    const r = state.config.rules.witchSelfSave;
    if (r === 'never') return false;
    if (r === 'firstNightOnly') return state.day === 1;
    return true;
  })();

  const eligible = eligibleTargets(state, 'witchPoison');

  const doSave = () => dispatch({ type: 'WITCH_ACTED', save: true, poison: null });
  const doPoison = () => poison !== null && dispatch({ type: 'WITCH_ACTED', save: false, poison });
  const doNothing = () => dispatch({ type: 'WITCH_ACTED', save: false, poison: null });

  return (
    <div>
      <SeatGrid
        state={state}
        eligible={mode === 'poison' ? eligible : []}
        selected={poison !== null ? [poison] : knifed !== null ? [knifed] : []}
        onPick={mode === 'poison' ? setPoison : undefined}
        markers={knifed !== null ? { [knifed]: <span className="chip chip-wolf">今晚被刀</span> } : undefined}
      />
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">🧪 女巫</div>
        <div className="panel-hint">
          {knifed !== null ? <>今晚被刀的是 <b>{seatText(state, knifed)}</b></> : '今晚狼人空刀'}
        </div>

        {mode === 'idle' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <button className="btn btn-lg" disabled={busy || !canSave} onClick={doSave}>
              💊 使用解藥救人 {!state.potions.antidote && '（已用完）'}
            </button>
            <button className="btn btn-lg" disabled={busy || !state.potions.poison} onClick={() => setMode('poison')}>
              ☠️ 使用毒藥 {!state.potions.poison && '（已用完）'}
            </button>
            <button className="btn btn-lg" disabled={busy} onClick={doNothing}>
              不使用藥水
            </button>
          </div>
        ) : (
          <div>
            <div className="todo-card">選擇毒殺對象{poison !== null && <>：<b>{seatText(state, poison)}</b></>}</div>
            <div className="actionbar">
              <button className="btn grow" disabled={busy} onClick={() => { setMode('idle'); setPoison(null); }}>返回</button>
              <button className="btn btn-danger grow" disabled={busy || poison === null} onClick={doPoison}>確認毒殺</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NightComplete({ state, dispatch, busy }: PanelProps) {
  const tonightChecks = state.seerChecks.filter((c) => c.night === state.day);
  const hasSeer = state.config.seats.some((s) => s.role === 'seer');
  return (
    <div>
      <SeatGrid state={state} />
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">🌅 夜晚行動完成</div>
        {tonightChecks.length > 0 ? (
          tonightChecks.map((c) => (
            <div key={c.target} className={`todo-card`} style={{ borderColor: c.result === 'wolf' ? 'var(--wolf)' : 'var(--good)' }}>
              🔮 預言家查驗 <b>{seatText(state, c.target)}</b>：
              <b style={{ color: c.result === 'wolf' ? 'var(--wolf)' : 'var(--good)' }}>
                {c.result === 'wolf' ? ' 狼人 🐺' : ' 好人 ✋'}
              </b>
            </div>
          ))
        ) : hasSeer && state.players.find((p) => p.role === 'seer')?.alive ? (
          <div className="panel-hint">預言家今晚未查驗。</div>
        ) : null}
        <div className="panel-hint">確認所有夜晚行動已完成，天亮進行結算。</div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => dispatch({ type: 'NIGHT_ENDED' })}>
          ☀️ 天亮，結算
        </button>
      </div>
    </div>
  );
}

// 顯示已死角色的走過場提示（保留給未來；目前引擎自動跳過 inactive 步驟）
export function deadRoleHint(state: PanelProps['state']): string[] {
  return buildNightPlan(state)
    .filter((s) => !s.active && s.id !== 'wolves')
    .map((s) => ROLE_META[s.id === 'guard' ? 'guard' : s.id === 'witch' ? 'witch' : 'seer'].name);
}
