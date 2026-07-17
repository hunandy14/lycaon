import { Link, useParams } from 'react-router-dom';
import { ROLE_META } from '@lycaon/engine';
import { factionColor } from '../ui/roleStyle';
import type { PanelProps } from './types';

const WIN_STYLE = {
  good: { emoji: '✋', title: '好人陣營勝利', color: 'var(--good)' },
  wolf: { emoji: '🐺', title: '狼人陣營勝利', color: 'var(--wolf)' },
  lovers: { emoji: '💘', title: '情侶獲勝', color: '#f472b6' },
} as const;

export function GameOverPanel({ state }: PanelProps) {
  const { id = '' } = useParams();
  const win = state.winner;
  const ws = WIN_STYLE[win?.faction ?? 'good'];

  return (
    <div>
      <div
        className="panel"
        style={{
          textAlign: 'center',
          padding: '32px 16px',
          background: `color-mix(in srgb, ${ws.color} 14%, var(--bg-card))`,
          borderColor: ws.color,
        }}
      >
        <div style={{ fontSize: '3rem' }}>{ws.emoji}</div>
        <h1 style={{ fontSize: '1.8rem', color: ws.color }}>{ws.title}</h1>
        {win && <p className="muted" style={{ marginTop: 6 }}>{win.reason}</p>}
      </div>

      <Link to={`/game/${id}/report`} className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }}>
        📊 查看終局報表
      </Link>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">身分公開</div>
        <div className="reveal-list">
          {state.players.map((p) => (
            <div key={p.seat} className={`reveal-row ${p.alive ? '' : 'reveal-dead'}`}>
              <span className="reveal-seat">{p.seat}</span>
              <span className="reveal-role" style={{ color: p.converted ? 'var(--wolf)' : factionColor(p.role) }}>
                {ROLE_META[p.role].name}
                {p.converted && '（被感染）'}
              </span>
              {state.lovers?.includes(p.seat) && <span>💘</span>}
              {p.name && <span className="faint small">{p.name}</span>}
              <span className="spacer" />
              <span className="small muted">{p.alive ? '存活' : '出局'}</span>
              {state.sheriff === p.seat && <span className="seat-badge" style={{ position: 'static' }}>★</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
