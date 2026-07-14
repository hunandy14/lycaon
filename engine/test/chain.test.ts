import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src';
import { run, makeConfig, night, ballots, dead, WOLFKING12, WHITEWOLF12, STANDARD12 } from './helpers';

const wolfKing = (rules = {}) => makeConfig(WOLFKING12, rules); // 3獵 4守 12黑狼王
const whiteWolf = (rules = {}) => makeConfig(WHITEWOLF12, rules); // 3白癡 4騎士 12白狼王

/** 首夜平安（狼王守衛板：有守衛步驟） */
const quietNight1: GameEvent[] = [
  ...night({ guard: null, wolf: null, seer: 9 }),
  { type: 'DEATHS_ANNOUNCED' },
];

/** 首夜平安（白狼王騎士板：無守衛步驟） */
const quietNight1NoGuard: GameEvent[] = [
  ...night({ wolf: null, seer: 9 }),
  { type: 'DEATHS_ANNOUNCED' },
];

describe('出局技能連鎖', () => {
  it('佇列 FIFO 嚴格消化：輪到開槍時不能先做別的', () => {
    expect(() =>
      run(wolfKing(), [
        ...quietNight1,
        { type: 'EXILE_VOTED', ballots: ballots([1, 3], [2, 3], [4, 3], [5, 3], [9, 3], [10, 3]) },
        { type: 'BADGE_TRANSFERRED', to: null }, // 佇列頭是獵人開槍，不是警徽
      ]),
    ).toThrow(/待辦/);
  });

  it('獵人被票 → 槍帶黑狼王 → 黑狼王槍帶民（二層連鎖，佇列順序：槍→遺言→連鎖槍→連鎖遺言）', () => {
    const s = run(wolfKing(), [
      ...quietNight1,
      { type: 'EXILE_VOTED', ballots: ballots([1, 3], [2, 3], [4, 3], [5, 3], [9, 3], [10, 3]) },
      { type: 'SHOT_FIRED', shooter: 3, target: 12 }, // 獵人翻牌帶走黑狼王
      { type: 'LAST_WORDS_DONE', seat: 3 }, // 獵人遺言（被票死）
      { type: 'SHOT_FIRED', shooter: 12, target: 5 }, // 黑狼王發動技能帶走 5 號平民
      { type: 'LAST_WORDS_DONE', seat: 12 }, // 首日被槍帶走有遺言
      { type: 'LAST_WORDS_DONE', seat: 5 },
    ]);
    expect(dead(s).sort((a, b) => a - b)).toEqual([3, 5, 12]);
    expect(s.winner).toBeNull();
    expect(s.actionQueue).toEqual([]);
    expect(s.phase).toEqual({ t: 'day', stage: 'dayEnd' });
  });

  it('被毒的獵人不能開槍（佇列無 shoot 項）', () => {
    const s = run(wolfKing(), [
      ...night({ guard: null, wolf: null, poison: 3, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(dead(s)).toEqual([3]);
    expect(s.actionQueue.filter((a) => a.kind === 'shoot')).toEqual([]);
    // 嘗試開槍 → 被拒
    expect(() =>
      run(wolfKing(), [
        ...night({ guard: null, wolf: null, poison: 3, seer: 9 }),
        { type: 'DEATHS_ANNOUNCED' },
        { type: 'SHOT_FIRED', shooter: 3, target: 9 },
      ]),
    ).toThrow();
  });

  it('被刀的獵人可以開槍', () => {
    const s = run(wolfKing(), [
      ...night({ guard: null, wolf: 3, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'SHOT_FIRED', shooter: 3, target: 9 },
    ]);
    expect(dead(s).sort((a, b) => a - b)).toEqual([3, 9]);
  });

  it('獵人放棄開槍', () => {
    const s = run(wolfKing(), [
      ...night({ guard: null, wolf: 3, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'SHOT_FIRED', shooter: 3, target: null },
    ]);
    expect(dead(s)).toEqual([3]);
  });

  it('黑狼王被票可以開槍；帶走最後的神 → 狼人屠邊獲勝', () => {
    // 先毒死獵人（首夜），再讓黑狼王被票、帶走守衛？神=1預2女3獵4守
    // 夜1：毒3獵人；白天票12黑狼王；黑狼王帶2女巫 → 神還剩1預4守 → 未分勝負
    const s = run(wolfKing(), [
      ...night({ guard: null, wolf: null, poison: 3, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 3 }, // 被毒獵人：只有遺言、沒有槍
      { type: 'EXILE_VOTED', ballots: ballots([1, 12], [2, 12], [4, 12], [5, 12], [6, 12], [9, 12]) },
      { type: 'SHOT_FIRED', shooter: 12, target: 2 },
      { type: 'LAST_WORDS_DONE', seat: 12 },
    ]);
    expect(dead(s).sort((a, b) => a - b)).toEqual([2, 3, 12]);
    expect(s.winner).toBeNull();
  });

  it('勝利即時判定：獵人槍帶最後一狼 → 好人勝、剩餘佇列作廢', () => {
    // 自訂小板：1獵 2預 3民 4狼（要有第二個神，獵人死時才不會先觸發屠邊）
    const cfg = makeConfig(['hunter', 'seer', 'villager', 'werewolf']);
    const s = run(cfg, [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 1 },
      { type: 'SEER_ACTED', target: 4 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'SHOT_FIRED', shooter: 1, target: 4 },
    ]);
    expect(s.winner?.faction).toBe('good');
    expect(s.phase.t).toBe('ended');
    expect(s.actionQueue).toEqual([]); // 遺言等待辦已作廢
  });

  it('屠邊達成瞬間終局：夜刀最後的神 → 狼勝，獵人（神）帶槍作廢？——獵人是神，死亡即觸發屠邊', () => {
    // 1獵(唯一神) 2民 3狼 4狼：夜裡刀獵人 → 神全滅 → 狼勝，獵人不開槍
    const cfg = makeConfig(['hunter', 'villager', 'werewolf', 'werewolf']);
    const s = run(cfg, [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 1 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(s.winner?.faction).toBe('wolf');
    expect(s.actionQueue).toEqual([]); // 屠邊成立即結束，獵人的槍作廢
  });
});

describe('白癡', () => {
  it('被票翻牌免死、失去投票權', () => {
    const s = run(makeConfig(STANDARD12), [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: null },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 9 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: ballots([1, 4], [2, 4], [9, 4], [10, 4]) },
    ]);
    const idiot = s.players[3]!;
    expect(idiot.alive).toBe(true);
    expect(idiot.idiotRevealed).toBe(true);
    expect(idiot.canVote).toBe(false);
    expect(s.phase).toEqual({ t: 'day', stage: 'dayEnd' });
    // 翻牌白癡再投票 → 被拒
    expect(() =>
      run(makeConfig(STANDARD12), [
        { type: 'NIGHT_STARTED' },
        { type: 'WOLVES_ACTED', target: null },
        { type: 'WITCH_ACTED', save: false, poison: null },
        { type: 'SEER_ACTED', target: 9 },
        { type: 'NIGHT_ENDED' },
        { type: 'DEATHS_ANNOUNCED' },
        { type: 'EXILE_VOTED', ballots: ballots([1, 4], [2, 4], [9, 4], [10, 4]) },
        { type: 'DAY_ENDED' },
        { type: 'WOLVES_ACTED', target: null },
        { type: 'WITCH_ACTED', save: false, poison: null },
        { type: 'SEER_ACTED', target: 10 },
        { type: 'NIGHT_ENDED' },
        { type: 'DEATHS_ANNOUNCED' },
        { type: 'EXILE_VOTED', ballots: ballots([4, 9]) },
      ]),
    ).toThrow(/投票資格/);
  });

  it('翻牌白癡再被票 → 出局（idiotExiledAgainDies）', () => {
    const s = run(makeConfig(STANDARD12), [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: null },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 9 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: ballots([1, 4], [2, 4], [9, 4], [10, 4]) }, // 翻牌
      { type: 'DAY_ENDED' },
      { type: 'WOLVES_ACTED', target: null },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: ballots([1, 4], [2, 4], [9, 4]) }, // 再票 → 死
      { type: 'LAST_WORDS_DONE', seat: 4 },
    ]);
    expect(s.players[3]!.alive).toBe(false);
  });

  it('白癡被刀照樣死', () => {
    const s = run(makeConfig(STANDARD12), [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 4 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 9 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(s.players[3]!.alive).toBe(false);
    expect(s.players[3]!.idiotRevealed).toBe(false);
  });
});

describe('騎士決鬥', () => {
  it('決鬥中狼 → 狼死、直接入夜（跳過投票）', () => {
    const s = run(whiteWolf(), [
      ...quietNight1NoGuard,
      { type: 'KNIGHT_DUELED', knight: 4, target: 9 },
    ]);
    expect(s.players[8]!.alive).toBe(false);
    expect(s.players[8]!.death?.cause).toBe('duel');
    expect(s.phase).toEqual({ t: 'day', stage: 'dayEnd' });
    expect(s.dayInterrupted).toBe(true);
    // 投票被拒
    expect(() =>
      run(whiteWolf(), [...quietNight1NoGuard, { type: 'KNIGHT_DUELED', knight: 4, target: 9 }, { type: 'EXILE_VOTED', ballots: [] }]),
    ).toThrow();
  });

  it('決鬥好人 → 騎士死、白天繼續（可以投票）', () => {
    const s = run(whiteWolf(), [
      ...quietNight1NoGuard,
      { type: 'KNIGHT_DUELED', knight: 4, target: 5 },
      { type: 'LAST_WORDS_DONE', seat: 4 },
      { type: 'EXILE_VOTED', ballots: ballots([1, 9], [2, 9], [5, 9], [6, 9]) },
      { type: 'LAST_WORDS_DONE', seat: 9 },
    ]);
    expect(s.players[3]!.alive).toBe(false); // 騎士殉職
    expect(s.players[4]!.alive).toBe(true); // 5 號沒事
    expect(s.players[8]!.alive).toBe(false); // 9 號被票
  });

  it('騎士技能只能用一次', () => {
    expect(() =>
      run(whiteWolf(), [
        ...quietNight1NoGuard,
        { type: 'KNIGHT_DUELED', knight: 4, target: 5 }, // 失敗，騎士死 → skillUsed 也標了
        { type: 'LAST_WORDS_DONE', seat: 4 },
        { type: 'KNIGHT_DUELED', knight: 4, target: 9 },
      ]),
    ).toThrow(); // 騎士已死亡
  });
});

describe('自爆', () => {
  it('普通狼自爆 → 直接入夜、無遺言', () => {
    const s = run(whiteWolf(), [...quietNight1NoGuard, { type: 'WOLF_EXPLODED', seat: 9 }]);
    expect(s.players[8]!.alive).toBe(false);
    expect(s.actionQueue).toEqual([]);
    expect(s.phase).toEqual({ t: 'day', stage: 'dayEnd' });
  });

  it('白狼王自爆 → 可帶走一人', () => {
    const s = run(whiteWolf(), [
      ...quietNight1NoGuard,
      { type: 'WOLF_EXPLODED', seat: 12 },
      { type: 'SHOT_FIRED', shooter: 12, target: 4 }, // 帶走騎士
    ]);
    expect(s.players[11]!.alive).toBe(false);
    expect(s.players[3]!.alive).toBe(false);
    expect(s.players[3]!.death?.cause).toBe('shot');
    expect(s.phase).toEqual({ t: 'day', stage: 'dayEnd' });
  });

  it('白狼王被票 → 不能帶人（無 shoot 待辦）', () => {
    const s = run(whiteWolf(), [
      ...quietNight1NoGuard,
      { type: 'EXILE_VOTED', ballots: ballots([1, 12], [2, 12], [4, 12], [5, 12], [6, 12], [9, 12]) },
    ]);
    expect(s.players[11]!.alive).toBe(false);
    expect(s.actionQueue.filter((a) => a.kind === 'shoot')).toEqual([]);
  });

  it('黑狼王自爆 → 不能開槍', () => {
    const s = run(wolfKing(), [...quietNight1, { type: 'WOLF_EXPLODED', seat: 12 }]);
    expect(s.players[11]!.alive).toBe(false);
    expect(s.actionQueue).toEqual([]);
  });

  it('白狼王自爆帶走獵人 → 獵人可以開槍（跨技能連鎖）', () => {
    // 自訂板：1獵 2預 3民 4狼 5白狼王（要有第二個神，獵人死時才不會先觸發屠邊）
    const cfg = makeConfig(['hunter', 'seer', 'villager', 'werewolf', 'whiteWolfKing']);
    const s = run(cfg, [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: null },
      { type: 'SEER_ACTED', target: 4 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'WOLF_EXPLODED', seat: 5 },
      { type: 'SHOT_FIRED', shooter: 5, target: 1 }, // 白狼王帶走獵人
      { type: 'SHOT_FIRED', shooter: 1, target: 4 }, // 獵人反槍最後一狼 → 好人勝
    ]);
    expect(s.winner?.faction).toBe('good');
    expect(s.phase.t).toBe('ended');
  });
});
