import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EventEnvelope, GameEvent } from '@lycaon/engine';

export interface GameRow {
  id: string;
  title: string;
  status: 'active' | 'finished' | 'aborted';
  config_json: string;
  /** 引擎 gameProgress 快照（append/undo/redo 時更新；舊局為 NULL，列表時懶補） */
  progress_json: string | null;
  /** 同樂模式邀請 token（一局一個，開啟時生成後固定） */
  share_token: string | null;
  /** ShareSettings JSON（null = 從未開過同樂模式） */
  share_json: string | null;
  /** 房主管理密碼雜湊（scrypt，格式 salt:hex；null = 舊局或不設密碼，不上鎖） */
  password_hash: string | null;
  /** 陰間（死者視角）邀請 token（一局一個，開啟時生成後固定） */
  ghost_token: string | null;
  created_at: string;
  updated_at: string;
}

/** 聊天房別：觀戰端「陽間」或死者視角「陰間」 */
export type ChatScope = 'watch' | 'ghost';

/** 觀戰/陰間聊天訊息（獨立於 events，不進 reducer/undo） */
export interface ChatMessage {
  id: number;
  gameId: string;
  nick: string;
  text: string;
  scope: ChatScope;
  isGm: boolean;
  createdAt: string;
}

export function openDb(path: string): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'active',
      config_json TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      seq          INTEGER NOT NULL,
      type         TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      undone       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (game_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_events_live ON events (game_id, undone, seq);
    CREATE TABLE IF NOT EXISTS roster (
      name        TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id    TEXT NOT NULL,
      nick       TEXT NOT NULL,
      text       TEXT NOT NULL,
      scope      TEXT NOT NULL DEFAULT 'watch',
      is_gm      INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_game ON chat (game_id, scope, id);
  `);
  const gameCols = db.prepare(`PRAGMA table_info(games)`).all() as { name: string }[];
  const addCol = (table: string, cols: { name: string }[], name: string, decl = 'TEXT') => {
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`);
  };
  addCol('games', gameCols, 'progress_json');
  addCol('games', gameCols, 'share_token');
  addCol('games', gameCols, 'share_json');
  addCol('games', gameCols, 'password_hash');
  addCol('games', gameCols, 'ghost_token');
  const chatCols = db.prepare(`PRAGMA table_info(chat)`).all() as { name: string }[];
  addCol('chat', chatCols, 'scope', `TEXT NOT NULL DEFAULT 'watch'`);
  addCol('chat', chatCols, 'is_gm', `INTEGER NOT NULL DEFAULT 0`);
  return db;
}

export class EventStore {
  constructor(private db: Database.Database) {}

  createGame(id: string, title: string, configJson: string, now: string, passwordHash: string | null = null): void {
    this.db
      .prepare(`INSERT INTO games (id, title, status, config_json, password_hash, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)`)
      .run(id, title, configJson, passwordHash, now, now);
  }

  listGames(): GameRow[] {
    return this.db.prepare(`SELECT * FROM games ORDER BY created_at DESC`).all() as GameRow[];
  }

  getGame(id: string): GameRow | undefined {
    return this.db.prepare(`SELECT * FROM games WHERE id = ?`).get(id) as GameRow | undefined;
  }

  deleteGame(id: string): void {
    this.db.prepare(`DELETE FROM events WHERE game_id = ?`).run(id);
    this.db.prepare(`DELETE FROM games WHERE id = ?`).run(id);
  }

  /** 有效事件流（undone=0，重播用） */
  loadEnvelopes(gameId: string): EventEnvelope[] {
    const rows = this.db
      .prepare(`SELECT seq, created_at, payload_json FROM events WHERE game_id = ? AND undone = 0 ORDER BY seq`)
      .all(gameId) as { seq: number; created_at: string; payload_json: string }[];
    return rows.map((r) => ({ seq: r.seq, at: r.created_at, event: JSON.parse(r.payload_json) as GameEvent }));
  }

  /** 目前有效流的最大 seq（無事件 = 0） */
  headSeq(gameId: string): number {
    const row = this.db
      .prepare(`SELECT COALESCE(MAX(seq), 0) AS head FROM events WHERE game_id = ? AND undone = 0`)
      .get(gameId) as { head: number };
    return row.head;
  }

  /** 可 redo 的事件數 */
  redoCount(gameId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE game_id = ? AND undone = 1`)
      .get(gameId) as { n: number };
    return row.n;
  }

  /**
   * append 新事件：先物理刪除 undone 分支（redo 樹作廢），seq = 全表最大 + 1。
   * 呼叫方（route）負責先用引擎 validate。
   */
  append(gameId: string, event: GameEvent, now: string): number {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM events WHERE game_id = ? AND undone = 1`).run(gameId);
      const seq = this.headSeq(gameId) + 1;
      this.db
        .prepare(`INSERT INTO events (game_id, seq, type, payload_json, created_at, undone) VALUES (?, ?, ?, ?, ?, 0)`)
        .run(gameId, seq, event.type, JSON.stringify(event), now);
      return seq;
    });
    return tx();
  }

  /** undo 到 toSeq（含之後全部標記 undone）；不給 toSeq = 只退最後一筆。回傳新 head */
  undo(gameId: string, toSeq?: number): number {
    const head = this.headSeq(gameId);
    const from = toSeq ?? head;
    if (from <= 1) throw new Error('不能撤銷建局事件');
    this.db.prepare(`UPDATE events SET undone = 1 WHERE game_id = ? AND undone = 0 AND seq >= ?`).run(gameId, from);
    return this.headSeq(gameId);
  }

  /** redo 一筆（undone 中 seq 最小者），回傳新 head */
  redo(gameId: string): number {
    const row = this.db
      .prepare(`SELECT MIN(seq) AS seq FROM events WHERE game_id = ? AND undone = 1`)
      .get(gameId) as { seq: number | null };
    if (row.seq === null) throw new Error('沒有可重做的事件');
    this.db.prepare(`UPDATE events SET undone = 0 WHERE game_id = ? AND seq = ?`).run(gameId, row.seq);
    return this.headSeq(gameId);
  }

  updateGameStatus(gameId: string, status: GameRow['status'], progressJson: string, now: string): void {
    this.db
      .prepare(`UPDATE games SET status = ?, progress_json = ?, updated_at = ? WHERE id = ?`)
      .run(status, progressJson, now, gameId);
  }

  updateShare(gameId: string, token: string | null, shareJson: string): void {
    this.db.prepare(`UPDATE games SET share_token = ?, share_json = ? WHERE id = ?`).run(token, shareJson, gameId);
  }

  getGameByShareToken(token: string): GameRow | undefined {
    return this.db.prepare(`SELECT * FROM games WHERE share_token = ?`).get(token) as GameRow | undefined;
  }

  updateGhost(gameId: string, token: string): void {
    this.db.prepare(`UPDATE games SET ghost_token = ? WHERE id = ?`).run(token, gameId);
  }

  getGameByGhostToken(token: string): GameRow | undefined {
    return this.db.prepare(`SELECT * FROM games WHERE ghost_token = ?`).get(token) as GameRow | undefined;
  }

  /** 建局時把座位名字收進名冊（自動完成來源、未來 Google 綁定的錨點） */
  upsertRoster(names: string[], now: string): void {
    const stmt = this.db.prepare(`INSERT OR IGNORE INTO roster (name, created_at) VALUES (?, ?)`);
    const tx = this.db.transaction(() => {
      for (const raw of names) {
        const name = raw.trim();
        if (name) stmt.run(name, now);
      }
    });
    tx();
  }

  listRoster(): string[] {
    return (this.db.prepare(`SELECT name FROM roster ORDER BY name`).all() as { name: string }[]).map((r) => r.name);
  }

  /** 寫入一則聊天訊息，回傳完整 ChatMessage。scope 分房；isGm=GM 端發言（金色徽章、免 rate limit 由呼叫端處理） */
  appendChat(gameId: string, nick: string, text: string, now: string, scope: ChatScope, isGm = false): ChatMessage {
    const info = this.db
      .prepare(`INSERT INTO chat (game_id, nick, text, scope, is_gm, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(gameId, nick, text, scope, isGm ? 1 : 0, now);
    return { id: Number(info.lastInsertRowid), gameId, nick, text, scope, isGm, createdAt: now };
  }

  /** 指定房別最近 N 則聊天訊息（依 id 升冪） */
  listChat(gameId: string, scope: ChatScope, limit = 50): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT id, game_id, nick, text, scope, is_gm, created_at FROM chat WHERE game_id = ? AND scope = ? ORDER BY id DESC LIMIT ?`
      )
      .all(gameId, scope, limit) as {
      id: number;
      game_id: string;
      nick: string;
      text: string;
      scope: ChatScope;
      is_gm: number;
      created_at: string;
    }[];
    return rows
      .reverse()
      .map((r) => ({
        id: r.id,
        gameId: r.game_id,
        nick: r.nick,
        text: r.text,
        scope: r.scope,
        isGm: !!r.is_gm,
        createdAt: r.created_at,
      }));
  }
}
