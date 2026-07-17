import type { Ballot, EventEnvelope } from './types/events';
import type { SeatId } from './types/rules';
import type { Faction, RoleId } from './types/roles';
import { ROLE_META } from './types/roles';
import type { DeathCause, DeathInfo, GameState, PendingDeath, SeerCheck } from './types/state';
import type { Victory } from './victory';
import { loversAreThirdParty } from './victory';
import { factionOf } from './alignment';
import { initialState, reduce, EngineError } from './reduce';
import { tally, exileVoteWeight } from './day/vote';

/**
 * 終局報表：吃完整事件流，增量 replay 擷取中間態（投票當下陣營、當夜結算名單、
 * 歷任警長等最終 state 已不可見的事實）。純函式，client/server 皆可用。
 */

/** 報表用陣營；third = 跨陣營情侶（第三方，含其身分原始陣營之外的勝利條件） */
export type ReportCamp = 'good' | 'wolf' | 'third';

export interface NightReport {
  night: number;
  cupid: { a: SeatId; b: SeatId; thirdParty: boolean } | null;
  /** undefined = 本夜無該行動；null = 空守/空刀 */
  guardTarget: SeatId | null | undefined;
  wolfTarget: SeatId | null | undefined;
  /** 女巫救的座位（= 當晚刀口） */
  witchSave: SeatId | null;
  witchPoison: SeatId | null;
  /** 毒殺目標「當下」的陣營 */
  witchPoisonCamp: ReportCamp | null;
  /** 種狼感染成功的座位 */
  infected: SeatId | null;
  seer: SeerCheck | null;
  /** NIGHT_ENDED 的結算名單（settle 結果；殉情級聯在公佈時才發生） */
  deaths: PendingDeath[];
  /** 刀口獲救：擋刀 / 解藥 /（奶穿關閉時）兩者皆有 */
  saved: { seat: SeatId; by: 'guard' | 'witch' | 'both' } | null;
  milkPierced: boolean;
  peaceful: boolean;
  /** false = 事件流在本夜中斷（進行中或中止局） */
  settled: boolean;
}

export interface VoteCount {
  seat: SeatId;
  votes: number;
}

export interface VoteRoundReport {
  kind: 'sheriff' | 'exile';
  /** 事件 seq（供與其他白天事件按實際順序排列） */
  seq: number;
  day: number;
  round: number;
  pkSeats: SeatId[] | null;
  ballots: Ballot[];
  /** 得票由高至低（放逐含警長 1.5 票，以投票當下的警長計） */
  counts: VoteCount[];
  outcome:
    | { t: 'exiled'; seat: SeatId; chained: { seat: SeatId; cause: DeathCause }[] }
    | { t: 'idiotRevealed'; seat: SeatId }
    | { t: 'elected'; seat: SeatId }
    | { t: 'pk'; seats: SeatId[] }
    | { t: 'none' };
}

export type DayIncident =
  | {
      seq: number;
      day: number;
      kind: 'shot';
      via: 'hunter' | 'blackWolfKing' | 'whiteWolfExplode';
      shooter: SeatId;
      target: SeatId | null;
      /** 目標「當下」的陣營 */
      targetCamp: ReportCamp | null;
      chained: { seat: SeatId; cause: DeathCause }[];
    }
  | { seq: number; day: number; kind: 'duel'; knight: SeatId; target: SeatId; success: boolean }
  | { seq: number; day: number; kind: 'explode'; seat: SeatId; whiteWolf: boolean }
  | { seq: number; day: number; kind: 'badge'; from: SeatId | null; to: SeatId | null };

export interface SheriffReport {
  candidates: SeatId[];
  withdrawn: SeatId[];
  rounds: VoteRoundReport[];
  elected: SeatId | null;
  skipped: boolean;
}

export interface DayReport {
  day: number;
  /** DEATHS_ANNOUNCED 真正公佈的死亡（含殉情級聯，死因為真實死因） */
  announcedDeaths: { seat: SeatId; cause: DeathCause }[];
  sheriff: SheriffReport | null;
  exileRounds: VoteRoundReport[];
  incidents: DayIncident[];
}

export interface PlayerVoteStats {
  /** 計分票數：投票當下為好人陣營、非棄票的放逐票（含 PK 輪） */
  countable: number;
  /** 其中投中「當下」狼陣營的票數 */
  hitWolf: number;
  abstain: number;
  /** hitWolf / countable；無計分票 = null */
  accuracy: number | null;
}

export interface PlayerReport {
  seat: SeatId;
  name?: string;
  role: RoleId;
  originalFaction: Faction;
  finalCamp: ReportCamp;
  converted: boolean;
  convertedOnNight: number | null;
  lover: boolean;
  idiotRevealed: boolean;
  everSheriff: boolean;
  death: DeathInfo | null;
  voteStats: PlayerVoteStats;
}

export interface Highlight {
  icon: string;
  title: string;
  detail: string;
  seats: SeatId[];
}

export interface GameReport {
  result: {
    winner: Victory | null;
    /** 中止局（GAME_ABORTED） */
    aborted: boolean;
    /** 對局尚未結束（報表對任意前綴事件流皆可算） */
    ongoing: boolean;
    totalDays: number;
    playerCount: number;
    startedAt: string;
    endedAt: string;
  };
  nights: NightReport[];
  days: DayReport[];
  players: PlayerReport[];
  seerTrack: SeerCheck[];
  highlights: Highlight[];
}

function emptyNightReport(night: number): NightReport {
  return {
    night,
    cupid: null,
    guardTarget: undefined,
    wolfTarget: undefined,
    witchSave: null,
    witchPoison: null,
    witchPoisonCamp: null,
    infected: null,
    seer: null,
    deaths: [],
    saved: null,
    milkPierced: false,
    peaceful: false,
    settled: false,
  };
}

function emptyDayReport(day: number): DayReport {
  return { day, announcedDeaths: [], sheriff: null, exileRounds: [], incidents: [] };
}

function toCounts(ballots: Ballot[], weightOf: (voter: SeatId) => number): VoteCount[] {
  const { counts } = tally(ballots, weightOf);
  return [...counts.entries()]
    .map(([seat, votes]) => ({ seat, votes }))
    .sort((a, b) => b.votes - a.votes || a.seat - b.seat);
}

/** 事件前後的 alive diff（本事件造成的死亡，含級聯，死因取事後 state 的真實死因） */
function diffDeaths(prev: GameState, post: GameState): { seat: SeatId; cause: DeathCause }[] {
  const out: { seat: SeatId; cause: DeathCause }[] = [];
  for (const p of prev.players) {
    if (!p.alive) continue;
    const after = post.players.find((x) => x.seat === p.seat)!;
    if (!after.alive) out.push({ seat: p.seat, cause: after.death!.cause });
  }
  return out;
}

export function buildGameReport(envelopes: EventEnvelope[]): GameReport {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  const first = sorted[0];
  if (!first || first.event.type !== 'GAME_CREATED') {
    throw new EngineError('事件流的第一筆必須是 GAME_CREATED');
  }

  let state = initialState(first.event.config, first.seq, first.at);

  const nights = new Map<number, NightReport>();
  const days = new Map<number, DayReport>();
  const stats = new Map<SeatId, PlayerVoteStats>();
  const everSheriff = new Set<SeatId>();
  const convertedOnNight = new Map<SeatId, number>();
  /** 第三方情侶（僅兩位情侶——投票不計分；邱比特僅顯示為第三方、票照計） */
  const thirdSeats = new Set<SeatId>();
  let cupidThird: SeatId | null = null;

  for (const p of state.players) stats.set(p.seat, { countable: 0, hitWolf: 0, abstain: 0, accuracy: null });

  const campAt = (s: GameState, seat: SeatId): ReportCamp =>
    thirdSeats.has(seat) ? 'third' : factionOf(s.players.find((p) => p.seat === seat)!);
  const nightOf = (n: number): NightReport => {
    let nr = nights.get(n);
    if (!nr) nights.set(n, (nr = emptyNightReport(n)));
    return nr;
  };
  const dayOf = (d: number): DayReport => {
    let dr = days.get(d);
    if (!dr) days.set(d, (dr = emptyDayReport(d)));
    return dr;
  };

  for (const env of sorted.slice(1)) {
    const prev = state;
    const post = reduce(prev, env);
    const { event } = env;

    switch (event.type) {
      case 'NIGHT_STARTED':
      case 'DAY_ENDED':
        nightOf(post.day);
        break;

      case 'CUPID_LINKED': {
        const third = loversAreThirdParty(post);
        nightOf(post.day).cupid = { a: event.a, b: event.b, thirdParty: third };
        if (third) {
          thirdSeats.add(event.a);
          thirdSeats.add(event.b);
          cupidThird = post.players.find((p) => p.role === 'cupid')?.seat ?? null;
        }
        break;
      }

      case 'GUARD_ACTED':
        nightOf(post.day).guardTarget = event.target;
        break;

      case 'WOLVES_ACTED':
        nightOf(post.day).wolfTarget = event.target;
        break;

      case 'WITCH_ACTED': {
        const nr = nightOf(post.day);
        if (event.save) nr.witchSave = prev.night.wolfTarget;
        if (event.poison !== null) {
          nr.witchPoison = event.poison;
          nr.witchPoisonCamp = campAt(prev, event.poison);
        }
        break;
      }

      case 'SEER_ACTED':
        nightOf(post.day).seer = post.seerChecks[post.seerChecks.length - 1] ?? null;
        break;

      case 'NIGHT_ENDED': {
        const nr = nightOf(post.day);
        nr.settled = true;
        nr.deaths = post.pendingDeaths.map((d) => ({ ...d }));
        nr.milkPierced = nr.deaths.some((d) => d.cause === 'guardSaveConflict');
        nr.peaceful = nr.deaths.length === 0;
        if (prev.night.infect && prev.night.wolfTarget !== null) {
          nr.infected = prev.night.wolfTarget;
          convertedOnNight.set(prev.night.wolfTarget, post.day);
        }
        const w = prev.night.wolfTarget;
        if (w !== null && nr.infected !== w && !nr.deaths.some((d) => d.seat === w)) {
          const byGuard = prev.night.guardTarget === w;
          const byWitch = prev.night.witchSaved;
          if (byGuard || byWitch) nr.saved = { seat: w, by: byGuard && byWitch ? 'both' : byGuard ? 'guard' : 'witch' };
        }
        dayOf(post.day);
        break;
      }

      case 'SHERIFF_NOMINATED': {
        const sh = (dayOf(post.day).sheriff ??= { candidates: [], withdrawn: [], rounds: [], elected: null, skipped: false });
        sh.candidates = [...event.candidates].sort((a, b) => a - b);
        break;
      }

      case 'SHERIFF_WITHDRAWN': {
        const sh = (dayOf(post.day).sheriff ??= { candidates: [], withdrawn: [], rounds: [], elected: null, skipped: false });
        sh.withdrawn.push(event.seat);
        break;
      }

      case 'SHERIFF_VOTED': {
        const sh = (dayOf(post.day).sheriff ??= { candidates: [], withdrawn: [], rounds: [], elected: null, skipped: false });
        const done = post.election?.done ?? true;
        sh.rounds.push({
          kind: 'sheriff',
          seq: env.seq,
          day: post.day,
          round: prev.election?.pkSeats ? 2 : 1,
          pkSeats: prev.election?.pkSeats ?? null,
          ballots: event.ballots,
          counts: toCounts(event.ballots, () => 1),
          outcome: done
            ? post.sheriff !== null
              ? { t: 'elected', seat: post.sheriff }
              : { t: 'none' }
            : { t: 'pk', seats: post.election?.pkSeats ?? [] },
        });
        if (done) sh.elected = post.sheriff;
        break;
      }

      case 'SHERIFF_ELECTION_SKIPPED': {
        const sh = (dayOf(post.day).sheriff ??= { candidates: [], withdrawn: [], rounds: [], elected: null, skipped: false });
        sh.skipped = true;
        break;
      }

      case 'DEATHS_ANNOUNCED':
        dayOf(post.day).announcedDeaths = diffDeaths(prev, post);
        break;

      case 'EXILE_VOTED': {
        const deadNow = diffDeaths(prev, post);
        const exiled = deadNow.find((d) => d.cause === 'exile');
        const idiot = post.players.find(
          (p) => p.idiotRevealed && !prev.players.find((x) => x.seat === p.seat)!.idiotRevealed,
        );
        const isPk = prev.phase.t === 'day' && prev.phase.stage === 'pk';
        dayOf(post.day).exileRounds.push({
          kind: 'exile',
          seq: env.seq,
          day: post.day,
          round: isPk ? 2 : 1,
          pkSeats: isPk ? prev.exile?.pkSeats ?? null : null,
          ballots: event.ballots,
          counts: toCounts(event.ballots, exileVoteWeight(prev)),
          outcome: exiled
            ? { t: 'exiled', seat: exiled.seat, chained: deadNow.filter((d) => d.seat !== exiled.seat) }
            : idiot
              ? { t: 'idiotRevealed', seat: idiot.seat }
              : post.phase.t === 'day' && post.phase.stage === 'pk'
                ? { t: 'pk', seats: post.exile?.pkSeats ?? [] }
                : { t: 'none' },
        });
        // 投票準確度：以「投票當下」的陣營計（factionOf 對 prev 求值）；第三方情侶不計分
        for (const b of event.ballots) {
          const s = stats.get(b.voter);
          if (!s) continue;
          if (b.target === null) {
            s.abstain += 1;
            continue;
          }
          if (campAt(prev, b.voter) !== 'good') continue;
          s.countable += 1;
          if (campAt(prev, b.target) === 'wolf') s.hitWolf += 1;
        }
        break;
      }

      case 'SHOT_FIRED': {
        const head = prev.actionQueue[0];
        const via = head?.kind === 'shoot' ? head.via : 'hunter';
        const deadNow = diffDeaths(prev, post);
        dayOf(post.day).incidents.push({
          seq: env.seq,
          day: post.day,
          kind: 'shot',
          via,
          shooter: event.shooter,
          target: event.target,
          targetCamp: event.target === null ? null : campAt(prev, event.target),
          chained: deadNow.filter((d) => d.seat !== event.target),
        });
        break;
      }

      case 'KNIGHT_DUELED':
        dayOf(post.day).incidents.push({
          seq: env.seq,
          day: post.day,
          kind: 'duel',
          knight: event.knight,
          target: event.target,
          success: !post.players.find((p) => p.seat === event.target)!.alive,
        });
        break;

      case 'WOLF_EXPLODED':
        dayOf(post.day).incidents.push({
          seq: env.seq,
          day: post.day,
          kind: 'explode',
          seat: event.seat,
          whiteWolf: prev.players.find((p) => p.seat === event.seat)!.role === 'whiteWolfKing',
        });
        break;

      case 'BADGE_TRANSFERRED':
        dayOf(post.day).incidents.push({ seq: env.seq, day: post.day, kind: 'badge', from: prev.sheriff, to: event.to });
        break;

      default:
        break;
    }

    if (post.sheriff !== null) everSheriff.add(post.sheriff);
    state = post;
  }

  for (const s of stats.values()) s.accuracy = s.countable > 0 ? s.hitWolf / s.countable : null;

  const players: PlayerReport[] = state.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    role: p.role,
    originalFaction: ROLE_META[p.role].faction,
    finalCamp: thirdSeats.has(p.seat) || p.seat === cupidThird ? 'third' : factionOf(p),
    converted: p.converted,
    convertedOnNight: convertedOnNight.get(p.seat) ?? null,
    lover: state.lovers?.includes(p.seat) ?? false,
    idiotRevealed: p.idiotRevealed,
    everSheriff: everSheriff.has(p.seat),
    death: p.death ?? null,
    voteStats: stats.get(p.seat)!,
  }));

  const nightList = [...nights.values()].sort((a, b) => a.night - b.night);
  const dayList = [...days.values()].sort((a, b) => a.day - b.day);
  const last = sorted[sorted.length - 1]!;

  return {
    result: {
      winner: state.winner,
      aborted: state.phase.t === 'ended' && state.winner === null,
      ongoing: state.phase.t !== 'ended',
      totalDays: state.day,
      playerCount: state.config.playerCount,
      startedAt: first.at,
      endedAt: last.at,
    },
    nights: nightList,
    days: dayList,
    players,
    seerTrack: state.seerChecks,
    highlights: buildHighlights(state, nightList, dayList, players),
  };
}

function buildHighlights(
  state: GameState,
  nights: NightReport[],
  days: DayReport[],
  players: PlayerReport[],
): Highlight[] {
  const out: Highlight[] = [];
  const seatOf = (role: RoleId): SeatId | null => state.players.find((p) => p.role === role)?.seat ?? null;

  // 女巫用藥
  const witch = seatOf('witch');
  if (witch !== null) {
    const saveOk = nights.filter((n) => n.witchSave !== null && !n.deaths.some((d) => d.seat === n.witchSave)).length;
    const poisonWolf = nights.filter((n) => n.witchPoison !== null && n.witchPoisonCamp === 'wolf').length;
    const poisonGood = nights.filter((n) => n.witchPoison !== null && n.witchPoisonCamp === 'good');
    if (saveOk > 0 && poisonWolf > 0) {
      out.push({ icon: '🧪', title: '雙藥全中', detail: `解藥救活刀口，毒藥命中狼人`, seats: [witch] });
    } else if (poisonWolf > 0) {
      out.push({ icon: '☠️', title: '毒中狼人', detail: `毒藥直接帶走狼陣營`, seats: [witch] });
    }
    if (poisonGood.length > 0) {
      out.push({
        icon: '💔',
        title: '毒錯好人',
        detail: `毒藥誤中 ${poisonGood.map((n) => `${n.witchPoison} 號`).join('、')}`,
        seats: [witch],
      });
    }
  }

  // 守衛擋刀 / 奶穿
  const guard = seatOf('guard');
  if (guard !== null) {
    const blocks = nights.filter((n) => n.saved !== null && (n.saved.by === 'guard' || n.saved.by === 'both'));
    if (blocks.length > 0) {
      out.push({
        icon: '🛡️',
        title: `神守 ×${blocks.length}`,
        detail: `擋下狼刀：${blocks.map((n) => `第 ${n.night} 夜守 ${n.saved!.seat} 號`).join('、')}`,
        seats: [guard],
      });
    }
  }
  const milk = nights.find((n) => n.milkPierced);
  if (milk) {
    out.push({ icon: '💥', title: '同守同救', detail: `第 ${milk.night} 夜守救同人，奶穿出局`, seats: [] });
  }

  // 預言家查殺
  const seer = seatOf('seer');
  if (seer !== null) {
    const hits = state.seerChecks.filter((c) => c.result === 'wolf').length;
    if (hits > 0) out.push({ icon: '🔮', title: `查殺 ${hits} 狼`, detail: `${state.seerChecks.length} 次查驗中 ${hits} 次驗出狼人`, seats: [seer] });
  }

  // 開槍
  for (const d of days) {
    for (const i of d.incidents) {
      if (i.kind === 'shot' && i.target !== null) {
        const shooter = players.find((p) => p.seat === i.shooter)!;
        if (shooter.originalFaction === 'good' && i.targetCamp === 'wolf') {
          out.push({ icon: '🔫', title: '神槍手', detail: `${i.shooter} 號開槍帶走狼人 ${i.target} 號`, seats: [i.shooter] });
        } else if (shooter.originalFaction === 'good' && i.targetCamp !== 'wolf') {
          out.push({ icon: '😢', title: '悲情槍口', detail: `${i.shooter} 號開槍帶走了隊友 ${i.target} 號`, seats: [i.shooter] });
        } else if (shooter.originalFaction === 'wolf' && i.targetCamp === 'good') {
          out.push({ icon: '🐺', title: '狼王發威', detail: `${i.shooter} 號帶走好人 ${i.target} 號`, seats: [i.shooter] });
        }
      }
      if (i.kind === 'duel') {
        out.push(
          i.success
            ? { icon: '⚔️', title: '一劍封喉', detail: `騎士 ${i.knight} 號決鬥狼人 ${i.target} 號成功`, seats: [i.knight] }
            : { icon: '🪦', title: '以身殉職', detail: `騎士 ${i.knight} 號決鬥好人 ${i.target} 號，殉職`, seats: [i.knight] },
        );
      }
    }
  }

  // 白癡翻牌
  const idiot = players.find((p) => p.idiotRevealed);
  if (idiot) out.push({ icon: '🃏', title: '白癡翻牌', detail: `${idiot.seat} 號被票免死，失去投票權`, seats: [idiot.seat] });

  // 種狼感染
  const infectedNight = nights.find((n) => n.infected !== null);
  if (infectedNight) {
    out.push({
      icon: '🦠',
      title: '種狼感染',
      detail: `第 ${infectedNight.night} 夜感染 ${infectedNight.infected} 號，使其轉入狼陣營`,
      seats: [infectedNight.infected!],
    });
  }

  // 情侶勝
  if (state.winner?.faction === 'lovers' && state.lovers) {
    out.push({ icon: '💘', title: '雙宿雙飛', detail: '第三方情侶笑到最後', seats: [...state.lovers] });
  }

  // 投票最準的好人（至少 2 張計分票）
  const sharp = players
    .filter((p) => p.voteStats.countable >= 2 && p.voteStats.accuracy !== null)
    .sort((a, b) => b.voteStats.accuracy! - a.voteStats.accuracy! || a.seat - b.seat)[0];
  if (sharp && sharp.voteStats.accuracy! >= 0.5) {
    out.push({
      icon: '🎯',
      title: '火眼金睛',
      detail: `${sharp.seat} 號投狼命中 ${sharp.voteStats.hitWolf}/${sharp.voteStats.countable}`,
      seats: [sharp.seat],
    });
  }

  return out;
}
