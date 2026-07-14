import { ROLE_META } from './types/roles';
import type { Faction } from './types/roles';
import type { GameState } from './types/state';

export interface Victory {
  faction: Faction;
  reason: string;
}

/**
 * 勝利判定（每次死亡後即時呼叫）。
 * 屠邊：狼全滅=好人勝；神職全滅或平民全滅=狼人勝（只計板上存在的類別）。
 * 屠城：狼全滅=好人勝；好人全滅=狼人勝。
 * 翻牌白癡存活仍計入神職。
 */
export function checkVictory(state: GameState): Victory | null {
  const alive = state.players.filter((p) => p.alive);
  const wolves = alive.filter((p) => ROLE_META[p.role].faction === 'wolf').length;
  if (wolves === 0) return { faction: 'good', reason: '狼人全數出局，好人陣營獲勝' };

  if (state.config.rules.victory === 'slaughterSide') {
    // 只對板上原本就有的類別做屠邊判定（自訂板可能沒有平民或神職）
    const hasGods = state.config.seats.some((s) => ROLE_META[s.role].cls === 'god');
    const hasVillagers = state.config.seats.some((s) => ROLE_META[s.role].cls === 'villager');
    const godsAlive = alive.filter((p) => ROLE_META[p.role].cls === 'god').length;
    const villagersAlive = alive.filter((p) => ROLE_META[p.role].cls === 'villager').length;
    if (hasGods && godsAlive === 0) return { faction: 'wolf', reason: '神職全數出局（屠邊），狼人陣營獲勝' };
    if (hasVillagers && villagersAlive === 0) return { faction: 'wolf', reason: '平民全數出局（屠邊），狼人陣營獲勝' };
  } else {
    const goodAlive = alive.filter((p) => ROLE_META[p.role].faction === 'good').length;
    if (goodAlive === 0) return { faction: 'wolf', reason: '好人全數出局（屠城），狼人陣營獲勝' };
  }
  return null;
}
