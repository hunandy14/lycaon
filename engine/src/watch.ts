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
  /** 死者可看上帝視角 */
  godViewForDead: boolean;
}

export const DEFAULT_SHARE: ShareSettings = {
  enabled: false,
  showVotes: true,
  showDeadRoles: false,
  showTimeline: true,
  // 信任制（觀戰者自選座位）無法阻止活玩家假冒死者，預設關、由房主在熟人局自行開
  godViewForDead: false,
};

export interface SpectatorPlayer {
  seat: SeatId;
  name?: string;
  alive: boolean;
  isSheriff: boolean;
  idiotRevealed: boolean;
  /** null = 身分未公開 */
  role: RoleId | null;
  /** 繁中死因；僅在身分公開時給 */
  deathCause: string | null;
  /** 死亡時間（「第 2 夜」）；死亡是公開事實，一律給 */
  deathAt: string | null;
  /** 僅上帝視角/終局為真實值，其餘一律 false */
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
  isNight: boolean;
  ended: boolean;
  /** 本回應是否為上帝視角 */
  god: boolean;
  winner: Victory | null;
  aliveCount: number;
  total: number;
  sheriff: SeatId | null;
  election: { candidates: SeatId[]; withdrawn: SeatId[] } | null;
  players: SpectatorPlayer[];
  votes: SpectatorVote[] | null;
  timeline: { seq: number; phase: string; text: string; secret: boolean }[] | null;
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
 * 產出觀戰視角。
 * - 身分公開條件：終局 / 上帝視角 / 翻牌白癡 / 自爆狼 / 翻牌騎士 /（死亡且 showDeadRoles）
 * - 夜晚暫存、待公佈死亡、查驗結果一律不出現在結構中（上帝視角經由完整時間軸呈現）
 */
export function buildSpectatorView(
  state: GameState,
  settings: ShareSettings,
  viewerSeat: SeatId | null,
  report?: GameReport | null,
): SpectatorView {
  const ended = state.phase.t === 'ended';
  const viewer = viewerSeat === null ? null : state.players.find((p) => p.seat === viewerSeat) ?? null;
  const god = settings.godViewForDead && viewer !== null && !viewer.alive;
  const revealAll = ended || god;

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
    return {
      seat: p.seat,
      name: p.name,
      alive: p.alive,
      isSheriff: state.sheriff === p.seat,
      idiotRevealed: p.idiotRevealed,
      role: reveal ? p.role : null,
      deathCause: causePublic ? CAUSE_LABEL[p.death!.cause] : null,
      deathAt: p.death ? `第 ${p.death.day} ${p.death.during === 'night' ? '夜' : '天'}` : null,
      lover: revealAll ? (state.lovers?.includes(p.seat) ?? false) : false,
      converted: revealAll ? p.converted : false,
    };
  });

  const votes: SpectatorVote[] | null =
    (settings.showVotes || revealAll) && report
      ? report.days
          .flatMap((d) => [...(d.sheriff?.rounds ?? []), ...d.exileRounds])
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
          .filter((e) => e.kind !== 'note') // GM 筆記任何視角（含上帝/終局）都不外流
          .filter((e) => (revealAll ? true : !e.secret))
          .filter((e) => (e.kind === 'ballots' ? settings.showVotes || revealAll : true))
          .map((e) => ({ seq: e.seq, phase: e.phase, text: e.text, secret: e.secret }))
      : null;

  const progress = gameProgress(state);
  const electionOpen = state.election !== null && !state.election.done;

  return {
    phaseText: progress.label,
    day: state.day,
    isNight: state.phase.t === 'night',
    ended,
    god,
    winner: state.winner,
    aliveCount: progress.alive,
    total: progress.total,
    sheriff: state.sheriff,
    election: electionOpen
      ? { candidates: activeCandidates(state), withdrawn: state.election!.withdrawn }
      : null,
    players,
    votes,
    timeline,
    settings: {
      showVotes: settings.showVotes,
      showDeadRoles: settings.showDeadRoles,
      showTimeline: settings.showTimeline,
      godViewForDead: settings.godViewForDead,
    },
  };
}
