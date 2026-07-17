import { ROLE_META } from './types/roles';
import type { Faction } from './types/roles';
import type { GameState } from './types/state';
import { clsOf, factionOf } from './alignment';

export interface Victory {
  faction: Faction | 'lovers';
  reason: string;
}

/** 跨陣營情侶（以連結當下的原始角色陣營判定，之後感染不改變第三方身分） */
export function loversAreThirdParty(state: GameState): boolean {
  if (!state.lovers) return false;
  const [a, b] = state.lovers;
  const fa = ROLE_META[state.players.find((p) => p.seat === a)!.role].faction;
  const fb = ROLE_META[state.players.find((p) => p.seat === b)!.role].faction;
  return fa !== fb;
}

/**
 * 勝利判定（每次死亡後即時呼叫；種狼感染後於天亮公佈時再補查一次）。
 * 1. 第三方情侶：跨陣營情侶雙雙存活、且場上其他存活者只剩邱比特 → 情侶（與邱比特）獲勝
 * 2. 狼全滅 = 好人勝（含被感染轉狼者）
 * 3. 屠邊：神職全滅或平民全滅 = 狼人勝（只計板上存在的類別；感染者移出原類別計入狼）
 * 4. 屠城：好人全滅 = 狼人勝
 * 翻牌白癡存活仍計入神職。
 */
export function checkVictory(state: GameState): Victory | null {
  const alive = state.players.filter((p) => p.alive);

  if (state.lovers && loversAreThirdParty(state)) {
    const [a, b] = state.lovers;
    const pa = state.players.find((p) => p.seat === a)!;
    const pb = state.players.find((p) => p.seat === b)!;
    if (pa.alive && pb.alive) {
      const others = alive.filter((p) => p.seat !== a && p.seat !== b);
      if (others.every((p) => p.role === 'cupid')) {
        return { faction: 'lovers', reason: '場上只剩下這對情侶，情侶（與邱比特）獲勝' };
      }
    }
  }

  const wolves = alive.filter((p) => factionOf(p) === 'wolf').length;
  if (wolves === 0) return { faction: 'good', reason: '狼人全數出局，好人陣營獲勝' };

  if (state.config.rules.victory === 'slaughterSide') {
    // 只對板上原本就有的類別做屠邊判定（自訂板可能沒有平民或神職）
    const hasGods = state.config.seats.some((s) => ROLE_META[s.role].cls === 'god');
    const hasVillagers = state.config.seats.some((s) => ROLE_META[s.role].cls === 'villager');
    const godsAlive = alive.filter((p) => clsOf(p) === 'god').length;
    const villagersAlive = alive.filter((p) => clsOf(p) === 'villager').length;
    if (hasGods && godsAlive === 0) return { faction: 'wolf', reason: '神職全數出局（屠邊），狼人陣營獲勝' };
    if (hasVillagers && villagersAlive === 0) return { faction: 'wolf', reason: '平民全數出局（屠邊），狼人陣營獲勝' };
  } else {
    const goodAlive = alive.filter((p) => factionOf(p) === 'good').length;
    if (goodAlive === 0) return { faction: 'wolf', reason: '好人全數出局（屠城），狼人陣營獲勝' };
  }
  return null;
}
