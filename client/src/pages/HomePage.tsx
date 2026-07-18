import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type GameSummary } from '../api';

const STATUS_LABEL: Record<GameSummary['status'], string> = {
  active: '進行中',
  finished: '已結束',
  aborted: '已中止',
};

const WIN_STYLE: Record<string, { emoji: string; label: string; color: string }> = {
  good: { emoji: '✋', label: '好人勝利', color: 'var(--good)' },
  wolf: { emoji: '🐺', label: '狼人勝利', color: 'var(--wolf)' },
  lovers: { emoji: '💘', label: '情侶勝利', color: '#f472b6' },
};

/** 進行中對局的進度短句：「🌙 第 2 夜 · 存活 8/12」 */
function progressText(g: GameSummary): string {
  const p = g.progress;
  if (!p) return `${g.playerCount} 人`;
  if (p.phase === 'setup') return `準備開局 · ${p.total} 人`;
  const icon = p.phase === 'night' ? '🌙 ' : p.phase === 'day' ? '☀️ ' : '';
  return `${icon}${p.label} · 存活 ${p.alive}/${p.total}`;
}

export function HomePage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = () => {
    setLoading(true);
    api
      .listGames()
      .then(setGames)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const active = games.filter((g) => g.status === 'active');
  const history = games.filter((g) => g.status !== 'active');

  const remove = async (id: string, title: string) => {
    if (!confirm(`確定刪除「${title}」？無法復原。`)) return;
    await api.deleteGame(id);
    load();
  };

  return (
    <div className="app">
      <header style={{ padding: '24px 0 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.4rem' }}>🐺</div>
        <h1 style={{ fontSize: '1.6rem', letterSpacing: 2 }}>狼人殺 GM</h1>
        <p className="muted small">主持人控場儀表板</p>
      </header>

      <button className="btn btn-primary btn-lg btn-block" onClick={() => nav('/new')}>
        ＋ 開新的一局
      </button>

      {active.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 className="small muted" style={{ marginBottom: 8 }}>進行中</h2>
          {active.map((g) => (
            <Link key={g.id} to={`/game/${g.id}`} className="card" style={{ display: 'block', marginBottom: 10, textDecoration: 'none', color: 'inherit', borderColor: 'var(--accent-dim)' }}>
              <div className="row" style={{ alignItems: 'center' }}>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{g.locked && '🔒 '}{g.title}</div>
                  <div className="faint small">{progressText(g)} · {fmtDate(g.updatedAt)}</div>
                </div>
                <span className="btn btn-primary btn-sm">繼續主持 →</span>
              </div>
            </Link>
          ))}
        </section>
      )}

      {history.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 className="small muted" style={{ marginBottom: 8 }}>歷史對局</h2>
          {history.map((g) => {
            const win = g.progress?.winner ? WIN_STYLE[g.progress.winner] : undefined;
            return (
              <div key={g.id} className="card" style={{ marginBottom: 8, padding: 12 }}>
                <div className="row" style={{ alignItems: 'center' }}>
                  <Link to={`/game/${g.id}/report`} className="grow" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontWeight: 600 }}>{g.title}</div>
                    <div className="faint small">
                      {win ? (
                        <span className="pill" style={{ padding: '1px 8px', borderColor: win.color, color: win.color }}>
                          {win.emoji} {win.label}
                        </span>
                      ) : (
                        <span className="pill" style={{ padding: '1px 8px' }}>{STATUS_LABEL[g.status]}</span>
                      )}{' '}
                      {g.playerCount} 人{g.progress && g.progress.day > 0 ? ` · ${g.progress.day} 天` : ''} · {fmtDate(g.createdAt)}
                    </div>
                  </Link>
                  <button className="btn btn-ghost btn-sm faint" onClick={() => remove(g.id, g.title)}>刪除</button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {loading && <p className="center muted" style={{ marginTop: 40 }}>載入中…</p>}
      {!loading && games.length === 0 && (
        <p className="center muted" style={{ marginTop: 40 }}>還沒有對局，開一局試試吧</p>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
