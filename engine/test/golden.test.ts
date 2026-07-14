import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src';
import { run, makeConfig, ballots, alive, dead, STANDARD12, WOLFKING12, WHITEWOLF12 } from './helpers';

/**
 * Golden replay：三個板子各跑一場完整對局，斷言終局狀態。
 * 任何 reducer 邏輯改動若影響既有行為，這裡會先亮紅燈。
 */

describe('golden：預女獵白 12 人標準局（警長局）', () => {
  it('三夜三天完整對局 → 好人屠邊勝', () => {
    const events: GameEvent[] = [
      // 夜1：刀5、女巫救、查9狼 → 平安夜
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: true, poison: null },
      { type: 'SEER_ACTED', target: 9 },
      { type: 'NIGHT_ENDED' },
      // 警長競選：1 vs 9 平票 → PK → 1 當選
      { type: 'SHERIFF_NOMINATED', candidates: [1, 9] },
      { type: 'SHERIFF_VOTED', ballots: ballots([2, 1], [3, 1], [4, 1], [5, 1], [6, 9], [10, 9], [11, 9], [12, 9]) },
      { type: 'SHERIFF_VOTED', ballots: ballots([2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [10, 9], [11, 9], [12, 9]) },
      { type: 'DEATHS_ANNOUNCED' }, // 平安夜
      // 白天1：預言家帶隊放逐 9 狼
      { type: 'EXILE_VOTED', ballots: ballots([1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [10, 1], [11, 1], [12, 1]) },
      { type: 'LAST_WORDS_DONE', seat: 9 },
      { type: 'DAY_ENDED' },
      // 夜2：刀1（警長預言家，當晚仍可查驗）、毒10
      { type: 'WOLVES_ACTED', target: 1 },
      { type: 'WITCH_ACTED', save: false, poison: 10 },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' }, // 1、10 雙死；警長死 → 警徽流
      { type: 'BADGE_TRANSFERRED', to: 2 },
      // 白天2：放逐 11 狼（2 號警長 1.5 票）
      { type: 'EXILE_VOTED', ballots: ballots([2, 11], [3, 11], [4, 11], [5, 11], [6, 11], [11, 3], [12, 3]) },
      { type: 'LAST_WORDS_DONE', seat: 11 },
      { type: 'DAY_ENDED' },
      // 夜3：刀3獵人（預言家已死，查驗步驟自動跳過）
      { type: 'WOLVES_ACTED', target: 3 },
      { type: 'WITCH_ACTED', save: false, poison: null }, // 沒藥了，走過場
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      // 獵人開槍帶走最後一狼 → 好人勝
      { type: 'SHOT_FIRED', shooter: 3, target: 12 },
    ];
    const s = run(makeConfig(STANDARD12, { sheriffEnabled: true }), events);

    expect(s.winner?.faction).toBe('good');
    expect(s.phase.t).toBe('ended');
    expect(dead(s)).toEqual([1, 3, 9, 10, 11, 12]);
    expect(alive(s)).toEqual([2, 4, 5, 6, 7, 8]);
    expect(s.sheriff).toBe(2);
    expect(s.potions).toEqual({ antidote: false, poison: false });
    expect(s.seerChecks).toEqual([
      { night: 1, target: 9, result: 'wolf' },
      { night: 2, target: 10, result: 'wolf' },
    ]);
    expect(s.actionQueue).toEqual([]);
    expect(s.day).toBe(3);
  });
});

describe('golden：狼王守衛 12 人局', () => {
  it('守衛救人、黑狼王被票帶獵人、獵人反槍、毒殺收尾 → 好人勝', () => {
    const events: GameEvent[] = [
      // 夜1：守5 刀5 → 守住平安；查12狼
      { type: 'NIGHT_STARTED' },
      { type: 'GUARD_ACTED', target: 5 },
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 12 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' }, // 平安夜（無警長局）
      // 白天1：放逐 12 黑狼王 → 帶走 3 獵人 → 獵人反槍 9 狼（二層連鎖）
      { type: 'EXILE_VOTED', ballots: ballots([1, 12], [2, 12], [3, 12], [4, 12], [5, 12], [6, 12], [7, 12], [8, 12], [9, 1], [10, 1], [11, 1]) },
      { type: 'SHOT_FIRED', shooter: 12, target: 3 },
      { type: 'LAST_WORDS_DONE', seat: 12 },
      { type: 'SHOT_FIRED', shooter: 3, target: 9 },
      { type: 'LAST_WORDS_DONE', seat: 3 },
      { type: 'LAST_WORDS_DONE', seat: 9 },
      { type: 'DAY_ENDED' },
      // 夜2：守6（不能連守5）、刀4守衛、女巫救 → 平安
      { type: 'GUARD_ACTED', target: 6 },
      { type: 'WOLVES_ACTED', target: 4 },
      { type: 'WITCH_ACTED', save: true, poison: null },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      // 白天2：放逐 10 狼
      { type: 'EXILE_VOTED', ballots: ballots([1, 10], [2, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [10, 1], [11, 1]) },
      { type: 'LAST_WORDS_DONE', seat: 10 },
      { type: 'DAY_ENDED' },
      // 夜3：守7、刀2女巫、女巫臨死毒11（最後一狼）
      { type: 'GUARD_ACTED', target: 7 },
      { type: 'WOLVES_ACTED', target: 2 },
      { type: 'WITCH_ACTED', save: false, poison: 11 },
      { type: 'SEER_ACTED', target: 11 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' }, // 2 被刀、11 被毒 → 狼全滅
    ];
    const s = run(makeConfig(WOLFKING12), events);

    expect(s.winner?.faction).toBe('good');
    expect(dead(s)).toEqual([2, 3, 9, 10, 11, 12]);
    expect(alive(s)).toEqual([1, 4, 5, 6, 7, 8]);
    expect(s.potions).toEqual({ antidote: false, poison: false });
    expect(s.day).toBe(3);
  });
});

describe('golden：白狼王騎士 12 人局（警長局）', () => {
  it('狼上警當選、騎士翻狼、白狼王自爆帶預言家、屠神 → 狼人勝', () => {
    const events: GameEvent[] = [
      // 夜1：刀8、查5好人
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 8 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 5 },
      { type: 'NIGHT_ENDED' },
      // 警長競選：9 狼當選（8 號昨夜死者照常投票）
      { type: 'SHERIFF_NOMINATED', candidates: [4, 9] },
      { type: 'SHERIFF_VOTED', ballots: ballots([1, 4], [2, 4], [3, 4], [5, 4], [6, 9], [7, 9], [8, 9], [10, 9], [11, 9], [12, 9]) },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 8 },
      // 白天1：騎士翻牌決鬥 10 狼 → 成功，直接入夜
      { type: 'KNIGHT_DUELED', knight: 4, target: 10 },
      { type: 'LAST_WORDS_DONE', seat: 10 },
      { type: 'DAY_ENDED' },
      // 夜2：刀4騎士
      { type: 'WOLVES_ACTED', target: 4 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 9 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      // 白天2：放逐 11 狼（9 號狼警長 1.5 票拉不回）
      { type: 'EXILE_VOTED', ballots: ballots([1, 11], [2, 11], [3, 11], [5, 11], [6, 11], [7, 11], [9, 1], [11, 1], [12, 1]) },
      { type: 'LAST_WORDS_DONE', seat: 11 },
      { type: 'DAY_ENDED' },
      // 夜3：刀2女巫
      { type: 'WOLVES_ACTED', target: 2 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 12 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      // 白天3：白狼王自爆帶走預言家
      { type: 'WOLF_EXPLODED', seat: 12 },
      { type: 'SHOT_FIRED', shooter: 12, target: 1 },
      { type: 'DAY_ENDED' },
      // 夜4：刀3白癡（最後一個神）→ 屠邊
      { type: 'WOLVES_ACTED', target: 3 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ];
    const s = run(makeConfig(WHITEWOLF12, { sheriffEnabled: true }), events);

    expect(s.winner?.faction).toBe('wolf');
    expect(s.winner?.reason).toContain('神職');
    expect(dead(s)).toEqual([1, 2, 3, 4, 8, 10, 11, 12]);
    expect(alive(s)).toEqual([5, 6, 7, 9]);
    expect(s.sheriff).toBe(9); // 狼警長活到終局
    expect(s.day).toBe(4);
    // 白癡被刀身亡，從未翻牌
    expect(s.players[2]!.idiotRevealed).toBe(false);
  });
});
