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
  /** 殉情的獵人/黑狼王可以開槍 */
  lovesickCanShoot: boolean;
  /** 種狼首夜即可感染（預設第二夜起） */
  seedWolfFirstNight: boolean;
  /** 被感染者保留原技能（預設失去技能、變普通狼） */
  infectedKeepsSkills: boolean;
  /** 種狼感染後轉為「狼王」而非普通狼人；延後一夜才加入狼隊刀人（預設關閉＝維持普通感染） */
  seedWolfMakesWolfKing: boolean;
}

export const DEFAULT_RULES: RuleConfig = {
  sheriffEnabled: true,
  guardSaveConflictDies: true,
  witchSelfSave: 'firstNightOnly',
  victory: 'slaughterSide',
  lastWordsOnNightDeath: 'firstDayOnly',
  idiotExiledAgainDies: true,
  callDeadRoles: true,
  lovesickCanShoot: false,
  seedWolfFirstNight: false,
  infectedKeepsSkills: false,
  seedWolfMakesWolfKing: false,
};

export type PresetId = 'standard12' | 'wolfKingGuard12' | 'whiteWolfKnight12' | 'cupid12' | 'seedWolf12' | 'custom';

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
