import { useEffect, useMemo, useState } from 'react';
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
import { api, roomPass } from '../api';
import { Toast } from '../components/Toast';
import { factionColor } from '../ui/roleStyle';

/** 預設隨手產一組 4 位數管理密碼（好口述、好輸入；本機自動記住） */
const genPassword = () => String(Math.floor(1000 + Math.random() * 9000));

type Step = 'board' | 'pool' | 'rules' | 'seats' | 'confirm';
const STEPS: Step[] = ['board', 'pool', 'rules', 'seats', 'confirm'];
const STEP_LABEL: Record<Step, string> = { board: '板子', pool: '角色池', rules: '規則', seats: '座位', confirm: '確認' };

type Pool = Partial<Record<RoleId, number>>;

/** 只能一張的角色（平民與普通狼人可複數） */
const MULTI_ROLES: RoleId[] = ['villager', 'werewolf'];
const GROUPS: { label: string; roles: RoleId[] }[] = [
  { label: '神職', roles: ['seer', 'witch', 'hunter', 'idiot', 'guard', 'knight', 'cupid'] },
  { label: '平民', roles: ['villager'] },
  { label: '狼人陣營', roles: ['werewolf', 'blackWolfKing', 'whiteWolfKing', 'seedWolf'] },
];

export function NewGamePage() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('board');
  const [presetId, setPresetId] = useState<PresetId>('standard12');
  const [pool, setPool] = useState<Pool>(() => poolFromRoles(BOARD_PRESETS[0]!.roles));
  const [seats, setSeats] = useState<SeatConfig[]>([]);
  const [rules, setRules] = useState<RuleConfig>({ ...DEFAULT_RULES });
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState(genPassword);
  const [rosterNames, setRosterNames] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 名冊：座位輸入名字時自動完成（常玩的朋友一次就記住）
  useEffect(() => {
    api.getRoster().then(setRosterNames).catch(() => {});
  }, []);

  const playerCount = useMemo(() => Object.values(pool).reduce((a, b) => a + (b ?? 0), 0), [pool]);
  const errors = useMemo(
    () => (seats.length > 0 ? validateConfig({ playerCount, seats, rules }) : []),
    [playerCount, seats, rules],
  );
  // 角色池本身的即時驗證（用池子展開的虛擬座位跑同一套引擎驗證）
  const poolErrors = useMemo(
    () => validateConfig({ playerCount, seats: seatsFromPool(pool, []), rules }),
    [playerCount, pool, rules],
  );

  const goBack = () => {
    const i = STEPS.indexOf(step);
    if (i === 0) return nav('/');
    setStep(STEPS[i - 1]!);
  };

  const choosePreset = (id: PresetId) => {
    setPresetId(id);
    const preset = BOARD_PRESETS.find((p) => p.id === id);
    setPool(preset ? poolFromRoles(preset.roles) : {});
  };

  const enterSeats = () => {
    // 依角色池重新產生座位（保留已輸入的名字）
    setSeats((prev) => seatsFromPool(pool, prev));
    setStep('seats');
  };

  const setSeatRole = (seat: number, role: RoleId) =>
    setSeats((prev) => prev.map((s) => (s.seat === seat ? { ...s, role } : s)));
  const setSeatName = (seat: number, name: string) =>
    setSeats((prev) => prev.map((s) => (s.seat === seat ? { ...s, name: name || undefined } : s)));

  // 座位角色與角色池的差異（軟性提醒，不擋流程——實體發牌輸入錯最常見的徵兆）
  const poolMismatch = useMemo(() => {
    if (seats.length === 0) return null;
    const seatTally = new Map<RoleId, number>();
    for (const s of seats) seatTally.set(s.role, (seatTally.get(s.role) ?? 0) + 1);
    const diffs: string[] = [];
    for (const r of ALL_ROLES) {
      const want = pool[r] ?? 0;
      const got = seatTally.get(r) ?? 0;
      if (want !== got) diffs.push(`${ROLE_META[r].name} ${got}/${want}`);
    }
    return diffs.length > 0 ? diffs.join('、') : null;
  }, [seats, pool]);

  const submit = async () => {
    if (errors.length > 0) return setErr(errors[0]!);
    setBusy(true);
    try {
      const config: GameConfig = { playerCount, seats, rules, presetId, title: title || undefined };
      const id = await api.createGame(config, password);
      if (password) roomPass.set(id, password); // 本機記住，主持全程免再輸入
      nav(`/game/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '建立失敗');
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <datalist id="roster-names">
        {rosterNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      <WizardHeader step={step} onBack={goBack} />

      {step === 'board' && (
        <section>
          <h2 style={{ marginBottom: 4 }}>選擇板子</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>標準板子配置平衡；人數不同或想亂玩，下一步可以自由調整角色池。</p>
          {BOARD_PRESETS.map((p) => (
            <button
              key={p.id}
              className="card"
              style={cardStyle(presetId === p.id)}
              onClick={() => choosePreset(p.id)}
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

          <button className="card" style={cardStyle(presetId === 'custom')} onClick={() => choosePreset('custom')}>
            <div style={{ fontWeight: 700 }}>自訂配置</div>
            <div className="muted small">從空白角色池自由搭，全神職娛樂局也行（不保證平衡）</div>
          </button>

          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} onClick={() => setStep('pool')}>
            下一步：角色池
          </button>
        </section>
      )}

      {step === 'pool' && (
        <PoolStep
          pool={pool}
          setPool={setPool}
          playerCount={playerCount}
          poolErrors={poolErrors}
          isPreset={presetId !== 'custom'}
          onNext={() => setStep('rules')}
        />
      )}

      {step === 'rules' && <RulesStep rules={rules} setRules={setRules} onNext={enterSeats} />}

      {step === 'seats' && (
        <section>
          <h2 style={{ marginBottom: 4 }}>輸入座位角色</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>依實體發牌結果，設定每個座位拿到的角色。</p>
          <div className="row row-wrap" style={{ gap: 4 }}>
            {roleTally(seats.map((s) => s.role)).map(([role, n]) => (
              <span key={role} className="pill" style={{ color: factionColor(role) }}>
                {ROLE_META[role].name} ×{n}
              </span>
            ))}
          </div>
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
                  list="roster-names"
                  value={s.name ?? ''}
                  style={{ width: 96, padding: 10, borderRadius: 8, background: 'var(--bg-elev2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  onChange={(e) => setSeatName(s.seat, e.target.value)}
                />
              </div>
            ))}
          </div>
          {poolMismatch && (
            <div className="warn-card" style={{ marginTop: 12 }}>
              ⚠️ 座位角色與角色池不一致（目前/應有）：{poolMismatch}。若是刻意改動可忽略。
            </div>
          )}
          {errors.length > 0 && <div className="warn-card" style={{ marginTop: 12 }}>{errors[0]}</div>}
          <button
            className="btn btn-primary btn-lg btn-block"
            style={{ marginTop: 12 }}
            disabled={errors.length > 0}
            onClick={() => setStep('confirm')}
          >
            下一步：確認
          </button>
        </section>
      )}

      {step === 'confirm' && (
        <section>
          <h2 style={{ marginBottom: 12 }}>確認開局</h2>
          <div className="card" style={{ marginBottom: 12 }}>
            <input
              placeholder="對局名稱（選填）"
              value={title}
              style={{ width: '100%', padding: 12, borderRadius: 8, background: 'var(--bg-elev2)', color: 'var(--text)', border: '1px solid var(--border)', marginBottom: 12 }}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="muted small" style={{ marginBottom: 6 }}>{playerCount} 人</div>
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

          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>🔒 管理密碼</div>
            <div className="faint small" style={{ marginBottom: 8 }}>
              防止路人亂點你的對局。本機會自動記住，主持全程免再輸入；換裝置才需要打。清空 = 不上鎖。
            </div>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="text-input"
                value={password}
                placeholder="不設密碼"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button className="btn btn-sm" type="button" onClick={() => setPassword(genPassword())} title="換一組">🎲</button>
            </div>
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

/** 角色池：每個角色 +/- 計數，人數自動加總（標準板 10/11/13 人調整、娛樂局亂搭都在這裡） */
function PoolStep({
  pool,
  setPool,
  playerCount,
  poolErrors,
  isPreset,
  onNext,
}: {
  pool: Pool;
  setPool: (p: Pool) => void;
  playerCount: number;
  poolErrors: string[];
  isPreset: boolean;
  onNext: () => void;
}) {
  const bump = (role: RoleId, delta: number) => {
    const max = MULTI_ROLES.includes(role) ? 18 : 1;
    const next = Math.max(0, Math.min(max, (pool[role] ?? 0) + delta));
    setPool({ ...pool, [role]: next });
  };

  const wolves = GROUPS[2]!.roles.reduce((a, r) => a + (pool[r] ?? 0), 0);
  const gods = GROUPS[0]!.roles.reduce((a, r) => a + (pool[r] ?? 0), 0);
  const villagers = pool.villager ?? 0;

  return (
    <section>
      <h2 style={{ marginBottom: 4 }}>角色池</h2>
      <p className="muted small" style={{ marginBottom: 12 }}>
        {isPreset
          ? '人數不是 12？慣例是先增減平民、再增減狼人，其他照舊。'
          : '自由搭配，人數自動加總（引擎只要求至少一狼一好人）。'}
      </p>

      <div className="row row-wrap" style={{ gap: 6, marginBottom: 12 }}>
        <span className="stat">總 <b>{playerCount}</b> 人</span>
        <span className="stat stat-god">神 <b>{gods}</b></span>
        <span className="stat stat-villager">民 <b>{villagers}</b></span>
        <span className="stat stat-wolf">狼 <b>{wolves}</b></span>
      </div>

      {GROUPS.map((g) => (
        <div key={g.label} style={{ marginBottom: 12 }}>
          <h3 className="small muted" style={{ marginBottom: 6 }}>{g.label}</h3>
          <div className="card" style={{ padding: '4px 12px' }}>
            {g.roles.map((role) => (
              <div key={role} className="row" style={{ alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, color: factionColor(role) }}>{ROLE_META[role].name}</span>
                <span className="spacer" />
                <button className="btn btn-sm" style={{ minWidth: 44 }} disabled={(pool[role] ?? 0) === 0} onClick={() => bump(role, -1)}>
                  −
                </button>
                <span style={{ width: 36, textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {pool[role] ?? 0}
                </span>
                <button
                  className="btn btn-sm"
                  style={{ minWidth: 44 }}
                  disabled={!MULTI_ROLES.includes(role) && (pool[role] ?? 0) >= 1}
                  onClick={() => bump(role, 1)}
                >
                  ＋
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {poolErrors.length > 0 && <div className="warn-card">{poolErrors[0]}</div>}
      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 8 }} disabled={poolErrors.length > 0} onClick={onNext}>
        下一步：規則設定（{playerCount} 人）
      </button>
    </section>
  );
}

function WizardHeader({ step, onBack }: { step: Step; onBack: () => void }) {
  const idx = STEPS.indexOf(step);
  return (
    <header style={{ padding: '14px 0' }}>
      <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← 返回</button>
        <span className="spacer" />
        <span className="faint small">{STEP_LABEL[step]}</span>
      </div>
      <div className="step-dots">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-dot ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}`} />
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
      <h3 className="small muted" style={{ margin: '16px 0 8px' }}>擴充角色（邱比特／種狼，板上有才生效）</h3>
      <ToggleRow label="殉情可以開槍" hint="情侶殉情死亡的獵人／黑狼王仍可發動技能" value={rules.lovesickCanShoot} onChange={(v) => T({ lovesickCanShoot: v })} />
      <ToggleRow label="種狼首夜可感染" hint="關閉時依標準規則：第二夜起才能發動感染" value={rules.seedWolfFirstNight} onChange={(v) => T({ seedWolfFirstNight: v })} />
      <ToggleRow label="被感染者保留技能" hint="關閉時依標準規則：感染後失去原技能、變普通狼" value={rules.infectedKeepsSkills} onChange={(v) => T({ infectedKeepsSkills: v })} />
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
function cardStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    marginBottom: 10,
    borderColor: selected ? 'var(--accent)' : 'var(--border)',
    background: selected ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-card))' : 'var(--bg-card)',
  };
}

function poolFromRoles(roles: RoleId[]): Pool {
  const pool: Pool = {};
  for (const r of roles) pool[r] = (pool[r] ?? 0) + 1;
  return pool;
}

/** 角色池展開成座位（依 ALL_ROLES 順序）；盡量保留既有座位名字 */
function seatsFromPool(pool: Pool, prev: SeatConfig[]): SeatConfig[] {
  const roles: RoleId[] = [];
  for (const r of ALL_ROLES) for (let i = 0; i < (pool[r] ?? 0); i++) roles.push(r);
  return roles.map((role, i) => ({ seat: i + 1, role, name: prev[i]?.name }));
}

function roleTally(roles: RoleId[]): [RoleId, number][] {
  const m = new Map<RoleId, number>();
  for (const r of roles) m.set(r, (m.get(r) ?? 0) + 1);
  return ALL_ROLES.filter((r) => m.has(r)).map((r) => [r, m.get(r)!]);
}
