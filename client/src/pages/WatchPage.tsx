import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SpectatorVote } from '@lycaon/engine';
import { api, type WatchData } from '../api';
import { factionColor, roleShort } from '../ui/roleStyle';

const WIN_STYLE = {
  good: { emoji: '✋', title: '好人陣營勝利', color: 'var(--good)' },
  wolf: { emoji: '🐺', title: '狼人陣營勝利', color: 'var(--wolf)' },
  lovers: { emoji: '💘', title: '情侶獲勝', color: '#f472b6' },
} as const;

export function WatchPage() {
  const { token = '' } = useParams();
  const seatKey = `lycaon:watch:${token}:seat`;
  const [seat, setSeat] = useState<number | null>(() => {
    const v = localStorage.getItem(seatKey);
    return v ? Number(v) : null;
  });
  const [data, setData] = useState<WatchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.getWatch(token, seat));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, seat]);

  useEffect(() => {
    void load();
  }, [load]);

  // SSE 即時推播 + 30s 保底輪詢 + 回到前景時刷新
  useEffect(() => {
    const es = new EventSource(`/api/watch/${token}/stream`);
    const refresh = () => void load();
    es.addEventListener('update', refresh);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    const iv = setInterval(refresh, 30000);
    const vis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      es.close();
      clearInterval(iv);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [token, load]);

  useEffect(() => {
    if (data?.title) document.title = `${data.title} · 觀戰`;
  }, [data?.title]);

  const pickSeat = (v: number | null) => {
    setSeat(v);
    if (v === null) localStorage.removeItem(seatKey);
    else localStorage.setItem(seatKey, String(v));
  };

  if (!data) {
    return (
      <div className="app">
        <p className="center muted" style={{ marginTop: 80 }}>{error ?? '連線中…'}</p>
        {error && <p className="center faint small" style={{ marginTop: 8 }}>請跟房主確認同樂模式是否開啟、連結是否正確。</p>}
      </div>
    );
  }

  const ws = data.winner ? WIN_STYLE[data.winner.faction] : null;

  return (
    <div className="app">
      <header className="watch-banner">
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <div className="grow" style={{ fontWeight: 800, fontSize: '1.05rem' }}>🐺 {data.title}</div>
          <span className={`live-dot ${live ? 'on' : ''}`}>{live ? '● 直播中' : '○ 連線中'}</span>
        </div>
        <div className={`banner-phase ${data.isNight ? 'banner-night' : 'banner-day'}`} style={{ marginTop: 2 }}>
          {data.isNight ? '🌙 ' : data.ended ? '' : '☀️ '}
          {data.phaseText}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <span className="kpi">存活 {data.aliveCount}/{data.total}</span>
          {data.sheriff !== null && <span className="kpi">★ 警長 {data.sheriff} 號</span>}
          {data.god && <span className="kpi" style={{ borderColor: '#a78bfa', color: '#c4b5fd' }}>👁 上帝視角</span>}
        </div>
      </header>

      {ws && (
        <div
          className="panel center"
          style={{ padding: '18px 14px', marginTop: 10, background: `color-mix(in srgb, ${ws.color} 14%, var(--bg-card))`, borderColor: ws.color }}
        >
          <div style={{ fontSize: '2rem' }}>{ws.emoji}</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: ws.color }}>{ws.title}</div>
          {data.winner && <div className="small muted" style={{ marginTop: 4 }}>{data.winner.reason}</div>}
        </div>
      )}

      {data.election && (
        <div className="panel" style={{ marginTop: 10, padding: 12 }}>
          <span className="small">
            🎖 警長競選中　上警：{data.election.candidates.map((s) => `${s} 號`).join('、') || '（記錄中）'}
            {data.election.withdrawn.length > 0 && ` · 退水：${data.election.withdrawn.map((s) => `${s} 號`).join('、')}`}
          </span>
        </div>
      )}

      <section className="panel" style={{ marginTop: 10 }}>
        <div className="panel-title" style={{ fontSize: '0.95rem' }}>玩家</div>
        <div className="wgrid">
          {data.players.map((p) => (
            <div key={p.seat} className={`wseat ${!p.alive ? 'wseat-dead' : ''} ${p.seat === seat ? 'wseat-me' : ''}`}>
              <div className="wseat-top">
                <span className="seat-num">{p.seat}</span>
                {p.isSheriff && <span style={{ color: 'var(--sheriff)' }}>★</span>}
                {p.lover && <span style={{ fontSize: '0.7rem' }}>💘</span>}
              </div>
              {p.role ? (
                <div className="wseat-role" style={{ color: p.converted ? 'var(--wolf)' : factionColor(p.role) }}>
                  {roleShort(p.role)}
                  {p.converted && '🦠'}
                </div>
              ) : (
                <div className="wseat-role wseat-unknown">？</div>
              )}
              {p.name && <div className="seat-name">{p.name}</div>}
              {p.idiotRevealed && <span className="chip chip-idiot">翻牌</span>}
              {!p.alive && (
                <div className="wseat-death">
                  ✕ {p.deathAt}
                  {p.deathCause ? `・${p.deathCause}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {data.votes && data.votes.length > 0 && (
        <section className="panel" style={{ marginTop: 10 }}>
          <div className="panel-title" style={{ fontSize: '0.95rem' }}>投票記錄</div>
          {[...data.votes].reverse().map((v, i) => <WatchVote key={i} v={v} />)}
        </section>
      )}

      {data.timeline && data.timeline.length > 0 && (
        <section className="panel" style={{ marginTop: 10 }}>
          <div className="panel-title" style={{ fontSize: '0.95rem' }}>事件流（新 → 舊）</div>
          <div className="wlog">
            {[...data.timeline].reverse().map((e) => (
              <div key={e.seq} className="wlog-row">
                <span className="wlog-phase">{e.phase}</span>
                <span className={e.secret ? 'wlog-secret' : ''}>{e.secret ? '🔒 ' : ''}{e.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel" style={{ marginTop: 10, marginBottom: 30, padding: 12 }}>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <span className="small">我是玩家：</span>
          <select
            className="wselect"
            value={seat ?? ''}
            onChange={(e) => pickSeat(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">只是觀眾</option>
            {data.players.map((p) => (
              <option key={p.seat} value={p.seat}>{p.seat} 號{p.name ? `（${p.name}）` : ''}</option>
            ))}
          </select>
        </div>
        <p className="faint small" style={{ marginTop: 6 }}>
          {data.settings.godViewForDead ? '出局後自動解鎖上帝視角（看得到全部身分與夜晚行動）。' : '房主未開放死者上帝視角。'}
        </p>
      </section>
    </div>
  );
}

function WatchVote({ v }: { v: SpectatorVote }) {
  const max = Math.max(1, ...v.counts.map((c) => c.votes));
  const top = v.counts[0]?.votes ?? 0;
  const abstains = v.ballots.filter((b) => b.target === null).map((b) => b.voter);
  return (
    <div className="rp-block" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <div className="rp-block-title">
        第 {v.day} 天・{v.kind === 'sheriff' ? '警長競選' : '放逐投票'}{v.round > 1 ? '（PK 輪）' : ''}
      </div>
      {v.counts.map((c) => (
        <div key={c.seat}>
          <div className="vb-row">
            <span className="vb-target">{c.seat} 號</span>
            <div className="vb-track">
              <div className={`vb-fill ${c.votes === top ? 'vb-top' : ''}`} style={{ width: `${(c.votes / max) * 100}%` }} />
            </div>
            <span className="vb-num">{Number.isInteger(c.votes) ? c.votes : c.votes.toFixed(1)}</span>
          </div>
          <div className="vb-voters">
            {v.ballots.filter((b) => b.target === c.seat).map((b) => (
              <span key={b.voter} className="vchip">{b.voter}</span>
            ))}
          </div>
        </div>
      ))}
      {abstains.length > 0 && (
        <div className="vb-voters" style={{ marginLeft: 0 }}>
          <span className="small faint" style={{ marginRight: 2 }}>棄票</span>
          {abstains.map((s) => <span key={s} className="vchip">{s}</span>)}
        </div>
      )}
      <div className="vb-outcome">{v.outcome}</div>
    </div>
  );
}
