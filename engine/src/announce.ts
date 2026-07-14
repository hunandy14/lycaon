import type { GameState } from './types/state';

/**
 * 天亮播報稿（給 GM 照著唸）。只公佈死亡名單，不公佈死因與身分。
 * 依 pendingDeaths 計算——在 DEATHS_ANNOUNCED 之前呼叫。
 */
export function buildDawnAnnouncement(state: GameState): string {
  const seats = [...new Set(state.pendingDeaths.map((d) => d.seat))].sort((a, b) => a - b);
  if (seats.length === 0) return '天亮了。昨天晚上是平安夜，無人死亡。';
  return `天亮了。昨天晚上死亡的是 ${seats.map((s) => `${s} 號`).join('、')} 玩家。`;
}
