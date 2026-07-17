import type { Ballot } from '../types/events';
import type { SeatId } from '../types/rules';
import type { GameState } from '../types/state';
import { hasSkills } from '../alignment';
import { applyDeath } from './deaths';
import { pushLog, player, seatLabel, type Ctx } from '../ctx';

export interface TallyResult {
  counts: Map<SeatId, number>;
  /** 最高票者（可能多位=平票；無有效票=空陣列） */
  top: SeatId[];
}

/** 計票；weightOf 回傳每位投票者的票重（警長 1.5） */
export function tally(ballots: Ballot[], weightOf: (voter: SeatId) => number): TallyResult {
  const counts = new Map<SeatId, number>();
  for (const b of ballots) {
    if (b.target === null) continue; // 棄票
    counts.set(b.target, (counts.get(b.target) ?? 0) + weightOf(b.voter));
  }
  let max = 0;
  for (const v of counts.values()) max = Math.max(max, v);
  const top = max === 0 ? [] : [...counts.entries()].filter(([, v]) => v === max).map(([s]) => s);
  return { counts, top: top.sort((a, b) => a - b) };
}

export function exileVoteWeight(state: GameState): (voter: SeatId) => number {
  return (voter) => (state.sheriff === voter ? 1.5 : 1);
}

function describeBallots(state: GameState, ballots: Ballot[]): string {
  if (ballots.length === 0) return '無人投票';
  return ballots
    .map((b) => `${b.voter}→${b.target === null ? '棄' : b.target}`)
    .join('、');
}

/** 放逐投票結算（EXILE_VOTED 的 reducer 邏輯；validate 已保證選票合法） */
export function resolveExileVote(ctx: Ctx, ballots: Ballot[]): void {
  const { state } = ctx;
  const isPk = state.phase.t === 'day' && state.phase.stage === 'pk';
  const { top, counts } = tally(ballots, exileVoteWeight(state));

  pushLog(ctx, `放逐投票（${isPk ? 'PK 輪' : '第一輪'}）：${describeBallots(state, ballots)}`, false, 'ballots');

  if (top.length === 1) {
    const seat = top[0]!;
    const p = player(state, seat);
    state.exile = null;
    if (p.role === 'idiot' && !p.idiotRevealed && hasSkills(p, state.config.rules)) {
      p.idiotRevealed = true;
      p.canVote = false;
      pushLog(ctx, `${seatLabel(state, seat)}被放逐，翻牌亮出【白癡】：免死，之後可發言但失去投票權`, false);
    } else {
      pushLog(ctx, `${seatLabel(state, seat)}被放逐出局（${fmtCount(counts.get(seat)!)} 票）`, false);
      applyDeath(ctx, seat, 'exile', false, 'day');
    }
    if (state.phase.t !== 'ended') state.phase = { t: 'day', stage: 'dayEnd' };
    return;
  }

  if (top.length === 0) {
    state.exile = null;
    pushLog(ctx, '全員棄票，今天無人被放逐（平安日）', false);
    state.phase = { t: 'day', stage: 'dayEnd' };
    return;
  }

  // 平票
  if (!isPk) {
    state.exile = { pkSeats: top, round: 2 };
    pushLog(ctx, `平票：${top.map((s) => `${s} 號`).join('、')}進入 PK 發言後再投一輪`, false);
    state.phase = { t: 'day', stage: 'pk' };
  } else {
    state.exile = null;
    pushLog(ctx, 'PK 再度平票，今天無人被放逐（平安日）', false);
    state.phase = { t: 'day', stage: 'dayEnd' };
  }
}

export function fmtCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
