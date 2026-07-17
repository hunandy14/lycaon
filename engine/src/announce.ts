import type { SeatId } from './types/rules';
import type { GameState } from './types/state';

/**
 * 夜晚死亡的完整名單：pendingDeaths + 殉情級聯（情侶一方在名單中且另一半存活 → 一起死）。
 * 與 DEATHS_ANNOUNCED reducer 的 applyDeath 級聯結果一致，播報稿據此產生。
 */
export function expandedNightDeaths(state: GameState): SeatId[] {
  const seats = new Set(state.pendingDeaths.map((d) => d.seat));
  if (state.lovers) {
    const [a, b] = state.lovers;
    const pa = state.players.find((p) => p.seat === a)!;
    const pb = state.players.find((p) => p.seat === b)!;
    if (seats.has(a) && !seats.has(b) && pb.alive) seats.add(b);
    if (seats.has(b) && !seats.has(a) && pa.alive) seats.add(a);
  }
  return [...seats].sort((x, y) => x - y);
}

/**
 * 天亮播報稿（給 GM 照著唸）。只公佈死亡名單（含殉情者），不公佈死因與身分。
 * 依 pendingDeaths 計算——在 DEATHS_ANNOUNCED 之前呼叫。
 */
export function buildDawnAnnouncement(state: GameState): string {
  const seats = expandedNightDeaths(state);
  if (seats.length === 0) return '天亮了。昨天晚上是平安夜，無人死亡。';
  return `天亮了。昨天晚上死亡的是 ${seats.map((s) => `${s} 號`).join('、')} 玩家。`;
}
