import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import type { SpectatorVote } from '@lycaon/engine';
import { api, type WatchData } from '../api';
import { factionColor, roleShort } from '../ui/roleStyle';
import { ChatFab } from '../components/ChatFab';
import { ChatRoom } from '../components/ChatRoom';
import { useChatUnread } from '../hooks/useChatUnread';

/** 勝方樣式（GhostPage 全知終局畫面共用） */
export const WIN_STYLE = {
  good: { emoji: '✋', title: '好人陣營勝利', color: 'var(--good)' },
  wolf: { emoji: '🐺', title: '狼人陣營勝利', color: 'var(--wolf)' },
  lovers: { emoji: '💘', title: '情侶獲勝', color: '#f472b6' },
} as const;

/** 事件時間 HH:MM（envelope.at 供顯示）（GhostPage 共用） */
export const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 統一視角觀戰頁：夜晚拉夜幕、白天只報今天、終局全攤牌；無身份、人人同一份 */
export function WatchPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<WatchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatEnabled = !!data?.settings.showChat && !error;
  const unread = useChatUnread({ base: 'watch', token, scope: 'watch' }, chatOpen, chatEnabled);

  const load = useCallback(async () => {
    try {
      setData(await api.getWatch(token));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // SSE 即時推播（夜間祕密行動 server 不推）+ 30s 保底輪詢 + 回前景刷新
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

  if (!data) {
    return (
      <div className="app">
        <p className="center muted" style={{ marginTop: 80 }}>{error ?? '連線中…'}</p>
        {error && <p className="center faint small" style={{ marginTop: 8 }}>請跟房主確認同樂模式是否開啟、連結是否正確。</p>}
      </div>
    );
  }

  const { stage } = data;
  const board = stage === 'day' || stage === 'ended';
  const ws = data.winner ? WIN_STYLE[data.winner.faction] : null;
  const phaseIcon = stage === 'night' ? '🌙 ' : stage === 'day' ? '☀️ ' : '';

  return (
    <div className="app">
      <header className="watch-banner">
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <div className="grow" style={{ fontWeight: 800, fontSize: '1.05rem' }}>🐺 {data.title}</div>
          <span className={`live-dot ${live ? 'on' : ''}`}>{live ? '● 直播中' : '○ 連線中'}</span>
        </div>
        <div className={`banner-phase ${stage === 'night' ? 'banner-night' : 'banner-day'}`} style={{ marginTop: 2 }}>
          {phaseIcon}{data.phaseText}
        </div>
        {board && (
          <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="kpi">存活 {data.aliveCount}/{data.total}</span>
            {data.sheriff !== null && <span className="kpi">★ 警長 {data.sheriff} 號</span>}
          </div>
        )}
      </header>

      {stage === 'setup' && (
        <div className="panel night-curtain">
          <div style={{ fontSize: '2.6rem' }}>🌑</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>準備開局</div>
          <p className="faint small" style={{ marginTop: 6 }}>天黑後開始直播今天的戰況</p>
        </div>
      )}

      {stage === 'night' && (
        <div className="panel night-curtain">
          <div style={{ fontSize: '3rem' }}>🌙</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a5b4fc' }}>第 {data.day} 夜</div>
          <p className="muted" style={{ marginTop: 6 }}>天黑請閉眼…</p>
          <p className="faint small" style={{ marginTop: 2 }}>天亮後回來看今天的戰況</p>
        </div>
      )}

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

      {board && (
        <>
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
                <div key={p.seat} className={`wseat ${!p.alive ? 'wseat-dead' : ''}`}>
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
              <div className="panel-title" style={{ fontSize: '0.95rem' }}>{stage === 'ended' ? '投票記錄' : '今日投票'}</div>
              {[...data.votes].reverse().map((v, i) => <WatchVote key={i} v={v} />)}
            </section>
          )}

          {data.timeline && data.timeline.length > 0 && (
            <section className="panel" style={{ marginTop: 10, marginBottom: 30 }}>
              <div className="panel-title" style={{ fontSize: '0.95rem' }}>{stage === 'ended' ? '事件回顧' : '今日戰況'}（新 → 舊）</div>
              <div className="wlog">
                {[...data.timeline].reverse().map((e) => (
                  <div key={e.seq} className="wlog-row">
                    <span className="wlog-phase">{stage === 'ended' ? e.phase : fmtTime(e.at)}</span>
                    <span className={e.secret ? 'wlog-secret' : ''}>{e.secret ? '🔒 ' : ''}{e.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {data.settings.showChat && (
        <ChatFab
          icon={MessageCircle}
          label="聊天室"
          accent="var(--accent)"
          unread={unread}
          open={chatOpen}
          onToggle={() => setChatOpen((v) => !v)}
          slot={0}
        >
          <ChatRoom token={token} live={live} disabled={!!error} />
        </ChatFab>
      )}
    </div>
  );
}

/** 投票明細區塊（GhostPage 全知投票列表共用） */
export function WatchVote({ v }: { v: SpectatorVote }) {
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
