import { ROLE_META } from './types/roles';
import type { Faction, RoleClass } from './types/roles';
import type { RuleConfig } from './types/rules';
import type { PlayerState } from './types/state';

/**
 * 陣營與類別的唯一查詢入口。
 * 種狼感染會讓陣營在局中改變（converted），所以任何陣營/屠邊類別判斷
 * 都必須走這裡，禁止直接查 ROLE_META[p.role].faction / .cls。
 */
export function factionOf(p: PlayerState): Faction {
  return p.converted ? 'wolf' : ROLE_META[p.role].faction;
}

export function clsOf(p: PlayerState): RoleClass {
  return p.converted ? 'wolf' : ROLE_META[p.role].cls;
}

/** 角色技能是否仍有效（被感染者依規則失去/保留原技能） */
export function hasSkills(p: PlayerState, rules: RuleConfig): boolean {
  return !p.converted || rules.infectedKeepsSkills;
}
