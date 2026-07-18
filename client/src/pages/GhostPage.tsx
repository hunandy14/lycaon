import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Ghost, MessageCircle } from 'lucide-react';
import { api, type GhostData } from '../api';
import { factionColor, roleShort } from '../ui/roleStyle';
import { ChatFab } from '../components/ChatFab';
import { ChatRoom } from '../components/ChatRoom';
import { useChatUnread } from '../hooks/useChatUnread';
import { WIN_STYLE, fmtTime, WatchVote } from './WatchPage';

const eyeKey = (token: string) => `lycaon:ghosteye:${token}`;

/** phase 顯示字串（如「第 2 天」「第 3 夜」）解析出天數，供本地「未開眼」模式重現觀眾等級的
 *  「只報今天／夜晚不顯示」過濾（GhostView 的 timeline 未附原始 day 欄位，只能靠字串解析）。 */
const phaseDay = (phase: string): number | null => {
  const m = phase.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

/**
 * 陰間（死者視角）連結頁：token 即憑證，免密碼。
 * canReveal=false（god:false）：連結降級為觀眾等級畫面，不顯示開眼開關。
 * canReveal=true（god:true）：多一顆「開天眼」，本機記憶（lycaon:ghosteye:<token>），
 *   未開眼時本地重現觀眾等級的過濾（今天/白天板），開眼才顯示全底牌與全知時間軸/查驗紀錄。
 */
export function GhostPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<GhostData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [eye, setEye] = useState(() => localStorage.getItem(eyeKey(token)) === '1');
  const [openChat, setOpenChat] = useState<'ghost' | 'watch' | null>(null);
  const watchChatEnabled = !!data?.settings.showChat && !error;
  const ghostUnread = useChatUnread({ base: 'ghost', token, scope: 'ghost' }, openChat === 'ghost', !error);
  const watchUnread = useChatUnread({ base: 'ghost', token, scope: 'watch' }, openChat === 'watch', watchChatEnabled);

  const load = useCallback(async () => {
    try {
      setData(await api.getGhost(token));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const es = new EventSource(`/api/ghost/${token}/stream`);
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
    if (data?.title) document.title = `${data.title} · 陰間`;
  }, [data?.title]);

  const toggleEye = () => {
    setEye((prev) => {
      const next = !prev;
      localStorage.setItem(eyeKey(token), next ? '1' : '0');
      return next;
    });
  };

  if (!data) {
    return (
      <div className="app">
        <p className="center muted" style={{ marginTop: 80 }}>{error ?? '連線中…'}</p>
        {error && <p className="center faint small" style={{ marginTop: 8 }}>請跟房主確認陰間模式是否開啟、連結是否正確。</p>}
      </div>
    );
  }

  const reveal = data.god && eye;
  const { stage } = data;
  const board = reveal || stage === 'day' || stage === 'ended';
  const ws = data.winner ? WIN_STYLE[data.winner.faction] : null;
  const phaseIcon = stage === 'night' ? '🌙 ' : stage === 'day' ? '☀️ ' : '';

  // 未開眼（含 god:false 降級與 god:true 但本機遮眼）一律只顯示今天，且夜晚事件不進白天板
  const votes = reveal
    ? data.god
      ? data.votes
      : []
    : data.god
      ? data.votes.filter((v) => v.day === data.day)
      : (data.votes ?? []);
  const timeline = reveal
    ? data.god
      ? data.timeline
      : []
    : data.god
      ? data.timeline.filter((e) => !e.secret && phaseDay(e.phase) === data.day && !e.phase.includes('夜'))
      : (data.timeline ?? []);
  const showVotesSection = reveal ? true : data.settings.showVotes;
  const showTimelineSection = reveal ? true : data.settings.showTimeline;

  return (
    <div className="app">
      <header className="watch-banner">
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <div className="grow" style={{ fontWeight: 800, fontSize: '1.05rem' }}>👻 {data.title}</div>
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
        {data.god && (
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={toggleEye}>
            {eye ? '🙈 遮眼（回觀眾視角）' : '🔓 開天眼（看全部底牌）'}
          </button>
        )}
      </header>

      {stage === 'setup' && !reveal && (
        <div className="panel night-curtain">
          <div style={{ fontSize: '2.6rem' }}>🌑</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>準備開局</div>
          <p className="faint small" style={{ marginTop: 6 }}>天黑後開始直播今天的戰況</p>
        </div>
      )}

      {stage === 'night' && !reveal && (
        <div className="panel night-curtain">
          <div style={{ fontSize: '3rem' }}>🌙</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a5b4fc' }}>第 {data.day} 夜</div>
          <p className="muted" style={{ marginTop: 6 }}>天黑請閉眼…</p>
          <p className="faint small" style={{ marginTop: 2 }}>{data.god ? '開天眼可看夜間動態' : '天亮後回來看今天的戰況'}</p>
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

          {reveal && data.god && data.pendingDeaths.length > 0 && (
            <div className="panel" style={{ marginTop: 10, padding: 12 }}>
              <span className="small">🕯 待公佈死亡：{data.pendingDeaths.map((d) => `${d.seat} 號`).join('、')}</span>
            </div>
          )}

          <section className="panel" style={{ marginTop: 10 }}>
            <div className="panel-title" style={{ fontSize: '0.95rem' }}>玩家</div>
            <div className="wgrid">
              {data.players.map((p) => {
                const role = reveal ? p.role : null;
                const lover = reveal && p.lover;
                const converted = reveal && p.converted;
                return (
                  <div key={p.seat} className={`wseat ${!p.alive ? 'wseat-dead' : ''}`}>
                    <div className="wseat-top">
                      <span className="seat-num">{p.seat}</span>
                      {p.isSheriff && <span style={{ color: 'var(--sheriff)' }}>★</span>}
                      {lover && <span style={{ fontSize: '0.7rem' }}>💘</span>}
                    </div>
                    {role ? (
                      <div className="wseat-role" style={{ color: converted ? 'var(--wolf)' : factionColor(role) }}>
                        {roleShort(role)}
                        {converted && '🦠'}
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
                );
              })}
            </div>
          </section>

          {reveal && data.god && data.seerChecks.length > 0 && (
            <section className="panel" style={{ marginTop: 10 }}>
              <div className="panel-title" style={{ fontSize: '0.95rem' }}>🔮 查驗紀錄</div>
              {data.seerChecks.map((s, i) => (
                <div key={i} className="small" style={{ padding: '4px 0' }}>
                  第 {s.night} 夜　{s.target} 號　→　{s.result === 'good' ? '好人' : '狼人'}
                </div>
              ))}
            </section>
          )}

          {showVotesSection && votes.length > 0 && (
            <section className="panel" style={{ marginTop: 10 }}>
              <div className="panel-title" style={{ fontSize: '0.95rem' }}>{stage === 'ended' || reveal ? '投票記錄' : '今日投票'}</div>
              {[...votes].reverse().map((v, i) => <WatchVote key={i} v={v} />)}
            </section>
          )}

          {showTimelineSection && timeline.length > 0 && (
            <section className="panel" style={{ marginTop: 10, marginBottom: 30 }}>
              <div className="panel-title" style={{ fontSize: '0.95rem' }}>{reveal ? '全知事件回顧（含夜晚）' : stage === 'ended' ? '事件回顧' : '今日戰況'}（新 → 舊）</div>
              <div className="wlog">
                {[...timeline].reverse().map((e) => (
                  <div key={e.seq} className="wlog-row">
                    <span className="wlog-phase">{reveal ? e.phase : fmtTime(e.at)}</span>
                    <span className={e.secret ? 'wlog-secret' : ''}>{e.secret ? '🔒 ' : ''}{e.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <ChatFab
        icon={Ghost}
        label="陰間聊天室"
        accent="#a78bfa"
        unread={ghostUnread}
        open={openChat === 'ghost'}
        onToggle={() => setOpenChat((v) => (v === 'ghost' ? null : 'ghost'))}
        slot={0}
      >
        <ChatRoom token={token} base="ghost" scope="ghost" live={live} disabled={!!error} />
      </ChatFab>
      {data.settings.showChat && (
        <ChatFab
          icon={MessageCircle}
          label="陽間聊天室"
          accent="var(--accent)"
          unread={watchUnread}
          open={openChat === 'watch'}
          onToggle={() => setOpenChat((v) => (v === 'watch' ? null : 'watch'))}
          slot={1}
        >
          <ChatRoom token={token} base="ghost" scope="watch" live={live} disabled={!!error} />
        </ChatFab>
      )}
    </div>
  );
}
