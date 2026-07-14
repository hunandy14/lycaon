import type { GameConfig, GameEvent, GameState, RoleId, RuleConfig, SeatId, EventEnvelope } from '../src';
import { DEFAULT_RULES, initialState, reduce } from '../src';

export const AT = '2026-01-01T00:00:00.000Z';

/** roles[i] = 座位 i+1 的角色 */
export function makeConfig(roles: RoleId[], rules: Partial<RuleConfig> = {}): GameConfig {
  return {
    playerCount: roles.length,
    seats: roles.map((role, i) => ({ seat: i + 1, role })),
    rules: { ...DEFAULT_RULES, sheriffEnabled: false, ...rules },
  };
}

// 測試用標準座位表
export const STANDARD12: RoleId[] = ['seer', 'witch', 'hunter', 'idiot', 'villager', 'villager', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'werewolf'];
export const WOLFKING12: RoleId[] = ['seer', 'witch', 'hunter', 'guard', 'villager', 'villager', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'blackWolfKing'];
export const WHITEWOLF12: RoleId[] = ['seer', 'witch', 'idiot', 'knight', 'villager', 'villager', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'whiteWolfKing'];

export function toEnvelopes(config: GameConfig, events: GameEvent[]): EventEnvelope[] {
  const all: GameEvent[] = [{ type: 'GAME_CREATED', config }, ...events];
  return all.map((event, i) => ({ seq: i + 1, at: AT, event }));
}

/** 逐事件 reduce（等價於 replay，測試裡直接用它跑劇本） */
export function run(config: GameConfig, events: GameEvent[]): GameState {
  let state = initialState(config, 1, AT);
  events.forEach((event, i) => {
    state = reduce(state, { seq: i + 2, at: AT, event });
  });
  return state;
}

/** 完整一夜的事件序列（依板子存在且存活的角色排；測試方自行保證與 plan 一致） */
export function night(o: {
  guard?: SeatId | null;
  wolf: SeatId | null;
  save?: boolean;
  poison?: SeatId | null;
  seer?: SeatId | null;
  skipGuard?: boolean; // 守衛已死（callDeadRoles 走過場，不產事件）
  skipWitch?: boolean;
  skipSeer?: boolean;
}): GameEvent[] {
  const events: GameEvent[] = [{ type: 'NIGHT_STARTED' }];
  if (o.guard !== undefined && !o.skipGuard) events.push({ type: 'GUARD_ACTED', target: o.guard });
  events.push({ type: 'WOLVES_ACTED', target: o.wolf });
  if (!o.skipWitch) events.push({ type: 'WITCH_ACTED', save: o.save ?? false, poison: o.poison ?? null });
  if (o.seer !== undefined && o.seer !== null && !o.skipSeer) events.push({ type: 'SEER_ACTED', target: o.seer });
  events.push({ type: 'NIGHT_ENDED' });
  return events;
}

/** 後續夜晚用 DAY_ENDED 銜接時，把首個 NIGHT_STARTED 換掉 */
export function nextNight(o: Parameters<typeof night>[0]): GameEvent[] {
  const [, ...rest] = night(o);
  return [{ type: 'DAY_ENDED' }, ...rest];
}

export function ballots(...pairs: [SeatId, SeatId | null][]): { voter: SeatId; target: SeatId | null }[] {
  return pairs.map(([voter, target]) => ({ voter, target }));
}

export function alive(state: GameState): SeatId[] {
  return state.players.filter((p) => p.alive).map((p) => p.seat);
}

export function dead(state: GameState): SeatId[] {
  return state.players.filter((p) => !p.alive).map((p) => p.seat);
}
