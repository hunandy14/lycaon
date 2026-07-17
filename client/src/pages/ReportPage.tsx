import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  buildGameReport,
  phaseLabel,
  CAUSE_LABEL,
  type DayIncident,
  type DeathCause,
  type GameReport,
  type NightReport,
  type PlayerReport,
  type ReportCamp,
  type SeatId,
  type VoteRoundReport,
} from '@lycaon/engine';
import { useGame } from '../hooks/useGame';
import { roleShort } from '../ui/roleStyle';
import { factionColor } from '../ui/roleStyle';
import { Toast } from '../components/Toast';

const WIN_STYLE = {
  good: { emoji: '✋', title: '好人陣營勝利', color: 'var(--good)' },
  wolf: { emoji: '🐺', title: '狼人陣營勝利', color: 'var(--wolf)' },
  lovers: { emoji: '💘', title: '情侶獲勝', color: '#f472b6' },
} as const;

const CAMP_COLOR: Record<ReportCamp, string> = { good: 'var(--good)', wolf: 'var(--wolf)', third: '#f472b6' };

const DEATH_ICON: Record<DeathCause, string> = {
  wolf: '🔪',
  poison: '☠️',
  guardSaveConflict: '💥',
  exile: '🗳️',
  shot: '🔫',
  duel: '⚔️',
  explode: '💥',
  lovesick: '💔',
};

/** 遊戲節拍：夜1、日1、夜2… 命運圖的欄、勢力圖的 x 軸 */
interface Beat {
  day: number;
  during: 'night' | 'day';
  label: string;
}

function buildBeats(report: GameReport): Beat[] {
  const beats: Beat[] = [];
  const maxDay = Math.max(0, ...report.nights.map((n) => n.night), ...report.days.map((d) => d.day));
  for (let d = 1; d <= maxDay; d++) {
    if (report.nights.some((n) => n.night === d)) beats.push({ day: d, during: 'night', label: `夜${d}` });
    if (report.days.some((x) => x.day === d)) beats.push({ day: d, during: 'day', label: `日${d}` });
  }
  return beats;
}

const beatIndex = (beats: Beat[], day: number, during: 'night' | 'day'): number =>
  beats.findIndex((b) => b.day === day && b.during === during);

const deathBeatOf = (beats: Beat[], p: PlayerReport): number => {
  if (!p.death) return Infinity;
  const i = beatIndex(beats, p.death.day, p.death.during);
  return i < 0 ? Infinity : i;
};

export function ReportPage() {
  const { id = '' } = useParams();
  const g = useGame(id);

  const report = useMemo<GameReport | null>(() => {
    if (g.envelopes.length === 0) return null;
    try {
      return buildGameReport(g.envelopes);
    } catch {
      return null;
    }
  }, [g.envelopes]);

  const beats = useMemo(() => (report ? buildBeats(report) : []), [report]);

  if (g.loading) return <div className="app"><p className="center muted" style={{ marginTop: 60 }}>載入中…</p></div>;
  if (!report) return <div className="app"><p className="center muted" style={{ marginTop: 60 }}>找不到對局</p></div>;

  return (
    <div className="app">
      <header className="row" style={{ alignItems: 'center', padding: '14px 0' }}>
        <Link to={`/game/${id}`} className="btn btn-ghost btn-sm">← 返回</Link>
        <h2 className="grow center" style={{ fontSize: '1.1rem' }}>終局報表</h2>
        <Link to={`/game/${id}/timeline`} className="btn btn-ghost btn-sm">📜 時間軸</Link>
      </header>

      <ResultHero report={report} phaseText={g.state ? phaseLabel(g.state) : ''} />

      {beats.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-title">全局命運圖</div>
          <FateMatrix report={report} beats={beats} />
        </section>
      )}

      {beats.length > 1 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-title">勢力消長</div>
          <TideChart report={report} beats={beats} />
        </section>
      )}

      {report.highlights.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-title">數據亮點</div>
          <div className="hl-grid">
            {report.highlights.map((h, i) => (
              <div key={i} className="hl-card">
                <div className="hl-title">{h.icon} {h.title}</div>
                <div className="hl-detail">{h.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.days.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-title">投票戰況</div>
          {report.days.map((d) => <DayBlock key={d.day} d={d} players={report.players} />)}
        </section>
      )}

      {report.nights.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-title">夜晚復盤</div>
          {report.nights.map((n) => <NightStrip key={n.night} n={n} ongoing={report.result.ongoing} />)}
        </section>
      )}

      <div className="row" style={{ marginTop: 18, marginBottom: 30, gap: 10 }}>
        <Link to="/" className="btn btn-ghost grow center">🏠 回首頁</Link>
        <Link to={`/game/${id}/timeline`} className="btn btn-ghost grow center">📜 完整時間軸</Link>
      </div>

      <Toast message={g.error} onClose={g.clearError} />
    </div>
  );
}

/* ---------- 勝負 hero（緊湊版 + KPI 列） ---------- */

function ResultHero({ report, phaseText }: { report: GameReport; phaseText: string }) {
  const { result } = report;
  const mins = Math.max(0, Math.round((new Date(result.endedAt).getTime() - new Date(result.startedAt).getTime()) / 60000));
  const duration = mins >= 60 ? `${Math.floor(mins / 60)} 時 ${mins % 60} 分` : `${mins} 分鐘`;
  const aliveN = report.players.filter((p) => !p.death).length;
  const exiles = report.days.reduce((n, d) => n + d.exileRounds.filter((r) => r.outcome.t === 'exiled').length, 0);
  const shots = report.days.reduce((n, d) => n + d.incidents.filter((i) => i.kind === 'shot' && i.target !== null).length, 0);

  const ws = result.winner ? WIN_STYLE[result.winner.faction] : null;
  return (
    <div
      className="panel"
      style={{
        padding: '14px 16px',
        background: ws ? `color-mix(in srgb, ${ws.color} 14%, var(--bg-card))` : undefined,
        borderColor: ws?.color,
      }}
    >
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: '2.1rem' }}>{ws ? ws.emoji : result.aborted ? '🚫' : '⏳'}</div>
        <div className="grow">
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: ws?.color }}>
            {ws ? ws.title : result.aborted ? '對局已中止' : `對局進行中（${phaseText}）`}
          </div>
          {result.winner && <div className="small muted">{result.winner.reason}</div>}
        </div>
      </div>
      <div className="hero-meta">
        <span className="kpi">{result.playerCount} 人</span>
        <span className="kpi">{result.totalDays} 天</span>
        <span className="kpi">⏱ {duration}</span>
        <span className="kpi">存活 {aliveN}</span>
        {exiles > 0 && <span className="kpi">放逐 {exiles}</span>}
        {shots > 0 && <span className="kpi">槍響 {shots}</span>}
        {report.seerTrack.length > 0 && <span className="kpi">查驗 {report.seerTrack.length}</span>}
      </div>
    </div>
  );
}

/* ---------- 全局命運圖：座位 × 節拍矩陣 ---------- */

interface CellMark {
  icons: string[];
  titles: string[];
  ring: '' | 'wolf' | 'good';
}

function FateMatrix({ report, beats }: { report: GameReport; beats: Beat[] }) {
  const marks = new Map<string, CellMark>();
  const mark = (seat: SeatId, i: number, icon: string, title: string, ring: CellMark['ring'] = '') => {
    if (i < 0) return;
    const k = `${seat}:${i}`;
    let m = marks.get(k);
    if (!m) marks.set(k, (m = { icons: [], titles: [], ring: '' }));
    if (!m.icons.includes(icon)) m.icons.push(icon);
    m.titles.push(title);
    if (ring) m.ring = ring;
  };

  for (const n of report.nights) {
    const i = beatIndex(beats, n.night, 'night');
    if (n.cupid) {
      mark(n.cupid.a, i, '💘', `與 ${n.cupid.b} 號連結為情侶`);
      mark(n.cupid.b, i, '💘', `與 ${n.cupid.a} 號連結為情侶`);
    }
    if (typeof n.guardTarget === 'number') mark(n.guardTarget, i, '🛡️', '被守護');
    if (typeof n.wolfTarget === 'number') mark(n.wolfTarget, i, '🔪', '被狼刀');
    if (n.witchSave !== null) mark(n.witchSave, i, '🧪', '女巫解藥');
    if (n.witchPoison !== null) mark(n.witchPoison, i, '☠️', '被女巫毒');
    if (n.infected !== null) mark(n.infected, i, '🦠', '被種狼感染');
    if (n.seer) mark(n.seer.target, i, '🔮', `被查驗：${n.seer.result === 'wolf' ? '狼人' : '好人'}`, n.seer.result === 'wolf' ? 'wolf' : 'good');
  }
  for (const d of report.days) {
    const i = beatIndex(beats, d.day, 'day');
    if (d.sheriff?.elected != null) mark(d.sheriff.elected, i, '★', '當選警長');
    for (const r of d.exileRounds) {
      if (r.outcome.t === 'idiotRevealed') mark(r.outcome.seat, i, '🃏', '翻牌白癡免死');
    }
    for (const inc of d.incidents) {
      if (inc.kind === 'badge' && inc.to !== null) mark(inc.to, i, '★', '接任警長');
    }
  }
  for (const p of report.players) {
    if (!p.death) continue;
    const i = beatIndex(beats, p.death.day, p.death.during);
    mark(p.seat, i, DEATH_ICON[p.death.cause], CAUSE_LABEL[p.death.cause]);
  }

  return (
    <>
      <div className="fate-wrap">
        <table className="fate">
          <thead>
            <tr>
              <th className="fate-player" style={{ background: 'var(--bg-card)' }}></th>
              {beats.map((b) => <th key={b.label}>{b.label}</th>)}
              <th title="放逐投票投中狼的次數（好人身分時）">命中</th>
            </tr>
          </thead>
          <tbody>
            {report.players.map((p) => {
              const db = deathBeatOf(beats, p);
              const vs = p.voteStats;
              const acc = vs.countable > 0 ? vs.hitWolf / vs.countable : null;
              return (
                <tr key={p.seat}>
                  <th className="fate-player">
                    <div className="fp-line1">
                      <span className="faint">{p.seat}</span>
                      <span style={{ color: p.converted ? 'var(--wolf)' : factionColor(p.role) }}>{roleShort(p.role)}</span>
                      {p.everSheriff && <span style={{ color: 'var(--sheriff)', fontSize: '0.62rem' }}>★</span>}
                      {p.lover && <span style={{ fontSize: '0.6rem' }}>💘</span>}
                      {p.finalCamp === 'third' && !p.lover && <span style={{ color: '#f472b6', fontSize: '0.58rem' }}>三方</span>}
                    </div>
                    {p.name && <div className="fp-name">{p.name}</div>}
                  </th>
                  {beats.map((b, i) => {
                    const m = marks.get(`${p.seat}:${i}`);
                    const cls = [
                      i === db ? 'fate-death' : i > db ? 'fate-gone' : '',
                      m?.ring ? `fate-check-${m.ring}` : '',
                    ].join(' ');
                    return (
                      <td key={b.label} className={cls} title={m ? `${b.label}：${m.titles.join('、')}` : undefined}>
                        {m?.icons.join('')}
                      </td>
                    );
                  })}
                  <td
                    className="fate-acc"
                    style={{ color: acc === null ? 'var(--text-faint)' : acc >= 0.75 ? 'var(--villager)' : acc >= 0.4 ? 'var(--god)' : 'var(--wolf)' }}
                  >
                    {acc === null ? '–' : `${vs.hitWolf}/${vs.countable}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="fate-legend">
        🛡️守護 🔪狼刀 🧪解藥 ☠️毒殺 🔮查驗（<span style={{ color: 'var(--wolf)' }}>紅框=狼</span>／<span style={{ color: 'var(--good)' }}>藍框=好</span>）
        🦠感染 💘情侶 ★警長 🗳️放逐 🔫中槍 ⚔️決鬥 💥自爆/奶穿 💔殉情 🃏翻牌　命中=好人身分投中狼
      </div>
    </>
  );
}

/* ---------- 勢力消長：SVG 折線 ---------- */

function TideChart({ report, beats }: { report: GameReport; beats: Beat[] }) {
  const players = report.players;
  const linkNight = report.nights.find((n) => n.cupid?.thirdParty)?.night ?? null;
  const linkBeat = linkNight !== null ? beatIndex(beats, linkNight, 'night') : null;
  const hasThird = players.some((p) => p.finalCamp === 'third');

  const campAt = (p: PlayerReport, i: number): ReportCamp => {
    if (hasThird && p.finalCamp === 'third' && linkBeat !== null && i >= linkBeat) return 'third';
    if (p.originalFaction === 'wolf') return 'wolf';
    if (p.convertedOnNight !== null) {
      const cb = beatIndex(beats, p.convertedOnNight, 'night');
      if (cb >= 0 && i >= cb) return 'wolf';
    }
    return 'good';
  };

  // x 序列：開局 + 每個節拍結算後
  const xs = [-1, ...beats.map((_, i) => i)];
  const count = (camp: ReportCamp, i: number) =>
    players.filter((p) => deathBeatOf(beats, p) > i && campAt(p, i) === camp).length;
  const series: { camp: ReportCamp; values: number[] }[] = (['good', 'wolf', ...(hasThird ? ['third' as const] : [])] as ReportCamp[])
    .map((camp) => ({ camp, values: xs.map((i) => count(camp, i)) }));

  const maxY = Math.max(1, ...series.flatMap((s) => s.values));
  const W = 360, x0 = 14, x1 = 330, y0 = 12, y1 = 74;
  const X = (k: number) => x0 + (xs.length > 1 ? (k / (xs.length - 1)) * (x1 - x0) : 0);
  const Y = (v: number) => y1 - (v / maxY) * (y1 - y0);
  const path = (vals: number[]) => vals.map((v, k) => `${k === 0 ? 'M' : 'L'}${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const CAMP_HEX: Record<ReportCamp, string> = { good: '#38bdf8', wolf: '#ef4444', third: '#f472b6' };
  const labelEvery = Math.max(1, Math.ceil(xs.length / 9));

  return (
    <svg className="tide-svg" viewBox={`0 0 ${W} 96`} role="img" aria-label="各陣營存活人數走勢">
      {[0, maxY].map((v) => (
        <g key={v}>
          <line x1={x0} y1={Y(v)} x2={x1} y2={Y(v)} stroke="#2e3446" strokeWidth="0.6" strokeDasharray="3 3" />
          <text x={x0 - 4} y={Y(v) + 3} fontSize="8" fill="#6b7385" textAnchor="end">{v}</text>
        </g>
      ))}
      {series.map((s) => (
        <g key={s.camp}>
          <path d={path(s.values)} fill="none" stroke={CAMP_HEX[s.camp]} strokeWidth="2" strokeLinejoin="round" />
          {s.values.map((v, k) => <circle key={k} cx={X(k)} cy={Y(v)} r="2.1" fill={CAMP_HEX[s.camp]} />)}
          <text x={x1 + 5} y={Y(s.values[s.values.length - 1]!) + 3} fontSize="9" fontWeight="700" fill={CAMP_HEX[s.camp]}>
            {s.values[s.values.length - 1]}
          </text>
        </g>
      ))}
      {xs.map((_, k) => (
        k % labelEvery === 0 && (
          <text key={k} x={X(k)} y={90} fontSize="8" fill="#6b7385" textAnchor="middle">
            {k === 0 ? '開局' : beats[k - 1]!.label}
          </text>
        )
      ))}
    </svg>
  );
}

/* ---------- 投票戰況（票型橫條 + 白天事件時序） ---------- */

function DayBlock({ d, players }: { d: GameReport['days'][number]; players: PlayerReport[] }) {
  return (
    <div className="rp-day">
      <div className="rp-day-label">第 {d.day} 天</div>
      {d.sheriff && (
        <div className="rp-block">
          <div className="rp-block-title">警長競選</div>
          {d.sheriff.skipped ? (
            <div className="small muted">跳過競選，本局無警長</div>
          ) : (
            <>
              <div className="small muted">
                上警：{d.sheriff.candidates.map((s) => `${s} 號`).join('、') || '無'}
                {d.sheriff.withdrawn.length > 0 && ` · 退水：${d.sheriff.withdrawn.map((s) => `${s} 號`).join('、')}`}
              </div>
              {d.sheriff.rounds.map((r, i) => <VoteBars key={i} r={r} players={players} />)}
            </>
          )}
        </div>
      )}
      {d.announcedDeaths.length > 0 && (
        <div className="rp-block">
          <div className="rp-block-title">死訊公佈</div>
          <div className="small">{d.announcedDeaths.map((x) => `${DEATH_ICON[x.cause]} ${x.seat} 號（${CAUSE_LABEL[x.cause]}）`).join('　')}</div>
        </div>
      )}
      {[
        ...d.exileRounds.map((r) => ({
          seq: r.seq,
          node: (
            <div key={`v${r.seq}`} className="rp-block">
              <div className="rp-block-title">放逐投票{r.round > 1 ? '（PK 輪）' : ''}</div>
              <VoteBars r={r} players={players} />
            </div>
          ),
        })),
        ...d.incidents.map((inc) => ({
          seq: inc.seq,
          node: <div key={`i${inc.seq}`} className="rp-incident small">{incidentText(inc)}</div>,
        })),
      ]
        .sort((a, b) => a.seq - b.seq)
        .map((x) => x.node)}
    </div>
  );
}

function VoteBars({ r, players }: { r: VoteRoundReport; players: PlayerReport[] }) {
  const campOf = (seat: SeatId): ReportCamp => players.find((p) => p.seat === seat)?.finalCamp ?? 'good';
  const abstains = r.ballots.filter((b) => b.target === null).map((b) => b.voter);
  const max = Math.max(1, ...r.counts.map((c) => c.votes));
  const topVotes = r.counts[0]?.votes ?? 0;
  return (
    <div style={{ marginTop: 2 }}>
      {r.pkSeats && <div className="small muted">PK：{r.pkSeats.map((s) => `${s} 號`).join(' vs ')}</div>}
      {r.counts.map((c) => (
        <div key={c.seat}>
          <div className="vb-row">
            <span className="vb-target" style={{ color: CAMP_COLOR[campOf(c.seat)] }}>{c.seat} 號</span>
            <div className="vb-track">
              <div className={`vb-fill ${c.votes === topVotes ? 'vb-top' : ''}`} style={{ width: `${(c.votes / max) * 100}%` }} />
            </div>
            <span className="vb-num">{Number.isInteger(c.votes) ? c.votes : c.votes.toFixed(1)}</span>
          </div>
          <div className="vb-voters">
            {r.ballots.filter((b) => b.target === c.seat).map((b) => (
              <span key={b.voter} className={`vchip vchip-${campOf(b.voter)}`}>{b.voter}</span>
            ))}
          </div>
        </div>
      ))}
      {r.counts.length === 0 && <div className="small muted">全員棄票</div>}
      {abstains.length > 0 && (
        <div className="vb-voters" style={{ marginLeft: 0 }}>
          <span className="small faint" style={{ marginRight: 2 }}>棄票</span>
          {abstains.map((v) => <span key={v} className="vchip">{v}</span>)}
        </div>
      )}
      <div className="vb-outcome">{outcomeText(r)}</div>
    </div>
  );
}

function outcomeText(r: VoteRoundReport): string {
  const o = r.outcome;
  switch (o.t) {
    case 'exiled':
      return `⚖️ ${o.seat} 號被放逐${o.chained.length > 0 ? ` → ${o.chained.map((c) => `${c.seat} 號${CAUSE_LABEL[c.cause]}`).join('、')}` : ''}`;
    case 'idiotRevealed':
      return `🃏 ${o.seat} 號翻牌【白癡】免死，失去投票權`;
    case 'elected':
      return `★ ${o.seat} 號當選警長`;
    case 'pk':
      return `⚖️ 平票：${o.seats.map((s) => `${s} 號`).join('、')}進入 PK`;
    case 'none':
      return r.kind === 'sheriff' ? '本局無警長' : '🕊️ 無人被放逐（平安日）';
  }
}

function incidentText(inc: DayIncident): string {
  switch (inc.kind) {
    case 'shot': {
      const who = inc.via === 'whiteWolfExplode' ? '白狼王' : inc.via === 'blackWolfKing' ? '黑狼王' : '獵人';
      if (inc.target === null) return `🔫 ${inc.shooter} 號【${who}】放棄帶人`;
      const camp = inc.targetCamp === 'wolf' ? '🐺 狼人' : inc.targetCamp === 'third' ? '💘 三方' : '✋ 好人';
      const chain = inc.chained.length > 0 ? ` → ${inc.chained.map((c) => `${c.seat} 號${CAUSE_LABEL[c.cause]}`).join('、')}` : '';
      return `🔫 ${inc.shooter} 號【${who}】帶走 ${inc.target} 號（${camp}）${chain}`;
    }
    case 'duel':
      return inc.success
        ? `⚔️ ${inc.knight} 號騎士決鬥 ${inc.target} 號：是狼，決鬥成功`
        : `⚔️ ${inc.knight} 號騎士決鬥 ${inc.target} 號：是好人，騎士殉職`;
    case 'explode':
      return `💥 ${inc.seat} 號${inc.whiteWolf ? '白狼王' : '狼人'}自爆`;
    case 'badge':
      return inc.to === null ? `★ ${inc.from} 號撕毀警徽` : `★ 警徽由 ${inc.from} 號移交 ${inc.to} 號`;
  }
}

/* ---------- 夜晚復盤：一行一夜 ---------- */

function NightStrip({ n, ongoing }: { n: NightReport; ongoing: boolean }) {
  const chips: { icon: string; text: string }[] = [];
  if (n.cupid) chips.push({ icon: '💘', text: `${n.cupid.a}&${n.cupid.b}${n.cupid.thirdParty ? '（三方）' : ''}` });
  if (n.guardTarget !== undefined) chips.push({ icon: '🛡️', text: n.guardTarget === null ? '空守' : `守 ${n.guardTarget}` });
  if (n.wolfTarget !== undefined) chips.push({ icon: '🔪', text: n.wolfTarget === null ? '空刀' : `刀 ${n.wolfTarget}` });
  if (n.infected !== null) chips.push({ icon: '🦠', text: `感染 ${n.infected}` });
  if (n.witchSave !== null) chips.push({ icon: '🧪', text: `救 ${n.witchSave}` });
  if (n.witchPoison !== null) chips.push({ icon: '☠️', text: `毒 ${n.witchPoison}` });
  if (n.seer) chips.push({ icon: '🔮', text: `驗 ${n.seer.target}→${n.seer.result === 'wolf' ? '狼🐺' : '好✋'}` });

  const result = !n.settled ? (
    <span className="muted">{ongoing ? '夜晚進行中…' : '夜晚未結算（對局在此中止）'}</span>
  ) : n.peaceful ? (
    <span style={{ color: 'var(--good)' }}>
      🌤️ 平安夜
      {n.saved ? `（${n.saved.seat} 號獲救：${savedLabel(n.saved.by)}）` : n.infected !== null ? '（感染擋刀）' : ''}
    </span>
  ) : (
    <span style={{ color: 'var(--wolf)' }}>
      ☠️ {n.deaths.map((d) => `${d.seat} 號（${CAUSE_LABEL[d.cause]}）`).join('、')}
      {n.milkPierced && ' 💥奶穿'}
      {n.saved ? `　${n.saved.seat} 號獲救（${savedLabel(n.saved.by)}）` : ''}
    </span>
  );

  return (
    <div className="ns-row">
      <span className="ns-b">夜{n.night}</span>
      {chips.map((c, i) => <span key={i} className="ns-chip">{c.icon}{c.text}</span>)}
      {chips.length === 0 && <span className="muted">（無行動記錄）</span>}
      <span className="ns-result">{result}</span>
    </div>
  );
}

function savedLabel(by: 'guard' | 'witch' | 'both'): string {
  return by === 'guard' ? '守衛擋刀' : by === 'witch' ? '女巫解藥' : '守+救';
}
