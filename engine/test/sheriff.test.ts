import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src';
import { run, makeConfig, ballots, WOLFKING12 } from './helpers';

const cfg = (rules = {}) => makeConfig(WOLFKING12, { sheriffEnabled: true, ...rules });

/** 首夜刀 5 號，天亮進入警長競選 */
const nightKill5: GameEvent[] = [
  { type: 'NIGHT_STARTED' },
  { type: 'GUARD_ACTED', target: null },
  { type: 'WOLVES_ACTED', target: 5 },
  { type: 'WITCH_ACTED', save: false, poison: null },
  { type: 'SEER_ACTED', target: 9 },
  { type: 'NIGHT_ENDED' },
];

describe('警長競選（首日，先於死訊公佈）', () => {
  it('天亮先進入競選階段；死訊要等競選結束才公佈', () => {
    const s = run(cfg(), nightKill5);
    expect(s.phase).toEqual({ t: 'day', stage: 'sheriff' });
    expect(s.pendingDeaths).toEqual([{ seat: 5, cause: 'wolf', poisoned: false }]);
    expect(s.players[4]!.alive).toBe(true); // 死訊未公佈前 5 號仍「在場」
    // 競選中不能公佈死訊
    expect(() => run(cfg(), [...nightKill5, { type: 'DEATHS_ANNOUNCED' }])).toThrow(/不是公佈死訊的時機/);
  });

  it('昨夜死者可以上警、可以投票；當選後公佈死訊 → 立即警徽流', () => {
    const s = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [1, 5, 9] },
      // 警下投票：5 號死者的競選對手退水，其餘投 5
      { type: 'SHERIFF_VOTED', ballots: ballots([2, 5], [3, 5], [4, 5], [6, 5], [10, 1], [11, 1]) },
    ]);
    expect(s.sheriff).toBe(5);
    const s2 = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [1, 5, 9] },
      { type: 'SHERIFF_VOTED', ballots: ballots([2, 5], [3, 5], [4, 5], [6, 5], [10, 1], [11, 1]) },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    // 5 號當選後死亡公佈 → 佇列頭是警徽移交
    expect(s2.players[4]!.alive).toBe(false);
    expect(s2.actionQueue[0]).toEqual({ kind: 'badge' });
    const s3 = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [1, 5, 9] },
      { type: 'SHERIFF_VOTED', ballots: ballots([2, 5], [3, 5], [4, 5], [6, 5], [10, 1], [11, 1]) },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'BADGE_TRANSFERRED', to: 1 },
      { type: 'LAST_WORDS_DONE', seat: 5 },
    ]);
    expect(s3.sheriff).toBe(1);
  });

  it('上警未退水者不能投票；退水者可以投票', () => {
    expect(() =>
      run(cfg(), [
        ...nightKill5,
        { type: 'SHERIFF_NOMINATED', candidates: [1, 2] },
        { type: 'SHERIFF_VOTED', ballots: ballots([1, 2]) }, // 1 號還在警上
      ]),
    ).toThrow(/投票資格/);

    const s = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [1, 2, 3] },
      { type: 'SHERIFF_WITHDRAWN', seat: 3 },
      { type: 'SHERIFF_VOTED', ballots: ballots([3, 2], [4, 2], [6, 2]) }, // 退水的 3 號可投
    ]);
    expect(s.sheriff).toBe(2);
  });

  it('平票 → PK → 再平 → 無警長', () => {
    const s = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [1, 2] },
      { type: 'SHERIFF_VOTED', ballots: ballots([3, 1], [4, 2]) }, // 1:1 平票
    ]);
    expect(s.election?.pkSeats).toEqual([1, 2]);
    expect(s.phase).toEqual({ t: 'day', stage: 'sheriff' });

    const s2 = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [1, 2] },
      { type: 'SHERIFF_VOTED', ballots: ballots([3, 1], [4, 2]) },
      { type: 'SHERIFF_VOTED', ballots: ballots([3, 1], [4, 2]) }, // PK 再平
    ]);
    expect(s2.sheriff).toBeNull();
    expect(s2.phase).toEqual({ t: 'day', stage: 'announce' });
  });

  it('僅一人上警 → 直接當選（無需投票）', () => {
    const s = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [7] },
      { type: 'SHERIFF_VOTED', ballots: [] },
    ]);
    expect(s.sheriff).toBe(7);
  });

  it('跳過競選 → 無警長', () => {
    const s = run(cfg(), [...nightKill5, { type: 'SHERIFF_ELECTION_SKIPPED' }]);
    expect(s.sheriff).toBeNull();
    expect(s.phase).toEqual({ t: 'day', stage: 'announce' });
  });

  it('警長放逐投票算 1.5 票', () => {
    // 7 號當警長；放逐投票 7投9(1.5票) vs 10投11、11投10 → 9 被放逐？
    // 9 得 1.5 票、11 得 1 票、10 得 1 票 → 9 最高
    const s = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [7] },
      { type: 'SHERIFF_VOTED', ballots: [] },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      { type: 'EXILE_VOTED', ballots: ballots([7, 9], [10, 11], [11, 10]) },
    ]);
    expect(s.players[8]!.alive).toBe(false);
    expect(s.players[8]!.death?.cause).toBe('exile');
  });

  it('警長競選中自爆 → 競選中止、無警長、公佈死訊後直接天黑', () => {
    const s = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [1, 9] },
      { type: 'WOLF_EXPLODED', seat: 9 },
    ]);
    expect(s.sheriff).toBeNull();
    expect(s.election?.done).toBe(true);
    expect(s.players[8]!.alive).toBe(false);
    expect(s.phase).toEqual({ t: 'day', stage: 'announce' });
    expect(s.dayInterrupted).toBe(true);

    const s2 = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_NOMINATED', candidates: [1, 9] },
      { type: 'WOLF_EXPLODED', seat: 9 },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    // 中斷日：公佈死訊後直接 dayEnd（跳過發言與投票），遺言照走
    expect(s2.actionQueue).toEqual([{ kind: 'lastWords', seat: 5 }]);
    expect(s2.phase).toEqual({ t: 'day', stage: 'dayEnd' });
  });

  it('非首日天亮直接進入公佈死訊（不再競選）', () => {
    const s = run(cfg(), [
      ...nightKill5,
      { type: 'SHERIFF_ELECTION_SKIPPED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      { type: 'EXILE_VOTED', ballots: [] },
      { type: 'DAY_ENDED' },
      { type: 'GUARD_ACTED', target: 1 },
      { type: 'WOLVES_ACTED', target: null },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
    ]);
    expect(s.phase).toEqual({ t: 'day', stage: 'announce' });
  });

  it('sheriffEnabled=false 時首日也直接公佈', () => {
    const s = run(makeConfig(WOLFKING12), nightKill5);
    expect(s.phase).toEqual({ t: 'day', stage: 'announce' });
  });
});
