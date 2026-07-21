import type { Faction, RoleId } from './roles';
import type { GameConfig, SeatId } from './rules';

export type DeathCause =
  | 'wolf' // 被刀
  | 'poison' // 被毒
  | 'guardSaveConflict' // 同守同救（奶穿）
  | 'exile' // 被放逐
  | 'shot' // 被獵人/黑狼王/白狼王自爆帶走
  | 'duel' // 騎士決鬥
  | 'explode' // 自爆
  | 'lovesick'; // 殉情（情侶另一半死亡）

export interface DeathInfo {
  day: number;
  during: 'night' | 'day';
  cause: DeathCause;
  /** 當夜是否中毒（決定獵人/黑狼王能否開槍的唯一依據） */
  poisoned: boolean;
}

export interface PlayerState {
  seat: SeatId;
  role: RoleId;
  name?: string;
  alive: boolean;
  death?: DeathInfo;
  /** 白癡被票翻牌：存活但失去投票權 */
  idiotRevealed: boolean;
  /** 被種狼感染：轉入狼人陣營（技能是否保留依 infectedKeepsSkills） */
  converted: boolean;
  /**
   * seedWolfMakesWolfKing 開啟時：已轉換為狼王但延後一夜生效——陣營已是狼（factionOf 照算），
   * 但本夜尚不能加入狼隊刀人。下一次 NIGHT_STARTED/enterNight 時清為 false（正式生效）。
   */
  wolfKingPending: boolean;
  canVote: boolean;
  /** 一次性主動技能已用（騎士決鬥） */
  skillUsed: boolean;
}

export interface PendingDeath {
  seat: SeatId;
  cause: DeathCause;
  poisoned: boolean;
}

/** 出局後待 GM 處理的事項佇列（技能連鎖核心），FIFO 嚴格消化 */
export type PendingAction =
  | { kind: 'lastWords'; seat: SeatId }
  | { kind: 'shoot'; seat: SeatId; via: 'hunter' | 'blackWolfKing' | 'whiteWolfExplode' }
  | { kind: 'badge' };

export type DayStage =
  | 'sheriff' // 首日警長競選
  | 'announce' // 等待公佈死訊
  | 'speech' // 發言階段（投票在此階段直接提交 EXILE_VOTED；actionQueue 非空時 UI 先顯示待辦）
  | 'pk' // 放逐平票 PK
  | 'dayEnd'; // 白天結束，等待天黑

export type Phase =
  | { t: 'setup' } // 建局完成，等待首夜
  | { t: 'night'; stepIndex: number } // 索引 buildNightPlan 序列
  | { t: 'day'; stage: DayStage }
  | { t: 'ended' };

export interface NightBuffer {
  guardTarget: SeatId | null;
  wolfTarget: SeatId | null;
  /** 種狼今晚發動感染（作用於 wolfTarget，天亮生效） */
  infect: boolean;
  witchSaved: boolean;
  witchPoison: SeatId | null;
  seerTarget: SeatId | null;
}

export interface SeerCheck {
  night: number;
  target: SeatId;
  result: Faction;
}

export interface Election {
  candidates: SeatId[];
  withdrawn: SeatId[];
  /** 平票 PK 名單；null = 尚未 PK */
  pkSeats: SeatId[] | null;
  round: number;
  done: boolean;
}

export interface ExileVote {
  pkSeats: SeatId[] | null;
  round: number;
}

export interface TimelineEntry {
  seq: number;
  at: string;
  day: number;
  phase: string; // 顯示用：「第 1 夜」「第 2 天」
  text: string;
  /** true = 僅 GM 可見（觀戰端過濾用） */
  secret: boolean;
  /** 條目類別（觀戰端細粒度過濾）：ballots=票型明細（隨 showVotes）、note=GM 筆記（永不外流） */
  kind?: 'ballots' | 'note';
}

export interface GameState {
  config: GameConfig;
  /** 第 N 夜 / 第 N 天 */
  day: number;
  phase: Phase;
  players: PlayerState[];
  night: NightBuffer;
  /** 上一晚守衛目標（禁連守驗證） */
  lastGuardTarget: SeatId | null;
  /** 邱比特連結的情侶（一方死另一方殉情；跨陣營=第三方） */
  lovers: [SeatId, SeatId] | null;
  /** 種狼感染已於第幾夜使用（null=未用） */
  seedWolfUsedOnNight: number | null;
  potions: { antidote: boolean; poison: boolean };
  /** 已結算、未公佈的夜晚死亡（首日競選時死者仍參與） */
  pendingDeaths: PendingDeath[];
  actionQueue: PendingAction[];
  sheriff: SeatId | null;
  election: Election | null;
  exile: ExileVote | null;
  /** 白天被中斷（自爆/決鬥成功）：跳過發言與投票 */
  dayInterrupted: boolean;
  seerChecks: SeerCheck[];
  winner: { faction: Faction | 'lovers'; reason: string } | null;
  log: TimelineEntry[];
}

export const EMPTY_NIGHT: NightBuffer = {
  guardTarget: null,
  wolfTarget: null,
  infect: false,
  witchSaved: false,
  witchPoison: null,
  seerTarget: null,
};
