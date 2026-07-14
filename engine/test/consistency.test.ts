import { describe, expect, it } from 'vitest';
import type { EventEnvelope, GameEvent, GameState } from '../src';
import { initialState, reduce, replay } from '../src';
import { makeConfig, ballots, toEnvelopes, AT, WOLFKING12 } from './helpers';

/**
 * undo 一致性的核心保證：
 * 任意截斷點的全量 replay ≡ 逐事件增量 reduce。
 * undo = 截掉尾端事件後重播，所以這條性質成立就代表 undo 永遠一致。
 */
function assertReplayConsistency(envelopes: EventEnvelope[]): void {
  let incremental: GameState | null = null;
  for (let i = 0; i < envelopes.length; i++) {
    const env = envelopes[i]!;
    incremental =
      i === 0
        ? initialState((env.event as { type: 'GAME_CREATED'; config: never }).config, env.seq, env.at)
        : reduce(incremental!, env);
    const replayed = replay(envelopes.slice(0, i + 1));
    expect(replayed).toEqual(incremental);
  }
}

describe('回放一致性（undo 的基礎）', () => {
  it('含警長競選、投票、技能連鎖的完整劇本：每個截斷點增量 ≡ 全量', () => {
    const config = makeConfig(WOLFKING12, { sheriffEnabled: true });
    const events: GameEvent[] = [
      // 夜1：守2 刀5 查9
      { type: 'NIGHT_STARTED' },
      { type: 'GUARD_ACTED', target: 2 },
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 9 },
      { type: 'NIGHT_ENDED' },
      // 警長競選
      { type: 'SHERIFF_NOMINATED', candidates: [1, 9, 10] },
      { type: 'SHERIFF_WITHDRAWN', seat: 10 },
      { type: 'SHERIFF_VOTED', ballots: ballots([2, 1], [3, 1], [4, 9], [10, 9], [6, 1]) },
      // 公佈死訊 + 遺言
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      { type: 'NOTE_ADDED', text: '5 號遺言聲稱平民' },
      // 放逐 9 號狼
      { type: 'EXILE_VOTED', ballots: ballots([1, 9], [2, 9], [3, 9], [4, 9], [6, 9], [10, 12], [11, 12]) },
      { type: 'LAST_WORDS_DONE', seat: 9 },
      { type: 'DAY_ENDED' },
      // 夜2：守6 刀3獵人 毒不用 查10
      { type: 'GUARD_ACTED', target: 6 },
      { type: 'WOLVES_ACTED', target: 3 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      // 獵人開槍帶 10 號狼
      { type: 'SHOT_FIRED', shooter: 3, target: 10 },
      { type: 'EXILE_VOTED', ballots: ballots([1, 11], [2, 11], [4, 11], [6, 11]) },
      { type: 'LAST_WORDS_DONE', seat: 11 },
    ];
    assertReplayConsistency(toEnvelopes(config, events));
  });

  it('reduce 不改動輸入 state（純函式）', () => {
    const config = makeConfig(WOLFKING12);
    const s0 = initialState(config, 1, AT);
    const frozen = structuredClone(s0);
    reduce(s0, { seq: 2, at: AT, event: { type: 'NIGHT_STARTED' } });
    expect(s0).toEqual(frozen);
  });

  it('replay 需以 GAME_CREATED 開頭', () => {
    expect(() => replay([{ seq: 1, at: AT, event: { type: 'NIGHT_STARTED' } }])).toThrow(/GAME_CREATED/);
  });
});
