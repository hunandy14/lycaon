import { factionOf, hasSkills } from '../alignment';
import type { GameState } from '../types/state';

export type NightStepId = 'cupid' | 'guard' | 'wolves' | 'seedWolf' | 'witch' | 'seer';

export interface NightStep {
  id: NightStepId;
  /** false = 走過場步驟（角色已死/技能不可用）：GM 照喊但不輸入、不產生事件 */
  active: boolean;
}

/**
 * 依板子與存活狀況產生當夜步驟序列。
 * 固定順序：邱比特（僅首夜）→ 守衛 → 狼人 → 種狼 → 女巫 → 預言家。
 * 板子中不存在的角色不列；不可行動時依 callDeadRoles 決定保留走過場或省略。
 * 注意：各步驟的 active 條件只能依賴「整夜不變」的狀態（stepIndex 穩定性）——
 * 例如種狼「本夜已用感染」仍算 active（usedOnNight === 當夜）。
 */
export function buildNightPlan(state: GameState): NightStep[] {
  const steps: NightStep[] = [];
  const { rules } = state.config;

  const push = (id: NightStepId, active: boolean) => {
    if (active || rules.callDeadRoles) steps.push({ id, active });
  };

  const find = (role: string) => state.players.find((p) => p.role === role);

  // 邱比特：僅首夜出現
  const cupid = find('cupid');
  if (cupid && state.day === 1) push('cupid', cupid.alive);

  const guard = find('guard');
  if (guard) push('guard', guard.alive && hasSkills(guard, rules));

  // 狼人步驟：含被感染轉狼者；狼全滅前遊戲必已結束。
  // wolfKingPending（seedWolfMakesWolfKing 開啟時，剛轉換尚未生效的狼王）不算入可行動的狼，
  // 若場上唯一存活的狼隊成員正是待生效狼王，本夜狼隊步驟直接不啟用。
  const hasWolf = state.players.some((p) => factionOf(p) === 'wolf');
  const anyWolfAlive = state.players.some((p) => p.alive && factionOf(p) === 'wolf' && !p.wolfKingPending);
  if (hasWolf) push('wolves', anyWolfAlive);

  // 種狼：跟在狼人刀口之後單獨睜眼；標準版第二夜起才可感染；
  // 感染用掉後轉走過場（本夜剛用掉仍算 active，維持 stepIndex 穩定）
  const seedWolf = find('seedWolf');
  if (seedWolf) {
    const nightAllowed = state.day >= 2 || rules.seedWolfFirstNight;
    const usable = state.seedWolfUsedOnNight === null || state.seedWolfUsedOnNight === state.day;
    push('seedWolf', seedWolf.alive && nightAllowed && usable);
  }

  const witch = find('witch');
  if (witch) push('witch', witch.alive && hasSkills(witch, rules));

  const seer = find('seer');
  if (seer) push('seer', seer.alive && hasSkills(seer, rules));

  return steps;
}

/** 目前夜晚步驟（phase 必須是 night）；越界回傳 null（= 夜晚行動已全部完成，等待天亮） */
export function currentNightStep(state: GameState): NightStep | null {
  if (state.phase.t !== 'night') return null;
  const plan = buildNightPlan(state);
  return plan[state.phase.stepIndex] ?? null;
}

/** 從 from（含）開始，跳過非 active 步驟後的下一個索引 */
export function skipInactive(plan: NightStep[], from: number): number {
  let i = from;
  while (i < plan.length && !plan[i]!.active) i++;
  return i;
}
