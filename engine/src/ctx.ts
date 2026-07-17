import type { GameState, PlayerState } from './types/state';
import type { SeatId } from './types/rules';

/** reduce 過程的可變草稿上下文；state 是 structuredClone 後的副本 */
export interface Ctx {
  state: GameState;
  seq: number;
  at: string;
}

export function phaseLabel(state: GameState): string {
  switch (state.phase.t) {
    case 'setup':
      return '開局';
    case 'night':
      return `第 ${state.day} 夜`;
    case 'day':
      return `第 ${state.day} 天`;
    case 'ended':
      return '終局';
  }
}

export function pushLog(ctx: Ctx, text: string, secret = false, kind?: 'ballots' | 'note'): void {
  ctx.state.log.push({
    seq: ctx.seq,
    at: ctx.at,
    day: ctx.state.day,
    phase: phaseLabel(ctx.state),
    text,
    secret,
    ...(kind ? { kind } : {}),
  });
}

export function player(state: GameState, seat: SeatId): PlayerState {
  const p = state.players.find((x) => x.seat === seat);
  if (!p) throw new Error(`座位 ${seat} 不存在`);
  return p;
}

export function seatLabel(state: GameState, seat: SeatId): string {
  const p = player(state, seat);
  return p.name ? `${seat} 號（${p.name}）` : `${seat} 號`;
}
