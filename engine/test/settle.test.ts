import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src';
import { run, makeConfig, night, dead, WOLFKING12, STANDARD12 } from './helpers';

// 狼王守衛板：1預 2女 3獵 4守 5-8民 9-11狼 12黑狼王
const cfg = (rules = {}) => makeConfig(WOLFKING12, rules);

describe('天亮結算真值表（守×救×毒）', () => {
  it('被刀無守無救 → 死', () => {
    const s = run(cfg(), [...night({ guard: null, wolf: 5, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([5]);
    expect(s.players[4]!.death?.cause).toBe('wolf');
  });

  it('被刀被守 → 平安夜', () => {
    const s = run(cfg(), [...night({ guard: 5, wolf: 5, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([]);
  });

  it('被刀被救 → 平安夜，解藥消耗', () => {
    const s = run(cfg(), [...night({ guard: null, wolf: 5, save: true, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([]);
    expect(s.potions.antidote).toBe(false);
  });

  it('同守同救（奶穿開）→ 死', () => {
    const s = run(cfg(), [...night({ guard: 5, wolf: 5, save: true, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([5]);
    expect(s.players[4]!.death?.cause).toBe('guardSaveConflict');
  });

  it('同守同救（奶穿關）→ 活', () => {
    const s = run(cfg({ guardSaveConflictDies: false }), [...night({ guard: 5, wolf: 5, save: true, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([]);
  });

  it('被毒 → 死，守衛擋不住毒', () => {
    const s = run(cfg(), [...night({ guard: 6, wolf: null, poison: 6, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([6]);
    expect(s.players[5]!.death?.poisoned).toBe(true);
  });

  it('刀毒同一人 → 死且標記中毒（死因保留刀）', () => {
    const s = run(cfg(), [...night({ guard: null, wolf: 3, poison: 3, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    // 3 號是獵人：被毒不能開槍 → 佇列只有遺言（首日）
    expect(dead(s)).toEqual([3]);
    expect(s.players[2]!.death?.poisoned).toBe(true);
    expect(s.actionQueue.every((a) => a.kind !== 'shoot')).toBe(true);
  });

  it('刀A毒B → 雙死', () => {
    const s = run(cfg(), [...night({ guard: null, wolf: 5, poison: 6, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([5, 6]);
  });

  it('空刀空守不用藥 → 平安夜', () => {
    const s = run(cfg(), [...night({ guard: null, wolf: null, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([]);
  });
});

describe('夜晚行動驗證', () => {
  // 空投票 = 全員棄票 → 平安日，讓劇本快速走完白天
  const skipDay: GameEvent[] = [{ type: 'EXILE_VOTED', ballots: [] }];

  it('守衛不能連守同一人', () => {
    const events: GameEvent[] = [
      ...night({ guard: 5, wolf: null, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      ...skipDay,
      { type: 'DAY_ENDED' },
      { type: 'GUARD_ACTED', target: 5 },
    ];
    expect(() => run(cfg(), events)).toThrow(/連續兩晚/);
  });

  it('女巫一晚只能用一瓶藥', () => {
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'GUARD_ACTED', target: null },
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: true, poison: 6 },
    ];
    expect(() => run(cfg(), events)).toThrow(/一瓶藥/);
  });

  it('解藥用完不能再救', () => {
    const events: GameEvent[] = [
      ...night({ guard: null, wolf: 5, save: true, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      ...skipDay,
      { type: 'DAY_ENDED' },
      { type: 'GUARD_ACTED', target: null },
      { type: 'WOLVES_ACTED', target: 6 },
      { type: 'WITCH_ACTED', save: true, poison: null },
    ];
    expect(() => run(cfg(), events)).toThrow(/解藥已經用完/);
  });

  it('女巫自救：firstNightOnly 首夜可、次夜不可', () => {
    // 首夜自救（女巫=2號被刀）
    const s = run(cfg(), [...night({ guard: null, wolf: 2, save: true, seer: 9 }), { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([]);

    // 次夜自救 → 拒絕（先讓首夜正常度過、不用解藥）
    const events: GameEvent[] = [
      ...night({ guard: null, wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      ...skipDay,
      { type: 'DAY_ENDED' },
      { type: 'GUARD_ACTED', target: null },
      { type: 'WOLVES_ACTED', target: 2 },
      { type: 'WITCH_ACTED', save: true, poison: null },
    ];
    expect(() => run(cfg(), events)).toThrow(/首夜/);
  });

  it('女巫自救：never 首夜也不可', () => {
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'GUARD_ACTED', target: null },
      { type: 'WOLVES_ACTED', target: 2 },
      { type: 'WITCH_ACTED', save: true, poison: null },
    ];
    expect(() => run(cfg({ witchSelfSave: 'never' }), events)).toThrow(/不能自救/);
  });

  it('狼人空刀時女巫不能用解藥', () => {
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'GUARD_ACTED', target: null },
      { type: 'WOLVES_ACTED', target: null },
      { type: 'WITCH_ACTED', save: true, poison: null },
    ];
    expect(() => run(cfg(), events)).toThrow(/空刀/);
  });

  it('夜晚事件必須依步驟順序', () => {
    const events: GameEvent[] = [{ type: 'NIGHT_STARTED' }, { type: 'WOLVES_ACTED', target: 5 }];
    expect(() => run(cfg(), events)).toThrow(/守衛/); // 狼王守衛板首步是守衛
  });

  it('預言家查驗結果正確記錄', () => {
    const s = run(makeConfig(STANDARD12), [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 9 },
    ]);
    expect(s.seerChecks).toEqual([{ night: 1, target: 9, result: 'wolf' }]);
  });
});
