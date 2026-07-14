import type { RoleId } from './types/roles';
import { ROLE_META, roleName } from './types/roles';
import type { GameConfig } from './types/rules';

export interface BoardPreset {
  id: 'standard12' | 'wolfKingGuard12' | 'whiteWolfKnight12';
  name: string;
  playerCount: number;
  roles: RoleId[]; // 長度 = playerCount
}

const villagers = (n: number): RoleId[] => Array(n).fill('villager');
const wolves = (n: number): RoleId[] => Array(n).fill('werewolf');

export const BOARD_PRESETS: BoardPreset[] = [
  {
    id: 'standard12',
    name: '預女獵白（12人標準局）',
    playerCount: 12,
    roles: ['seer', 'witch', 'hunter', 'idiot', ...villagers(4), ...wolves(4)],
  },
  {
    id: 'wolfKingGuard12',
    name: '狼王守衛（12人）',
    playerCount: 12,
    roles: ['seer', 'witch', 'hunter', 'guard', ...villagers(4), ...wolves(3), 'blackWolfKing'],
  },
  {
    id: 'whiteWolfKnight12',
    name: '白狼王騎士（12人）',
    playerCount: 12,
    roles: ['seer', 'witch', 'idiot', 'knight', ...villagers(4), ...wolves(3), 'whiteWolfKing'],
  },
];

const UNIQUE_ROLES: RoleId[] = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'knight', 'blackWolfKing', 'whiteWolfKing'];

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
