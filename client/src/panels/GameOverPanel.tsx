import { ROLE_META } from '@lycaon/engine';
import { factionColor } from '../ui/roleStyle';
import type { PanelProps } from './types';

export function GameOverPanel({ state }: PanelProps) {
  const win = state.winner;
  const good = win?.faction === 'good';

  return (
    <div>
      <div
        className="panel"
        style={{
          textAlign: 'center',
          padding: '32px 16px',
          background: good ? 'color-mix(in srgb, var(--good) 14%, var(--bg-card))' : 'color-mix(in srgb, var(--wolf) 14%, var(--bg-card))',
          borderColor: good ? 'var(--good)' : 'var(--wolf)',
        }}
      >
        <div style={{ fontSize: '3rem' }}>{good ? '✋' : '🐺'}</div>
        <h1 style={{ fontSize: '1.8rem', color: good ? 'var(--good)' : 'var(--wolf)' }}>
          {good ? '好人陣營勝利' : '狼人陣營勝利'}
        </h1>
        {win && <p className="muted" style={{ marginTop: 6 }}>{win.reason}</p>}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">身分公開</div>
        <div className="reveal-list">
          {state.players.map((p) => (
            <div key={p.seat} className={`reveal-row ${p.alive ? '' : 'reveal-dead'}`}>
              <span className="reveal-seat">{p.seat}</span>
              <span className="reveal-role" style={{ color: factionColor(p.role) }}>{ROLE_META[p.role].name}</span>
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
