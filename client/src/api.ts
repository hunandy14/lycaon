import type { EventEnvelope, GameConfig, GameEvent, GameProgress } from '@lycaon/engine';

export interface GameSummary {
  id: string;
  title: string;
  status: 'active' | 'finished' | 'aborted';
  playerCount: number;
  presetId: string;
  progress: GameProgress | null;
  createdAt: string;
  updatedAt: string;
}

export interface GameLoad {
  id: string;
  title: string;
  status: GameSummary['status'];
  envelopes: EventEnvelope[];
  redoCount: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly headSeq?: number,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error ?? `請求失敗（${res.status}）`, res.status, body.headSeq);
  }
  return body as T;
}

export const api = {
  listGames: () => req<{ games: GameSummary[] }>('/games').then((r) => r.games),

  createGame: (config: GameConfig) =>
    req<{ id: string }>('/games', { method: 'POST', body: JSON.stringify(config) }).then((r) => r.id),

  loadGame: (id: string) => req<GameLoad>(`/games/${id}`),

  deleteGame: (id: string) => req<{ ok: true }>(`/games/${id}`, { method: 'DELETE' }),

  appendEvent: (id: string, event: GameEvent, expectedSeq: number) =>
    req<{ seq: number; envelope: EventEnvelope }>(`/games/${id}/events`, {
      method: 'POST',
      body: JSON.stringify({ event, expectedSeq }),
    }),

  undo: (id: string, toSeq?: number) =>
    req<{ headSeq: number; redoCount: number }>(`/games/${id}/undo`, {
      method: 'POST',
      body: JSON.stringify({ toSeq }),
    }),

  redo: (id: string) =>
    req<{ headSeq: number; redoCount: number }>(`/games/${id}/redo`, { method: 'POST', body: '{}' }),
};
