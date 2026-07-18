import type { Ballot } from './types/events';
import type { SeatId } from './types/rules';
import type { RoleId } from './types/roles';
import type { GameState } from './types/state';
import type { Victory } from './victory';
import type { GameReport, VoteCount } from './report';
import { CAUSE_LABEL } from './day/deaths';
import { gameProgress } from './selectors';
import { activeCandidates } from './day/sheriff';

/**
 * 同樂模式（觀戰端）的視角過濾。server 以此產出對外 payload——
 * 過濾一律在 server 端做，觀戰者從網路層拿不到未公開的情報。
 *
 * 統一視角（無身份、人人同一份）：夜晚拉夜幕什麼都不報，白天只報「今天」的戰況
 * （前幾天的投票與事件流不再顯示，玩家自己記），終局才全攤牌。
 */

export interface ShareSettings {
  /** 同樂模式總開關 */
  enabled: boolean;
  /** 公開投票明細（桌上本來就是舉手投票，預設開） */
  showVotes: boolean;
  /** 死者身分立即公開（有些局想留到終局才攤牌，預設關） */
  showDeadRoles: boolean;
  /** 公開時間軸（GM 口播等級的公開事件） */
  showTimeline: boolean;
  /** 觀戰聊天室（預設關；關閉時歷史與發言 API 一律拒絕） */
  showChat: boolean;
  /** 盤面死者格顯示死亡時間與死因（預設關；終局一律顯示） */
  showDeathInfo: boolean;
}

export const DEFAULT_SHARE: ShareSettings = {
  enabled: false,
  showVotes: true,
  showDeadRoles: false,
  showTimeline: true,
  showChat: false,
  showDeathInfo: false,
};

/** 觀戰畫面階段：準備 / 夜幕 / 今日戰況 / 終局 */
export type SpectatorStage = 'setup' | 'night' | 'day' | 'ended';

export interface SpectatorPlayer {
  seat: SeatId;
  name?: string;
  alive: boolean;
  isSheriff: boolean;
  idiotRevealed: boolean;
  /** null = 身分未公開 */
  role: RoleId | null;
  /** 繁中死因；僅白天死亡（公開事件）或終局才給 */
  deathCause: string | null;
  /** 死亡時間（「第 2 夜」）；死亡是公開事實，一律給 */
  deathAt: string | null;
  /** 僅終局為真實值，其餘一律 false */
  lover: boolean;
  converted: boolean;
}

export interface SpectatorVote {
  kind: 'sheriff' | 'exile';
  day: number;
  round: number;
  counts: VoteCount[];
  ballots: Ballot[];
  outcome: string;
}

export interface SpectatorView {
  phaseText: string;
  day: number;
  stage: SpectatorStage;
  ended: boolean;
  winner: Victory | null;
  aliveCount: number;
  total: number;
  sheriff: SeatId | null;
  election: { candidates: SeatId[]; withdrawn: SeatId[] } | null;
  players: SpectatorPlayer[];
  /** 只含「今天」的投票（終局為全部）；showVotes 關 = null */
  votes: SpectatorVote[] | null;
  /** 只含「今天白天」的公開事件（終局為全部）；showTimeline 關 = null */
  timeline: { seq: number; at: string; phase: string; text: string; secret: boolean }[] | null;
  settings: Omit<ShareSettings, 'enabled'>;
}

function voteOutcome(v: SpectatorVote['kind'], o: GameReport['days'][number]['exileRounds'][number]['outcome']): string {
  switch (o.t) {
    case 'exiled':
      return `⚖️ ${o.seat} 號被放逐${o.chained.length > 0 ? ` → ${o.chained.map((c) => `${c.seat} 號${CAUSE_LABEL[c.cause]}`).join('、')}` : ''}`;
    case 'idiotRevealed':
      return `🃏 ${o.seat} 號翻牌【白癡】免死`;
    case 'elected':
      return `★ ${o.seat} 號當選警長`;
    case 'pk':
      return `平票：${o.seats.map((s) => `${s} 號`).join('、')}進入 PK`;
    case 'none':
      return v === 'sheriff' ? '本局無警長' : '🕊️ 無人被放逐（平安日）';
  }
}

/**
 * 產出觀戰視角（統一視角，無 viewerSeat）。
 * - 身分公開條件：終局 / 翻牌白癡 / 自爆狼 / 翻牌騎士 / 亮牌開槍 /（死亡且 showDeadRoles）
 * - 夜晚暫存、待公佈死亡、查驗結果一律不出現在結構中
 * - 「只報今天」：投票與事件流過濾成當前 state.day（終局不過濾、全公開）
 */
export function buildSpectatorView(state: GameState, settings: ShareSettings, report?: GameReport | null): SpectatorView {
  const ended = state.phase.t === 'ended';
  const stage: SpectatorStage = ended
    ? 'ended'
    : state.phase.t === 'night'
      ? 'night'
      : state.phase.t === 'setup'
        ? 'setup'
        : 'day';
  const revealAll = ended;
  const today = state.day;
  const showToday = (d: number): boolean => revealAll || d === today; // 只報今天；終局全公開

  const players: SpectatorPlayer[] = state.players.map((p) => {
    // 自曝身分：翻牌白癡、自爆狼、翻牌騎士、亮牌開槍的獵人/黑狼王（線下都是當眾翻牌）
    const selfRevealed =
      p.idiotRevealed ||
      p.death?.cause === 'explode' ||
      ((p.role === 'knight' || p.role === 'hunter' || p.role === 'blackWolfKing') && p.skillUsed);
    const reveal = revealAll || selfRevealed || (!p.alive && settings.showDeadRoles);
    // 死因：白天死亡（放逐/開槍/決鬥/自爆/白天殉情）是全場親見的公開事件；
    // 夜間死因（刀/毒/奶穿/夜殉情）即使明牌局線下也不公佈——翻的是牌、不是死法
    const causePublic = p.death && (revealAll || p.death.during === 'day');
    // 死亡時間/死因整組受 showDeathInfo 開關管（終局不受限）
    const deathInfo = revealAll || settings.showDeathInfo;
    return {
      seat: p.seat,
      name: p.name,
      alive: p.alive,
      isSheriff: state.sheriff === p.seat,
      idiotRevealed: p.idiotRevealed,
      role: reveal ? p.role : null,
      deathCause: deathInfo && causePublic ? CAUSE_LABEL[p.death!.cause] : null,
      deathAt: deathInfo && p.death ? `第 ${p.death.day} ${p.death.during === 'night' ? '夜' : '天'}` : null,
      lover: revealAll ? (state.lovers?.includes(p.seat) ?? false) : false,
      converted: revealAll ? p.converted : false,
    };
  });

  const votes: SpectatorVote[] | null =
    (settings.showVotes || revealAll) && report
      ? report.days
          .flatMap((d) => [...(d.sheriff?.rounds ?? []), ...d.exileRounds])
          .filter((r) => showToday(r.day))
          .sort((a, b) => a.seq - b.seq)
          .map((r) => ({
            kind: r.kind,
            day: r.day,
            round: r.round,
            counts: r.counts,
            ballots: r.ballots,
            outcome: voteOutcome(r.kind, r.outcome),
          }))
      : null;

  const timeline =
    settings.showTimeline || revealAll
      ? state.log
          .filter((e) => e.kind !== 'note') // GM 筆記任何視角（含終局）都不外流
          .filter((e) => (revealAll ? true : !e.secret))
          .filter((e) => (e.kind === 'ballots' ? settings.showVotes || revealAll : true))
          .filter((e) => showToday(e.day)) // 只報今天
          // 白天板不顯示夜晚事件（夜N 與 日N 同一 day，「天黑請閉眼」等屬夜幕、不進白天板）；終局全留
          .filter((e) => revealAll || !e.phase.includes('夜'))
          .map((e) => ({ seq: e.seq, at: e.at, phase: e.phase, text: e.text, secret: e.secret }))
      : null;

  const progress = gameProgress(state);
  const electionOpen = state.election !== null && !state.election.done;

  return {
    phaseText: progress.label,
    day: state.day,
    stage,
    ended,
    winner: state.winner,
    aliveCount: progress.alive,
    total: progress.total,
    sheriff: state.sheriff,
    election: electionOpen ? { candidates: activeCandidates(state), withdrawn: state.election!.withdrawn } : null,
    players,
    votes,
    timeline,
    settings: {
      showVotes: settings.showVotes,
      showDeadRoles: settings.showDeadRoles,
      showTimeline: settings.showTimeline,
      showChat: settings.showChat,
      showDeathInfo: settings.showDeathInfo,
    },
  };
}
