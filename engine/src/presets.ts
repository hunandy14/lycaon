import type { RoleId } from './types/roles';
import { ROLE_META, roleName } from './types/roles';
import type { GameConfig, PresetId, RuleConfig } from './types/rules';

export type BoardCategory = 'basic' | 'specialWolf' | 'special';

export interface BoardPreset {
  id: Exclude<PresetId, 'custom'>;
  name: string;
  category: BoardCategory;
  playerCount: number;
  roles: RoleId[]; // 長度 = playerCount
  /** 選此板時一併套用的規則覆寫（例如種狼變狼王板需開 seedWolfMakesWolfKing） */
  rules?: Partial<RuleConfig>;
}

export const BOARD_CATEGORIES: { id: BoardCategory; name: string }[] = [
  { id: 'basic', name: '基礎標準' },
  { id: 'specialWolf', name: '特色狼人' },
  { id: 'special', name: '特殊機制' },
];

const villagers = (n: number): RoleId[] => Array(n).fill('villager');
const wolves = (n: number): RoleId[] => Array(n).fill('werewolf');

export const BOARD_PRESETS: BoardPreset[] = [
  {
    id: 'standard9',
    name: '預女獵（9人屠邊）',
    category: 'basic',
    playerCount: 9,
    roles: ['seer', 'witch', 'hunter', ...villagers(3), ...wolves(3)],
  },
  {
    id: 'standard10',
    name: '預女獵（10人屠邊）',
    category: 'basic',
    playerCount: 10,
    roles: ['seer', 'witch', 'hunter', ...villagers(4), ...wolves(3)],
  },
  {
    id: 'standard12',
    name: '預女獵白（12人標準局）',
    category: 'basic',
    playerCount: 12,
    roles: ['seer', 'witch', 'hunter', 'idiot', ...villagers(4), ...wolves(4)],
  },
  {
    id: 'wolfKingGuard12',
    name: '狼王守衛（12人）',
    category: 'specialWolf',
    playerCount: 12,
    roles: ['seer', 'witch', 'hunter', 'guard', ...villagers(4), ...wolves(3), 'blackWolfKing'],
  },
  {
    id: 'whiteWolfKnight12',
    name: '白狼王騎士（12人）',
    category: 'specialWolf',
    playerCount: 12,
    roles: ['seer', 'witch', 'idiot', 'knight', ...villagers(4), ...wolves(3), 'whiteWolfKing'],
  },
  {
    id: 'seedWolf12',
    name: '種狼（12人）',
    category: 'specialWolf',
    playerCount: 12,
    roles: ['seer', 'witch', 'hunter', 'idiot', ...villagers(4), ...wolves(3), 'seedWolf'],
  },
  {
    id: 'seedWolfKing12',
    name: '種狼變狼王（12人）',
    category: 'specialWolf',
    playerCount: 12,
    roles: ['seer', 'witch', 'hunter', 'idiot', ...villagers(5), ...wolves(2), 'seedWolf'],
    rules: { seedWolfMakesWolfKing: true },
  },
  {
    id: 'cupid12',
    name: '邱比特（12人）',
    category: 'special',
    playerCount: 12,
    roles: ['seer', 'witch', 'hunter', 'cupid', ...villagers(4), ...wolves(4)],
  },
];

const UNIQUE_ROLES: RoleId[] = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'knight', 'cupid', 'blackWolfKing', 'whiteWolfKing', 'seedWolf'];

/** 建局配置驗證；回傳繁中錯誤訊息清單（空陣列 = 合法） */
export function validateConfig(config: GameConfig): string[] {
  const errors: string[] = [];
  const { playerCount, seats } = config;

  if (playerCount < 6 || playerCount > 18) errors.push('人數必須在 6 到 18 之間');
  if (seats.length !== playerCount) errors.push(`座位數（${seats.length}）與人數（${playerCount}）不符`);

  const seatIds = new Set(seats.map((s) => s.seat));
  if (seatIds.size !== seats.length) errors.push('座位號重複');
  for (const s of seats) {
    if (s.seat < 1 || s.seat > playerCount) errors.push(`座位號 ${s.seat} 超出範圍`);
    if (!ROLE_META[s.role]) errors.push(`座位 ${s.seat} 的角色不存在`);
  }

  const count = (role: RoleId) => seats.filter((s) => s.role === role).length;
  for (const role of UNIQUE_ROLES) {
    if (count(role) > 1) errors.push(`${roleName(role)}只能有一位`);
  }
  const wolfCount = seats.filter((s) => ROLE_META[s.role]?.faction === 'wolf').length;
  const goodCount = seats.length - wolfCount;
  if (wolfCount === 0) errors.push('至少要有一名狼人陣營');
  if (goodCount === 0) errors.push('至少要有一名好人陣營');

  return errors;
}
