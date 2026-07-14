import { ROLE_META } from '../types/roles';
import type { GameState } from '../types/state';

export type NightStepId = 'guard' | 'wolves' | 'witch' | 'seer';

export interface NightStep {
  id: NightStepId;
  /** false = 角色已死的走過場步驟：GM 照喊但不輸入、不產生事件 */
  active: boolean;
}

const STEP_ROLE: Record<Exclude<NightStepId, 'wolves'>, 'guard' | 'witch' | 'seer'> = {
  guard: 'guard',
  witch: 'witch',
  seer: 'seer',
};

/**
 * 依板子與存活狀況產生當夜步驟序列。
 * 固定順序：守衛 → 狼人 → 女巫 → 預言家。
 * 板子中不存在的角色不列；已死角色依 callDeadRoles 決定保留走過場或省略。
 * 注意：此函式只依 config 與 players 存活狀態，夜晚進行中結果不變（stepIndex 穩定）。
 */
export function buildNightPlan(state: GameState): NightStep[] {
  const steps: NightStep[] = [];
  const { callDeadRoles } = state.config.rules;

  const push = (id: NightStepId, active: boolean) => {
    if (active || callDeadRoles) steps.push({ id, active });
  };

  for (const id of ['guard', 'wolves', 'witch', 'seer'] as const) {
    if (id === 'wolves') {
      // 只要板上有狼陣營就有狼人步驟；狼全滅前遊戲必已結束
      const hasWolf = state.players.some((p) => ROLE_META[p.role].faction === 'wolf');
      const anyWolfAlive = state.players.some((p) => p.alive && ROLE_META[p.role].faction === 'wolf');
      if (hasWolf) push('wolves', anyWolfAlive);
    } else {
      const player = state.players.find((p) => p.role === STEP_ROLE[id]);
      if (player) push(id, player.alive);
    }
  }
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
