import type { GameState, SeatId } from '@lycaon/engine';

/** 「3 號」或「3 號（小明）」 */
export function seatText(state: GameState, seat: SeatId): string {
  const p = state.players.find((x) => x.seat === seat);
  return p?.name ? `${seat} 號（${p.name}）` : `${seat} 號`;
}
