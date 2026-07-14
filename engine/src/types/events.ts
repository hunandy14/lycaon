import type { GameConfig, SeatId } from './rules';

/** 一張選票；target 為 null = 棄票 */
export interface Ballot {
  voter: SeatId;
  target: SeatId | null;
}

/**
 * 事件只記錄「GM 手指按下去的那件事」（輸入事實）。
 * 衍生結果（死亡、查驗結果、白癡翻牌、勝負、播報稿）一律由 reducer 推導，
 * 這是 undo 一致性的命脈——新增事件前務必確認它不是衍生事實。
 */
export type GameEvent =
  // 建局
  | { type: 'GAME_CREATED'; config: GameConfig }
  // 夜晚
  | { type: 'NIGHT_STARTED' }
  | { type: 'GUARD_ACTED'; target: SeatId | null } // null = 空守
  | { type: 'WOLVES_ACTED'; target: SeatId | null } // null = 空刀
  | { type: 'WITCH_ACTED'; save: boolean; poison: SeatId | null }
  | { type: 'SEER_ACTED'; target: SeatId }
  | { type: 'NIGHT_ENDED' }
  // 白天：警長競選（僅首日、sheriffEnabled）
  | { type: 'SHERIFF_NOMINATED'; candidates: SeatId[] }
  | { type: 'SHERIFF_WITHDRAWN'; seat: SeatId }
  | { type: 'SHERIFF_VOTED'; ballots: Ballot[] }
  | { type: 'SHERIFF_ELECTION_SKIPPED' }
  // 白天：公佈死訊與放逐
  | { type: 'DEATHS_ANNOUNCED' }
  | { type: 'EXILE_VOTED'; ballots: Ballot[] }
  | { type: 'DAY_ENDED' }
  // 出局技能與中斷
  | { type: 'LAST_WORDS_DONE'; seat: SeatId }
  | { type: 'SHOT_FIRED'; shooter: SeatId; target: SeatId | null } // null = 放棄開槍
  | { type: 'KNIGHT_DUELED'; knight: SeatId; target: SeatId }
  | { type: 'WOLF_EXPLODED'; seat: SeatId }
  | { type: 'BADGE_TRANSFERRED'; to: SeatId | null } // null = 撕毀警徽
  // 其他
  | { type: 'NOTE_ADDED'; text: string }
  | { type: 'GAME_ABORTED'; reason?: string };

export type GameEventType = GameEvent['type'];

export interface EventEnvelope {
  /** 每局 1-based 連續遞增 */
  seq: number;
  /** ISO 時間戳，僅供顯示；reducer 邏輯禁止使用 */
  at: string;
  event: GameEvent;
}
