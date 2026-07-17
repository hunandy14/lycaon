import type { GameState, PendingDeath } from '../types/state';

/**
 * 天亮結算真值表（純函式，不修改 state）：
 * - 被刀 + （守 XOR 救）= 活
 * - 被刀 + 同守同救 = 依 guardSaveConflictDies（奶穿）
 * - 被毒必死，守衛擋不住；poisoned 旗標是「不能開槍」的唯一依據
 * - 種狼感染（infect）：刀口不死於刀（守/救/奶穿全部不適用），但被毒照死
 * 輸出順序：刀死在前、毒死在後（座位播報由 announce 排序，不依賴此順序）。
 */
export function settleNight(state: GameState): PendingDeath[] {
  const { guardTarget, wolfTarget, witchSaved, witchPoison, infect } = state.night;
  const { guardSaveConflictDies } = state.config.rules;
  const deaths: PendingDeath[] = [];

  if (wolfTarget !== null && !infect) {
    const guarded = guardTarget === wolfTarget;
    const saved = witchSaved; // validate 已保證解藥只能用於當晚被刀者
    if (guarded && saved && guardSaveConflictDies) {
      deaths.push({ seat: wolfTarget, cause: 'guardSaveConflict', poisoned: false });
    } else if (!guarded && !saved) {
      deaths.push({ seat: wolfTarget, cause: 'wolf', poisoned: false });
    }
    // 守或救其一 → 平安
  }

  if (witchPoison !== null) {
    const existing = deaths.find((d) => d.seat === witchPoison);
    if (existing) {
      existing.poisoned = true; // 刀毒同一人：死因保留刀，但標記中毒（不能開槍）
    } else {
      deaths.push({ seat: witchPoison, cause: 'poison', poisoned: true });
    }
  }

  return deaths;
}
