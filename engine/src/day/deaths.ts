import { ROLE_META, roleName } from '../types/roles';
import type { RoleId } from '../types/roles';
import type { RuleConfig, SeatId } from '../types/rules';
import type { DeathCause, PendingAction } from '../types/state';
import { checkVictory } from '../victory';
import { pushLog, player, seatLabel, type Ctx } from '../ctx';

/**
 * 「role × cause → 可否開槍」決策表。
 * 獵人/黑狼王：被毒不可；自爆不可（黑狼王自爆無技能）；其餘死法皆可。
 * 白狼王：唯一能帶人的方式是自爆，在 applyDeath 中單獨處理（不走此表）。
 */
export function canShootOnDeath(role: RoleId, cause: DeathCause, poisoned: boolean): boolean {
  if (ROLE_META[role].deathSkill !== 'shoot') return false;
  if (poisoned) return false;
  return cause === 'wolf' || cause === 'guardSaveConflict' || cause === 'exile' || cause === 'shot' || cause === 'duel';
}

/** 遺言資格：被票/決鬥死永遠有；自爆無；夜死與被槍帶走依規則設定 */
export function hasLastWords(cause: DeathCause, day: number, rules: RuleConfig): boolean {
  if (cause === 'exile' || cause === 'duel') return true;
  if (cause === 'explode') return false;
  switch (rules.lastWordsOnNightDeath) {
    case 'always':
      return true;
    case 'firstDayOnly':
      return day === 1;
    case 'none':
      return false;
  }
}

const SHOOT_VIA: Partial<Record<RoleId, 'hunter' | 'blackWolfKing'>> = {
  hunter: 'hunter',
  blackWolfKing: 'blackWolfKing',
};

/**
 * 唯一死亡入口。任何死因（夜晚公佈、放逐、開槍、決鬥、自爆）都必須走這裡，
 * 否則技能連鎖與勝利判定會漏。已死者呼叫視為 no-op。
 * 勝利成立時：清空待辦佇列（屠邊達成即終局，未開的槍作廢）、phase → ended。
 */
export function applyDeath(ctx: Ctx, seat: SeatId, cause: DeathCause, poisoned: boolean, during: 'night' | 'day'): void {
  const { state } = ctx;
  const p = player(state, seat);
  if (!p.alive) return;

  p.alive = false;
  p.canVote = false;
  p.death = { day: state.day, during, cause, poisoned };

  pushLog(ctx, `${seatLabel(state, seat)}【${roleName(p.role)}】出局（${CAUSE_LABEL[cause]}）`, true);

  if (!state.winner) {
    const queue: PendingAction[] = [];
    if (state.sheriff === seat) queue.push({ kind: 'badge' });

    if (canShootOnDeath(p.role, cause, poisoned)) {
      queue.push({ kind: 'shoot', seat, via: SHOOT_VIA[p.role]! });
    } else if (ROLE_META[p.role].deathSkill === 'shoot' && poisoned) {
      pushLog(ctx, `⚠️ ${seatLabel(state, seat)}【${roleName(p.role)}】是被毒死的，不能開槍`, true);
    }
    if (p.role === 'whiteWolfKing' && cause === 'explode') {
      queue.push({ kind: 'shoot', seat, via: 'whiteWolfExplode' });
    }
    if (hasLastWords(cause, state.day, state.config.rules)) {
      queue.push({ kind: 'lastWords', seat });
    }
    state.actionQueue.push(...queue);
  }

  const victory = checkVictory(state);
  if (victory && !state.winner) {
    state.winner = victory;
    state.actionQueue = [];
    state.phase = { t: 'ended' };
    pushLog(ctx, `遊戲結束：${victory.reason}`, false);
  }
}

export const CAUSE_LABEL: Record<DeathCause, string> = {
  wolf: '被狼人擊殺',
  poison: '被女巫毒殺',
  guardSaveConflict: '同守同救',
  exile: '被投票放逐',
  shot: '被開槍帶走',
  duel: '騎士決鬥',
  explode: '自爆',
};
