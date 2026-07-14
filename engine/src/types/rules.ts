import type { RoleId } from './roles';

export type SeatId = number; // 1-based 座位號

export interface RuleConfig {
  /** 警長機制（上警/競選/1.5票/警徽流） */
  sheriffEnabled: boolean;
  /** 同守同救=死（奶穿） */
  guardSaveConflictDies: boolean;
  /** 女巫自救規則 */
  witchSelfSave: 'always' | 'firstNightOnly' | 'never';
  /** 勝利條件：屠邊/屠城 */
  victory: 'slaughterSide' | 'slaughterCity';
  /** 被刀死亡的遺言規則（被票死永遠有遺言） */
  lastWordsOnNightDeath: 'firstDayOnly' | 'always' | 'none';
  /** 翻牌白癡再被投票=出局 */
  idiotExiledAgainDies: boolean;
  /** 死亡角色夜晚仍走過場喊話（防止玩家從音頻推理身分） */
  callDeadRoles: boolean;
}

export const DEFAULT_RULES: RuleConfig = {
  sheriffEnabled: true,
  guardSaveConflictDies: true,
  witchSelfSave: 'firstNightOnly',
  victory: 'slaughterSide',
  lastWordsOnNightDeath: 'firstDayOnly',
  idiotExiledAgainDies: true,
  callDeadRoles: true,
};

export type PresetId = 'standard12' | 'wolfKingGuard12' | 'whiteWolfKnight12' | 'custom';

export interface SeatConfig {
  seat: SeatId;
  role: RoleId;
  name?: string;
}

export interface GameConfig {
  playerCount: number; // 6~18
  seats: SeatConfig[];
  rules: RuleConfig;
  presetId?: PresetId;
  title?: string;
}
