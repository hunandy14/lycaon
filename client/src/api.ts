import type {
  EventEnvelope,
  GameConfig,
  GameEvent,
  GameProgress,
  GhostView,
  RoleId,
  ShareSettings,
  SpectatorView,
} from '@lycaon/engine';

export interface ShareInfo {
  token: string | null;
  ghostToken: string | null;
  settings: ShareSettings;
}

export interface PlayerStat {
  name: string;
  games: number;
  wins: number;
  winRate: number;
  byRole: Partial<Record<RoleId, number>>;
  asGood: { games: number; wins: number };
  asWolf: { games: number; wins: number };
}

export type WatchData = SpectatorView & { title: string };

/** 陰間頁資料：canReveal=true 回全知 GhostView（god:true），否則降級為觀眾等級（god:false） */
export type GhostData = { title: string } & ((GhostView & { god: true }) | (SpectatorView & { god: false }));

export type ChatScope = 'watch' | 'ghost';

/** 聊天訊息（獨立於遊戲事件，不進 reducer/undo）。scope 分房；isGm=GM 監看端發言。
 *  scope 額外允許 'ai'（AI 規則助手房，見 getAiChat/sendAiChat）——獨立於 watch/ghost 的 ChatScope，
 *  以免既有兩房邏輯（如 { watch, ghost } 索引）的窮舉型別被迫多處理一個不存在的分支。 */
export interface ChatMessage {
  id: number;
  gameId: string;
  nick: string;
  text: string;
  scope: ChatScope | 'ai';
  isGm: boolean;
  createdAt: string;
}

export interface GameSummary {
  id: string;
  title: string;
  status: 'active' | 'finished' | 'aborted';
  playerCount: number;
  presetId: string;
  progress: GameProgress | null;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GameLoad {
  id: string;
  title: string;
  status: GameSummary['status'];
  envelopes: EventEnvelope[];
  redoCount: number;
  locked: boolean;
}

/** 房主管理密碼：存本機（建局裝置自動記住；換裝置才需重打） */
const passKey = (id: string) => `lycaon:pass:${id}`;
export const roomPass = {
  get: (id: string): string | null => localStorage.getItem(passKey(id)),
  set: (id: string, pw: string) => localStorage.setItem(passKey(id), pw),
  clear: (id: string) => localStorage.removeItem(passKey(id)),
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly headSeq?: number,
    /** server 要求房主密碼（401）：UI 據此彈解鎖框 */
    readonly needPassword?: boolean,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit, pw?: string | null): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(pw ? { 'x-room-password': pw } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // 非 JSON 回應（多半是 SPA fallback 的 index.html）：代理埠不對或連到沒有此 API 的舊版服務
    throw new ApiError(`伺服器回應非 JSON（${res.status}），可能代理埠不對或服務為舊版`, res.status);
  }
  if (!res.ok) {
    throw new ApiError(
      (body.error as string) ?? `請求失敗（${res.status}）`,
      res.status,
      body.headSeq as number | undefined,
      body.needPassword as boolean | undefined,
    );
  }
  return body as T;
}

export const api = {
  listGames: () => req<{ games: GameSummary[] }>('/games').then((r) => r.games),

  /** 建局；password 非空 = 設房主管理密碼（經標頭帶入，caller 自行 roomPass.set） */
  createGame: (config: GameConfig, password?: string) =>
    req<{ id: string }>('/games', { method: 'POST', body: JSON.stringify(config) }, password || null).then((r) => r.id),

  loadGame: (id: string) => req<GameLoad>(`/games/${id}`, undefined, roomPass.get(id)),

  deleteGame: (id: string) => req<{ ok: true }>(`/games/${id}`, { method: 'DELETE' }, roomPass.get(id)),

  appendEvent: (id: string, event: GameEvent, expectedSeq: number) =>
    req<{ seq: number; envelope: EventEnvelope }>(
      `/games/${id}/events`,
      { method: 'POST', body: JSON.stringify({ event, expectedSeq }) },
      roomPass.get(id),
    ),

  undo: (id: string, toSeq?: number) =>
    req<{ headSeq: number; redoCount: number }>(
      `/games/${id}/undo`,
      { method: 'POST', body: JSON.stringify({ toSeq }) },
      roomPass.get(id),
    ),

  redo: (id: string) =>
    req<{ headSeq: number; redoCount: number }>(`/games/${id}/redo`, { method: 'POST', body: '{}' }, roomPass.get(id)),

  getShare: (id: string) => req<ShareInfo>(`/games/${id}/share`, undefined, roomPass.get(id)),

  updateShare: (id: string, patch: Partial<ShareSettings>) =>
    req<ShareInfo>(`/games/${id}/share`, { method: 'POST', body: JSON.stringify(patch) }, roomPass.get(id)),

  getWatch: (token: string) => req<WatchData>(`/watch/${token}`),

  getGhost: (token: string) => req<GhostData>(`/ghost/${token}`),

  /** base='watch' 走 /api/watch（scope 固定 watch，query 省略）；base='ghost' 走 /api/ghost（雙房，帶 scope query） */
  getChat: (base: 'watch' | 'ghost', token: string, scope: ChatScope = 'watch') =>
    req<{ messages: ChatMessage[] }>(
      base === 'watch' ? `/watch/${token}/chat` : `/ghost/${token}/chat?scope=${scope}`,
    ).then((r) => r.messages),

  sendChat: (base: 'watch' | 'ghost', token: string, nick: string, text: string, scope: ChatScope = 'watch') =>
    req<ChatMessage>(
      base === 'watch' ? `/watch/${token}/chat` : `/ghost/${token}/chat`,
      { method: 'POST', body: JSON.stringify({ nick, text, scope }) },
    ),

  /** GM 聊天監看：一次回兩房歷史（需房主密碼） */
  getGmChat: (id: string) =>
    req<{ watch: ChatMessage[]; ghost: ChatMessage[] }>(`/games/${id}/chat`, undefined, roomPass.get(id)),

  /** GM 發言：nick 固定 'GM'、isGm=1，server 端免 rate limit（需房主密碼） */
  sendGmChat: (id: string, scope: ChatScope, text: string) =>
    req<ChatMessage>(`/games/${id}/chat`, { method: 'POST', body: JSON.stringify({ scope, text }) }, roomPass.get(id)),

  /** AI 規則助手歷史（scope 一律 'ai'；需房主密碼）。enabled=false 代表 server 未設定上游金鑰。 */
  getAiChat: (id: string, pass?: string | null) =>
    req<{ enabled: boolean; messages: ChatMessage[] }>(`/games/${id}/ai-chat`, undefined, pass),

  /** GM 提問；成功回問答一組（各自已入歷史），502=AI 上游失敗（問題已入歷史，回覆缺席）、503=AI 未設定（需房主密碼） */
  sendAiChat: (id: string, pass: string | null | undefined, text: string) =>
    req<{ question: ChatMessage; reply: ChatMessage }>(
      `/games/${id}/ai-chat`,
      { method: 'POST', body: JSON.stringify({ text }) },
      pass,
    ),

  getRoster: () => req<{ names: string[] }>('/roster').then((r) => r.names),

  getStats: () => req<{ totalGames: number; players: PlayerStat[] }>('/stats'),
};
