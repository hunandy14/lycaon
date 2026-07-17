import type { Ballot } from '../types/events';
import type { SeatId } from '../types/rules';
import type { GameState } from '../types/state';
import { tally } from './vote';
import { pushLog, seatLabel, type Ctx } from '../ctx';

/** 目前有效競選人（round 1：上警未退水者；PK 輪：PK 名單未退水者） */
export function activeCandidates(state: GameState): SeatId[] {
  const e = state.election;
  if (!e || e.done) return [];
  const pool = e.pkSeats ?? e.candidates;
  return pool.filter((s) => !e.withdrawn.includes(s));
}

/** 警長競選投票資格：存活、且（從未上警 或 已退水）——上警未退水者整個競選階段無投票權 */
export function canVoteInElection(state: GameState, voter: SeatId): boolean {
  const e = state.election;
  if (!e) return false;
  const p = state.players.find((x) => x.seat === voter);
  if (!p?.alive) return false;
  return !e.candidates.includes(voter) || e.withdrawn.includes(voter);
}

function concludeElection(ctx: Ctx, sheriff: SeatId | null): void {
  const { state } = ctx;
  state.election!.done = true;
  state.sheriff = sheriff;
  if (sheriff !== null) {
    pushLog(ctx, `${seatLabel(state, sheriff)}當選警長`, false);
  } else {
    pushLog(ctx, '本局無警長', false);
  }
  if (state.phase.t === 'day') state.phase = { t: 'day', stage: 'announce' };
}

/** 警長競選投票結算（SHERIFF_VOTED；validate 已保證選票合法） */
export function resolveSheriffVote(ctx: Ctx, ballots: Ballot[]): void {
  const { state } = ctx;
  const e = state.election!;
  const candidates = activeCandidates(state);

  // 競選人歸零或僅一人：直接定案（GM 按確認即成立，無需計票）
  if (candidates.length === 0) return concludeElection(ctx, null);
  if (candidates.length === 1) return concludeElection(ctx, candidates[0]!);

  const { top } = tally(ballots, () => 1); // 競選階段無警徽，所有票重 1
  pushLog(
    ctx,
    `警長競選投票（${e.pkSeats ? 'PK 輪' : '第一輪'}）：${ballots.map((b) => `${b.voter}→${b.target === null ? '棄' : b.target}`).join('、') || '無人投票'}`,
    false,
    'ballots',
  );

  if (top.length === 1) return concludeElection(ctx, top[0]!);
  if (top.length === 0) return concludeElection(ctx, null); // 全棄票 → 無警長

  if (!e.pkSeats) {
    e.pkSeats = top;
    e.round = 2;
    pushLog(ctx, `警上平票：${top.map((s) => `${s} 號`).join('、')}進入 PK`, false);
  } else {
    concludeElection(ctx, null); // PK 再平 → 無警長
  }
}

/** 警長死亡時的警徽流（BADGE_TRANSFERRED；to=null 表示撕毀警徽） */
export function transferBadge(ctx: Ctx, to: SeatId | null): void {
  const { state } = ctx;
  state.sheriff = to;
  if (to !== null) {
    pushLog(ctx, `警徽移交給 ${seatLabel(state, to)}`, false);
  } else {
    pushLog(ctx, '警徽被撕毀，本局不再有警長', false);
  }
}
