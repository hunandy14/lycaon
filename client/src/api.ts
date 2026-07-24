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
 *  scope 額外允許 'ai'（AI 規則助手房，見 getAiChat/sendAiChatStream）——獨立於 watch/ghost 的 ChatScope，
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

/** AI 規則助手串流回呼（見 api.sendAiChatStream；協議：server NDJSON delta/done/error） */
export interface AiStreamHandlers {
  /** 每收到一塊 AI 回覆文字增量 */
  onDelta: (text: string) => void;
  /** 串流成功收尾：question/reply 為 server 落庫後的真實記錄 */
  onDone: (question: ChatMessage, reply: ChatMessage) => void;
  /** 串流中途失敗（上游錯誤/連線中斷）：人類可讀繁中訊息；GM 問題已留在 server 歷史 */
  onError: (message: string) => void;
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

  /**
   * GM 提問（串流版）：server 回 NDJSON（每行一個 JSON 物件）——
   * delta（文字增量，逐塊回呼 onDelta）→ done（問答皆已入 server 歷史，回呼 onDone）或
   * error（上游中途失敗，回呼 onError；GM 問題已入歷史可重問）。
   * 400（長度）/401（密碼）/503（AI 未設定）維持非串流 JSON 短路，直接 throw ApiError。
   */
  sendAiChatStream: async (
    id: string,
    pass: string | null | undefined,
    text: string,
    handlers: AiStreamHandlers,
  ): Promise<void> => {
    const res = await fetch(`/api/games/${id}/ai-chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(pass ? { 'x-room-password': pass } : {}) },
      body: JSON.stringify({ text }),
    });
    const ctype = res.headers.get('content-type') ?? '';
    if (!res.ok || !ctype.includes('ndjson')) {
      // 非串流短路（400/401/503…）：沿用 req() 的錯誤語義
      const raw = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        throw new ApiError(`伺服器回應非 JSON（${res.status}），可能代理埠不對或服務為舊版`, res.status);
      }
      throw new ApiError(
        (body.error as string) ?? `請求失敗（${res.status}）`,
        res.status,
        undefined,
        body.needPassword as boolean | undefined,
      );
    }
    if (!res.body) throw new ApiError('瀏覽器不支援串流回應', res.status);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let ended = false; // 收過 done/error 事件才算正常收尾
    type AiStreamEvent = { t?: string; text?: string; message?: string; question?: ChatMessage; reply?: ChatMessage };
    const handleLine = (line: string) => {
      if (!line.trim()) return;
      let ev: AiStreamEvent;
      try {
        ev = JSON.parse(line) as AiStreamEvent;
      } catch {
        return; // 略過壞行（理論上不會發生）
      }
      if (ev.t === 'delta' && typeof ev.text === 'string') {
        handlers.onDelta(ev.text);
      } else if (ev.t === 'done' && ev.question && ev.reply) {
        ended = true;
        handlers.onDone(ev.question, ev.reply);
      } else if (ev.t === 'error') {
        ended = true;
        handlers.onError(ev.message || 'AI 回應失敗');
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    if (buf.trim()) handleLine(buf);
    if (!ended) handlers.onError('連線中斷，回覆未完成（問題已留在紀錄，可重新提問）');
  },

  getRoster: () => req<{ names: string[] }>('/roster').then((r) => r.names),

  getStats: () => req<{ totalGames: number; players: PlayerStat[] }>('/stats'),
};
