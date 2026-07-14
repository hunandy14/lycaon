export type RoleId =
  | 'seer'
  | 'witch'
  | 'hunter'
  | 'idiot'
  | 'guard'
  | 'knight'
  | 'villager'
  | 'werewolf'
  | 'blackWolfKing'
  | 'whiteWolfKing';

export type Faction = 'good' | 'wolf';
export type RoleClass = 'god' | 'villager' | 'wolf';

export interface RoleMeta {
  name: string;
  short: string; // SeatGrid 縮寫用，1~2 字
  faction: Faction;
  cls: RoleClass;
  /** 出局時可開槍帶人（獵人/黑狼王；被毒或自爆除外，見 canShootOnDeath） */
  deathSkill?: 'shoot';
}

export const ROLE_META: Record<RoleId, RoleMeta> = {
  seer: { name: '預言家', short: '預', faction: 'good', cls: 'god' },
  witch: { name: '女巫', short: '女', faction: 'good', cls: 'god' },
  hunter: { name: '獵人', short: '獵', faction: 'good', cls: 'god', deathSkill: 'shoot' },
  idiot: { name: '白癡', short: '白', faction: 'good', cls: 'god' },
  guard: { name: '守衛', short: '守', faction: 'good', cls: 'god' },
  knight: { name: '騎士', short: '騎', faction: 'good', cls: 'god' },
  villager: { name: '平民', short: '民', faction: 'good', cls: 'villager' },
  werewolf: { name: '狼人', short: '狼', faction: 'wolf', cls: 'wolf' },
  blackWolfKing: { name: '黑狼王', short: '黑狼', faction: 'wolf', cls: 'wolf', deathSkill: 'shoot' },
  whiteWolfKing: { name: '白狼王', short: '白狼', faction: 'wolf', cls: 'wolf' },
};

export const ALL_ROLES = Object.keys(ROLE_META) as RoleId[];

export function roleName(role: RoleId): string {
  return ROLE_META[role].name;
}
