import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  buildGameReport,
  phaseLabel,
  CAUSE_LABEL,
  ROLE_META,
  type DayIncident,
  type GameReport,
  type NightReport,
  type PlayerReport,
  type ReportCamp,
  type SeatId,
  type VoteRoundReport,
} from '@lycaon/engine';
import { useGame } from '../hooks/useGame';
import { factionColor } from '../ui/roleStyle';
import { Toast } from '../components/Toast';

const WIN_STYLE = {
  good: { emoji: '✋', title: '好人陣營勝利', color: 'var(--good)' },
  wolf: { emoji: '🐺', title: '狼人陣營勝利', color: 'var(--wolf)' },
  lovers: { emoji: '💘', title: '情侶獲勝', color: '#f472b6' },
} as const;

const CAMP_LABEL: Record<ReportCamp, { text: string; color: string }> = {
  good: { text: '✋ 好人', color: 'var(--good)' },
  wolf: { text: '🐺 狼人', color: 'var(--wolf)' },
  third: { text: '💘 三方', color: '#f472b6' },
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

      {report.highlights.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-title">數據亮點</div>
          <div className="hl-grid">
            {report.highlights.map((h, i) => (
              <div key={i} className="hl-card">
                <div className="hl-title">{h.icon} {h.title}</div>
                <div className="small muted">{h.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">玩家小結</div>
        {report.players.map((p) => <PlayerCard key={p.seat} p={p} />)}
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">夜晚復盤</div>
        {report.nights.map((n) => <NightCard key={n.night} n={n} ongoing={report.result.ongoing} />)}
        {report.nights.length === 0 && <p className="muted small">尚未入夜</p>}
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">投票與白天事件</div>
        {report.days.map((d) => (
          <div key={d.day} className="rp-day">
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
                    {d.sheriff.rounds.map((r, i) => <VoteRound key={i} r={r} />)}
                  </>
                )}
              </div>
            )}
            {d.announcedDeaths.length > 0 && (
              <div className="rp-block">
                <div className="rp-block-title">死訊公佈</div>
                <div className="small">
                  {d.announcedDeaths.map((x) => `${x.seat} 號（${CAUSE_LABEL[x.cause]}）`).join('、')}
                </div>
              </div>
            )}
            {[
              ...d.exileRounds.map((r) => ({ seq: r.seq, node: (
                <div key={`v${r.seq}`} className="rp-block">
                  <div className="rp-block-title">放逐投票{r.round > 1 ? '（PK 輪）' : ''}</div>
                  <VoteRound r={r} />
                </div>
              ) })),
              ...d.incidents.map((inc) => ({ seq: inc.seq, node: (
                <div key={`i${inc.seq}`} className="rp-incident small">{incidentText(inc)}</div>
              ) })),
            ]
              .sort((a, b) => a.seq - b.seq)
              .map((x) => x.node)}
          </div>
        ))}
        {report.days.length === 0 && <p className="muted small">尚未進入白天</p>}
      </section>

      {report.seerTrack.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-title">查驗軌跡</div>
          <div className="rp-seer">
            {report.seerTrack.map((c, i) => (
              <span key={i} className="pill" style={{ padding: '2px 10px' }}>
                N{c.night}：{c.target} 號 → {c.result === 'wolf' ? '狼🐺' : '好✋'}
              </span>
            ))}
          </div>
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

function ResultHero({ report, phaseText }: { report: GameReport; phaseText: string }) {
  const { result } = report;
  const mins = Math.max(0, Math.round((new Date(result.endedAt).getTime() - new Date(result.startedAt).getTime()) / 60000));
  const duration = mins >= 60 ? `${Math.floor(mins / 60)} 小時 ${mins % 60} 分` : `${mins} 分鐘`;
  const meta = `${result.playerCount} 人 · ${result.totalDays} 天 · ${duration}`;

  if (result.winner) {
    const ws = WIN_STYLE[result.winner.faction];
    return (
      <div
        className="panel center"
        style={{
          padding: '26px 16px',
          background: `color-mix(in srgb, ${ws.color} 14%, var(--bg-card))`,
          borderColor: ws.color,
        }}
      >
        <div style={{ fontSize: '2.6rem' }}>{ws.emoji}</div>
        <h1 style={{ fontSize: '1.5rem', color: ws.color }}>{ws.title}</h1>
        <p className="muted small" style={{ marginTop: 4 }}>{result.winner.reason}</p>
        <p className="faint small" style={{ marginTop: 8 }}>{meta}</p>
      </div>
    );
  }
  return (
    <div className="panel center" style={{ padding: '22px 16px' }}>
      <h1 style={{ fontSize: '1.3rem' }}>{result.aborted ? '對局已中止' : `對局進行中（${phaseText}）`}</h1>
      <p className="faint small" style={{ marginTop: 8 }}>{meta}</p>
    </div>
  );
}

function PlayerCard({ p }: { p: PlayerReport }) {
  const camp = CAMP_LABEL[p.finalCamp];
  const vs = p.voteStats;
  return (
    <div className={`pcard ${p.death ? 'pcard-dead' : ''}`}>
      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <span className="pcard-seat">{p.seat}</span>
        <span style={{ color: p.converted ? 'var(--wolf)' : factionColor(p.role), fontWeight: 700 }}>
          {ROLE_META[p.role].name}
          {p.converted && '（被感染）'}
        </span>
        {p.name && <span className="faint small">{p.name}</span>}
        {p.everSheriff && <span title="曾任警長">★</span>}
        {p.lover && <span>💘</span>}
        {p.idiotRevealed && <span className="chip chip-idiot">翻牌</span>}
        <span className="spacer" />
        <span className="small" style={{ color: camp.color }}>{camp.text}</span>
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>
        {p.death
          ? `💀 第 ${p.death.day} ${p.death.during === 'night' ? '夜' : '天'} ${CAUSE_LABEL[p.death.cause]}${p.death.poisoned && p.death.cause !== 'poison' ? '（中毒）' : ''}`
          : '✨ 存活到最後'}
        {p.convertedOnNight !== null && ` · 🦠 第 ${p.convertedOnNight} 夜被感染`}
      </div>
      <div className="small faint" style={{ marginTop: 2 }}>
        {vs.countable > 0
          ? `🗳️ 投狼命中 ${vs.hitWolf}/${vs.countable}（${Math.round(vs.accuracy! * 100)}%）`
          : '🗳️ 無計分票'}
        {vs.abstain > 0 && ` · 棄票 ×${vs.abstain}`}
      </div>
    </div>
  );
}

function NightCard({ n, ongoing }: { n: NightReport; ongoing: boolean }) {
  const lines: string[] = [];
  if (n.cupid) lines.push(`💘 連結 ${n.cupid.a} 號 & ${n.cupid.b} 號${n.cupid.thirdParty ? '（跨陣營 → 第三方）' : ''}`);
  if (n.guardTarget !== undefined) lines.push(n.guardTarget === null ? '🛡️ 空守' : `🛡️ 守 ${n.guardTarget} 號`);
  if (n.wolfTarget !== undefined) lines.push(n.wolfTarget === null ? '🔪 空刀' : `🔪 刀 ${n.wolfTarget} 號`);
  if (n.infected !== null) lines.push(`🦠 感染 ${n.infected} 號（轉入狼陣營）`);
  if (n.witchSave !== null) lines.push(`🧪 解藥救 ${n.witchSave} 號`);
  if (n.witchPoison !== null) lines.push(`☠️ 毒 ${n.witchPoison} 號`);
  if (n.seer) lines.push(`🔮 驗 ${n.seer.target} 號 → ${n.seer.result === 'wolf' ? '狼人 🐺' : '好人 ✋'}`);

  return (
    <div className="rp-night">
      <div className="rp-day-label">第 {n.night} 夜</div>
      {lines.map((l, i) => <div key={i} className="small">{l}</div>)}
      {lines.length === 0 && <div className="small muted">（無行動記錄）</div>}
      <div className="small" style={{ marginTop: 4 }}>
        {!n.settled ? (
          <span className="muted">{ongoing ? '夜晚進行中…' : '夜晚未結算（對局在此中止）'}</span>
        ) : n.peaceful ? (
          <span style={{ color: 'var(--good)' }}>🌤️ 平安夜{n.saved ? `（${n.saved.seat} 號獲救：${savedLabel(n.saved.by)}）` : ''}{n.infected !== null ? '（感染擋刀）' : ''}</span>
        ) : (
          <span style={{ color: 'var(--wolf)' }}>
            ☠️ {n.deaths.map((d) => `${d.seat} 號（${CAUSE_LABEL[d.cause]}）`).join('、')}
            {n.milkPierced && ' 💥 同守同救'}
            {n.saved ? `　${n.saved.seat} 號獲救（${savedLabel(n.saved.by)}）` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function savedLabel(by: 'guard' | 'witch' | 'both'): string {
  return by === 'guard' ? '守衛擋刀' : by === 'witch' ? '女巫解藥' : '守+救';
}

function VoteRound({ r }: { r: VoteRoundReport }) {
  const abstains = r.ballots.filter((b) => b.target === null).map((b) => b.voter);
  const votersOf = (seat: SeatId) => r.ballots.filter((b) => b.target === seat).map((b) => b.voter);
  return (
    <div style={{ marginTop: 4 }}>
      {r.pkSeats && <div className="small muted">PK：{r.pkSeats.map((s) => `${s} 號`).join(' vs ')}</div>}
      {r.counts.map((c) => (
        <div key={c.seat} className="rp-voteline small">
          <b>{c.seat} 號</b> ← {votersOf(c.seat).join('、')}（{Number.isInteger(c.votes) ? c.votes : c.votes.toFixed(1)} 票）
        </div>
      ))}
      {r.counts.length === 0 && <div className="small muted">全員棄票</div>}
      {abstains.length > 0 && <div className="small faint">棄票：{abstains.join('、')}</div>}
      <div className="small" style={{ marginTop: 2 }}>{outcomeText(r)}</div>
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
      const camp = inc.targetCamp ? CAMP_LABEL[inc.targetCamp].text : '';
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
