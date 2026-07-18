import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_META, type RoleId } from '@lycaon/engine';
import { api, type PlayerStat } from '../api';
import { factionColor } from '../ui/roleStyle';

export function StatsPage() {
  const [data, setData] = useState<{ totalGames: number; players: PlayerStat[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getStats().then(setData).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="app">
      <header className="row" style={{ alignItems: 'center', padding: '14px 0' }}>
        <Link to="/" className="btn btn-ghost btn-sm">← 返回</Link>
        <h2 className="grow center" style={{ fontSize: '1.1rem' }}>玩家戰績</h2>
        <span style={{ width: 52 }} />
      </header>

      {!data && <p className="center muted" style={{ marginTop: 60 }}>{error ?? '載入中…'}</p>}

      {data && data.players.length === 0 && (
        <p className="center muted" style={{ marginTop: 60 }}>
          還沒有戰績。開局時幫座位輸入名字，打完一局分出勝負後就會統計。
        </p>
      )}

      {data && data.players.length > 0 && (
        <>
          <p className="faint small" style={{ marginBottom: 12 }}>
            共 {data.totalGames} 場已結束對局 · {data.players.length} 位玩家（依場次排序；同名視為同一人）
          </p>
          {data.players.map((p) => <StatCard key={p.name} p={p} />)}
        </>
      )}
    </div>
  );
}

function StatCard({ p }: { p: PlayerStat }) {
  const pct = Math.round(p.winRate * 100);
  const rateColor = pct >= 60 ? 'var(--villager)' : pct >= 40 ? 'var(--god)' : 'var(--wolf)';
  const roles = (Object.entries(p.byRole) as [RoleId, number][]).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel" style={{ marginBottom: 10, padding: 14 }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{p.name}</div>
        <span className="spacer" />
        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: rateColor, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        <span className="faint small">勝率</span>
      </div>

      <div className="stat-bar" style={{ margin: '8px 0' }}>
        <div className="stat-bar-fill" style={{ width: `${pct}%`, background: rateColor }} />
      </div>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="kpi">{p.games} 場 · {p.wins} 勝</span>
        {p.asGood.games > 0 && (
          <span className="kpi" style={{ borderColor: 'var(--good)', color: 'var(--good)' }}>
            好人 {p.asGood.wins}/{p.asGood.games}（{Math.round((p.asGood.wins / p.asGood.games) * 100)}%）
          </span>
        )}
        {p.asWolf.games > 0 && (
          <span className="kpi" style={{ borderColor: 'var(--wolf)', color: 'var(--wolf)' }}>
            狼 {p.asWolf.wins}/{p.asWolf.games}（{Math.round((p.asWolf.wins / p.asWolf.games) * 100)}%）
          </span>
        )}
      </div>

      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {roles.map(([role, n]) => (
          <span key={role} className="pill" style={{ color: factionColor(role), padding: '1px 8px', fontSize: '0.72rem' }}>
            {ROLE_META[role].name}{n > 1 ? ` ×${n}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
