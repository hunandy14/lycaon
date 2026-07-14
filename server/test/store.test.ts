import { describe, expect, it } from 'vitest';
import { openDb, EventStore } from '../src/db';
import { replay, DEFAULT_RULES, type GameConfig, type GameEvent } from '@lycaon/engine';

const config: GameConfig = {
  playerCount: 6,
  seats: (['seer', 'witch', 'villager', 'villager', 'werewolf', 'werewolf'] as const).map((role, i) => ({
    seat: i + 1,
    role,
  })),
  rules: { ...DEFAULT_RULES, sheriffEnabled: false },
};

function newStore(): EventStore {
  return new EventStore(openDb(':memory:'));
}

const NOW = '2026-01-01T00:00:00.000Z';

describe('EventStore undo/redo 語意', () => {
  it('append → undo → redo → 事件流一致', () => {
    const store = newStore();
    store.createGame('g1', 'test', JSON.stringify(config), NOW);
    store.append('g1', { type: 'GAME_CREATED', config }, NOW);
    store.append('g1', { type: 'NIGHT_STARTED' }, NOW);
    store.append('g1', { type: 'WOLVES_ACTED', target: 3 } as GameEvent, NOW);
    expect(store.headSeq('g1')).toBe(3);

    // undo 一步
    expect(store.undo('g1')).toBe(2);
    expect(store.loadEnvelopes('g1')).toHaveLength(2);
    expect(store.redoCount('g1')).toBe(1);

    // redo 回來
    expect(store.redo('g1')).toBe(3);
    expect(store.loadEnvelopes('g1')).toHaveLength(3);

    // 重播可用
    const state = replay(store.loadEnvelopes('g1'));
    expect(state.night.wolfTarget).toBe(3);
  });

  it('undo 後 append 新事件 → redo 分支作廢', () => {
    const store = newStore();
    store.createGame('g1', 'test', JSON.stringify(config), NOW);
    store.append('g1', { type: 'GAME_CREATED', config }, NOW);
    store.append('g1', { type: 'NIGHT_STARTED' }, NOW);
    store.append('g1', { type: 'WOLVES_ACTED', target: 3 } as GameEvent, NOW);
    store.undo('g1'); // 退掉刀 3

    const seq = store.append('g1', { type: 'WOLVES_ACTED', target: 4 } as GameEvent, NOW); // 改刀 4
    expect(seq).toBe(3);
    expect(store.redoCount('g1')).toBe(0); // redo 分支已清
    expect(replay(store.loadEnvelopes('g1')).night.wolfTarget).toBe(4);
  });

  it('undo toSeq 批次回退；建局事件不可撤銷', () => {
    const store = newStore();
    store.createGame('g1', 'test', JSON.stringify(config), NOW);
    store.append('g1', { type: 'GAME_CREATED', config }, NOW);
    store.append('g1', { type: 'NIGHT_STARTED' }, NOW);
    store.append('g1', { type: 'WOLVES_ACTED', target: 3 } as GameEvent, NOW);
    store.append('g1', { type: 'WITCH_ACTED', save: false, poison: null } as GameEvent, NOW);

    expect(store.undo('g1', 2)).toBe(1); // 回到只剩建局
    expect(store.redoCount('g1')).toBe(3);
    expect(() => store.undo('g1', 1)).toThrow(/建局/);
    expect(() => store.undo('g1')).toThrow(/建局/);
  });
});
