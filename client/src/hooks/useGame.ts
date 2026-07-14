import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventEnvelope, GameEvent, GameState } from '@lycaon/engine';
import { replay, reduce, validate } from '@lycaon/engine';
import { api, ApiError } from '../api';

export interface UseGame {
  state: GameState | null;
  envelopes: EventEnvelope[];
  redoCount: number;
  loading: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  /** 送出事件；本地先驗證，失敗回傳錯誤訊息、不改動 state */
  dispatch: (event: GameEvent) => Promise<boolean>;
  undo: (toSeq?: number) => Promise<void>;
  redo: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useGame(id: string): UseGame {
  const [envelopes, setEnvelopes] = useState<EventEnvelope[]>([]);
  const [redoCount, setRedoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const state = useMemo<GameState | null>(() => {
    if (envelopes.length === 0) return null;
    try {
      return replay(envelopes);
    } catch {
      return null;
    }
  }, [envelopes]);

  const headSeq = envelopes.length > 0 ? envelopes[envelopes.length - 1]!.seq : 0;

  const refresh = useCallback(async () => {
    const g = await api.loadGame(id);
    setEnvelopes(g.envelopes);
    setRedoCount(g.redoCount);
  }, [id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .loadGame(id)
      .then((g) => {
        if (!active) return;
        setEnvelopes(g.envelopes);
        setRedoCount(g.redoCount);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const dispatch = useCallback(
    async (event: GameEvent): Promise<boolean> => {
      if (inflight.current || !state) return false;
      const check = validate(state, event);
      if (!check.ok) {
        setError(check.reason);
        return false;
      }
      inflight.current = true;
      setBusy(true);
      setError(null);
      // 樂觀更新：本地先 reduce，UI 立即反應
      const optimistic: EventEnvelope = { seq: headSeq + 1, at: new Date().toISOString(), event };
      const prev = envelopes;
      setEnvelopes([...prev, optimistic]);
      try {
        const res = await api.appendEvent(id, event, headSeq);
        // 用伺服器回傳的信封（正確時間戳）取代樂觀信封
        setEnvelopes([...prev, res.envelope]);
        setRedoCount(0);
        return true;
      } catch (e) {
        setEnvelopes(prev); // 回滾
        if (e instanceof ApiError && e.status === 409) {
          setError('狀態已被其他裝置變更，已重新載入');
          await refresh().catch(() => {});
        } else {
          setError(e instanceof Error ? e.message : '送出失敗');
        }
        return false;
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [id, state, envelopes, headSeq, refresh],
  );

  const undo = useCallback(
    async (toSeq?: number) => {
      if (inflight.current) return;
      inflight.current = true;
      setBusy(true);
      setError(null);
      try {
        await api.undo(id, toSeq);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : '撤銷失敗');
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [id, refresh],
  );

  const redo = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.redo(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '重做失敗');
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [id, refresh]);

  return {
    state,
    envelopes,
    redoCount,
    loading,
    busy,
    error,
    clearError: () => setError(null),
    dispatch,
    undo,
    redo,
    refresh,
  };
}
