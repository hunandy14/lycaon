import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ALL_ROLES,
  BOARD_PRESETS,
  DEFAULT_RULES,
  ROLE_META,
  validateConfig,
  type GameConfig,
  type PresetId,
  type RoleId,
  type RuleConfig,
  type SeatConfig,
} from '@lycaon/engine';
import { api } from '../api';
import { Toast } from '../components/Toast';
import { factionColor } from '../ui/roleStyle';

type Step = 0 | 1 | 2 | 3;

export function NewGamePage() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [presetId, setPresetId] = useState<PresetId>('standard12');
  const [playerCount, setPlayerCount] = useState(12);
  const [seats, setSeats] = useState<SeatConfig[]>(() => presetSeats('standard12', 12));
  const [rules, setRules] = useState<RuleConfig>({ ...DEFAULT_RULES });
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errors = useMemo(() => validateConfig({ playerCount, seats, rules }), [playerCount, seats, rules]);

  const choosePreset = (id: PresetId, count: number) => {
    setPresetId(id);
    setPlayerCount(count);
    setSeats(presetSeats(id, count));
  };

  const setSeatRole = (seat: number, role: RoleId) =>
    setSeats((prev) => prev.map((s) => (s.seat === seat ? { ...s, role } : s)));
  const setSeatName = (seat: number, name: string) =>
    setSeats((prev) => prev.map((s) => (s.seat === seat ? { ...s, name: name || undefined } : s)));

  const submit = async () => {
    if (errors.length > 0) return setErr(errors[0]!);
    setBusy(true);
    try {
      const config: GameConfig = { playerCount, seats, rules, presetId, title: title || undefined };
      const id = await api.createGame(config);
      nav(`/game/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '建立失敗');
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <WizardHeader step={step} onBack={() => (step === 0 ? nav('/') : setStep((step - 1) as Step))} />

      {step === 0 && (
        <section>
          <h2 style={{ marginBottom: 12 }}>選擇板子</h2>
          {BOARD_PRESETS.map((p) => (
            <button
              key={p.id}
              className="card"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginBottom: 10,
                borderColor: presetId === p.id ? 'var(--accent)' : 'var(--border)',
                background: presetId === p.id ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-card))' : 'var(--bg-card)',
              }}
              onClick={() => choosePreset(p.id, p.playerCount)}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{p.name}</div>
              <div className="row row-wrap" style={{ gap: 4 }}>
                {roleTally(p.roles).map(([role, n]) => (
                  <span key={role} className="pill" style={{ color: factionColor(role) }}>
                    {ROLE_META[role].name} {n > 1 ? `×${n}` : ''}
                  </span>
                ))}
              </div>
            </button>
          ))}

          <button
            className="card"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              borderColor: presetId === 'custom' ? 'var(--accent)' : 'var(--border)',
              background: presetId === 'custom' ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-card))' : 'var(--bg-card)',
            }}
            onClick={() => {
              setPresetId('custom');
              setSeats(presetSeats('custom', playerCount));
            }}
          >
            <div style={{ fontWeight: 700 }}>自訂配置</div>
            <div className="muted small">自由設定人數與每個角色</div>
          </button>

          {presetId === 'custom' && (
            <div className="card" style={{ marginTop: 10 }}>
              <label className="small muted">人數：{playerCount}</label>
              <input
                type="range"
                min={6}
                max={18}
                value={playerCount}
                style={{ width: '100%' }}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPlayerCount(n);
                  setSeats(presetSeats('custom', n));
                }}
              />
            </div>
          )}

          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} onClick={() => setStep(1)}>
            下一步：規則設定
          </button>
        </section>
      )}

      {step === 1 && (
        <RulesStep rules={rules} setRules={setRules} onNext={() => setStep(2)} />
      )}

      {step === 2 && (
        <section>
          <h2 style={{ marginBottom: 4 }}>輸入座位角色</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>依實體發牌結果，設定每個座位拿到的角色。</p>
          <RolePool seats={seats} />
          <div style={{ marginTop: 12 }}>
            {seats.map((s) => (
              <div key={s.seat} className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
                <span className="vote-voter-label">{s.seat} 號</span>
                <select
                  className="grow"
                  value={s.role}
                  style={{ padding: 10, borderRadius: 8, background: 'var(--bg-elev2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  onChange={(e) => setSeatRole(s.seat, e.target.value as RoleId)}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_META[r].name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="名字(選填)"
                  value={s.name ?? ''}
                  style={{ width: 96, padding: 10, borderRadius: 8, background: 'var(--bg-elev2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  onChange={(e) => setSeatName(s.seat, e.target.value)}
                />
              </div>
            ))}
          </div>
          {errors.length > 0 && <div className="warn-card" style={{ marginTop: 12 }}>{errors[0]}</div>}
          <button
            className="btn btn-primary btn-lg btn-block"
            style={{ marginTop: 12 }}
            disabled={errors.length > 0}
            onClick={() => setStep(3)}
          >
            下一步：確認
          </button>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2 style={{ marginBottom: 12 }}>確認開局</h2>
          <div className="card" style={{ marginBottom: 12 }}>
            <input
              placeholder="對局名稱（選填）"
              value={title}
              style={{ width: '100%', padding: 12, borderRadius: 8, background: 'var(--bg-elev2)', color: 'var(--text)', border: '1px solid var(--border)', marginBottom: 12 }}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="row row-wrap" style={{ gap: 4 }}>
              {roleTally(seats.map((s) => s.role)).map(([role, n]) => (
                <span key={role} className="pill" style={{ color: factionColor(role) }}>
                  {ROLE_META[role].name} {n > 1 ? `×${n}` : ''}
                </span>
              ))}
            </div>
            <div className="divider" />
            <RuleSummary rules={rules} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || errors.length > 0} onClick={submit}>
            {busy ? '建立中…' : '🐺 開始主持'}
          </button>
        </section>
      )}

      <Toast message={err} onClose={() => setErr(null)} />
    </div>
  );
}

function WizardHeader({ step, onBack }: { step: number; onBack: () => void }) {
  const labels = ['板子', '規則', '角色', '確認'];
  return (
    <header style={{ padding: '14px 0' }}>
      <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← 返回</button>
      </div>
      <div className="step-dots">
        {labels.map((_, i) => (
          <div key={i} className={`step-dot ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`} />
        ))}
      </div>
    </header>
  );
}

function RulesStep({ rules, setRules, onNext }: { rules: RuleConfig; setRules: (r: RuleConfig) => void; onNext: () => void }) {
  const T = (patch: Partial<RuleConfig>) => setRules({ ...rules, ...patch });
  return (
    <section>
      <h2 style={{ marginBottom: 12 }}>規則設定</h2>
      <ToggleRow label="警長機制" hint="首日競選、警長 1.5 票、警徽流" value={rules.sheriffEnabled} onChange={(v) => T({ sheriffEnabled: v })} />
      <ToggleRow label="同守同救 = 死" hint="守衛與女巫同時作用於一人時死亡（奶穿）" value={rules.guardSaveConflictDies} onChange={(v) => T({ guardSaveConflictDies: v })} />
      <SelectRow
        label="女巫自救"
        value={rules.witchSelfSave}
        options={[['firstNightOnly', '僅首夜'], ['always', '全程可'], ['never', '不可']]}
        onChange={(v) => T({ witchSelfSave: v as RuleConfig['witchSelfSave'] })}
      />
      <SelectRow
        label="勝利條件"
        value={rules.victory}
        options={[['slaughterSide', '屠邊'], ['slaughterCity', '屠城']]}
        onChange={(v) => T({ victory: v as RuleConfig['victory'] })}
      />
      <SelectRow
        label="夜刀遺言"
        value={rules.lastWordsOnNightDeath}
        options={[['firstDayOnly', '僅首夜'], ['always', '每晚'], ['none', '無']]}
        onChange={(v) => T({ lastWordsOnNightDeath: v as RuleConfig['lastWordsOnNightDeath'] })}
      />
      <ToggleRow label="翻牌白癡再被票出局" hint="已翻牌白癡再次被投票則出局" value={rules.idiotExiledAgainDies} onChange={(v) => T({ idiotExiledAgainDies: v })} />
      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} onClick={onNext}>
        下一步：輸入角色
      </button>
    </section>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="card" style={{ marginBottom: 8, padding: 12 }} onClick={() => onChange(!value)}>
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{label}</div>
          {hint && <div className="faint small">{hint}</div>}
        </div>
        <div className={`toggle ${value ? 'on' : ''}`}>
          <div className="toggle-knob" />
        </div>
      </div>
    </div>
  );
}

function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="card" style={{ marginBottom: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div className="row" style={{ gap: 6 }}>
        {options.map(([val, lbl]) => (
          <button
            key={val}
            className="btn btn-sm grow"
            style={value === val ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : {}}
            onClick={() => onChange(val)}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

function RolePool({ seats }: { seats: SeatConfig[] }) {
  return (
    <div className="row row-wrap" style={{ gap: 4 }}>
      {roleTally(seats.map((s) => s.role)).map(([role, n]) => (
        <span key={role} className="pill" style={{ color: factionColor(role) }}>
          {ROLE_META[role].name} ×{n}
        </span>
      ))}
    </div>
  );
}

function RuleSummary({ rules }: { rules: RuleConfig }) {
  const items = [
    `警長：${rules.sheriffEnabled ? '有' : '無'}`,
    `同守同救：${rules.guardSaveConflictDies ? '死' : '活'}`,
    `女巫自救：${{ firstNightOnly: '僅首夜', always: '全程', never: '不可' }[rules.witchSelfSave]}`,
    `勝利：${rules.victory === 'slaughterSide' ? '屠邊' : '屠城'}`,
  ];
  return (
    <div className="row row-wrap small muted" style={{ gap: 6 }}>
      {items.map((i) => (
        <span key={i} className="pill">{i}</span>
      ))}
    </div>
  );
}

// ---- helpers ----
function presetSeats(id: PresetId, count: number): SeatConfig[] {
  const preset = BOARD_PRESETS.find((p) => p.id === id);
  if (preset) return preset.roles.map((role, i) => ({ seat: i + 1, role }));
  // 自訂：預設半狼半民的合理起手，GM 再調整
  const wolves = Math.max(1, Math.floor(count / 3));
  return Array.from({ length: count }, (_, i) => ({
    seat: i + 1,
    role: (i === 0 ? 'seer' : i === 1 ? 'witch' : i >= count - wolves ? 'werewolf' : 'villager') as RoleId,
  }));
}

function roleTally(roles: RoleId[]): [RoleId, number][] {
  const m = new Map<RoleId, number>();
  for (const r of roles) m.set(r, (m.get(r) ?? 0) + 1);
  return ALL_ROLES.filter((r) => m.has(r)).map((r) => [r, m.get(r)!]);
}
