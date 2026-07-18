import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '../src';
import { buildGameReport, buildSpectatorView, DEFAULT_SHARE, replay } from '../src';
import { makeConfig, toEnvelopes, ballots, night, nextNight, run, STANDARD12 } from './helpers';

const SETTINGS = { ...DEFAULT_SHARE, enabled: true };

/** 標準局打到第 1 天白天（5 號夜死已公佈、9 號被放逐） */
function midGame(): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [
    ...night({ wolf: 5, seer: 9 }),
    { type: 'DEATHS_ANNOUNCED' },
    { type: 'LAST_WORDS_DONE', seat: 5 },
    {
      type: 'EXILE_VOTED',
      ballots: ballots([1, 9], [2, 9], [3, 9], [4, 9], [6, 9], [7, 9], [8, null], [9, 1], [10, 1], [11, 1], [12, 1]),
    },
    { type: 'LAST_WORDS_DONE', seat: 9 },
  ];
  return { state: run(makeConfig([...STANDARD12]), events), events };
}

/** 打到第 2 天白天（day1 放逐 9、night2 刀 6、day2 放逐 10） */
function twoDayGame(): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [
    ...night({ wolf: 5, seer: 9 }),
    { type: 'DEATHS_ANNOUNCED' },
    { type: 'LAST_WORDS_DONE', seat: 5 },
    { type: 'EXILE_VOTED', ballots: ballots([1, 9], [2, 9], [3, 9], [4, 9], [6, 9], [7, 9], [8, null], [10, null], [11, null], [12, null]) },
    { type: 'LAST_WORDS_DONE', seat: 9 },
    ...nextNight({ wolf: 6, seer: 10 }),
    { type: 'DEATHS_ANNOUNCED' }, // 第 2 天夜死（6 號）依 firstDayOnly 無遺言
    { type: 'EXILE_VOTED', ballots: ballots([1, 10], [2, 10], [3, 10], [4, 10], [7, 10], [8, null], [11, null], [12, null]) },
  ];
  return { state: run(makeConfig([...STANDARD12]), events), events };
}

const withReport = (state: GameState, events: GameEvent[], settings = SETTINGS) =>
  buildSpectatorView(state, settings, buildGameReport(toEnvelopes(makeConfig([...STANDARD12]), events)));

describe('buildSpectatorView（統一視角）', () => {
  it('身分全隱藏、無 god 欄位、公開時間軸不含夜晚祕密、序列化不洩角色', () => {
    const { state } = midGame();
    const v = buildSpectatorView(state, SETTINGS);

    expect('god' in v).toBe(false);
    expect(v.stage).toBe('day');
    for (const p of v.players) {
      expect(p.role).toBeNull();
      expect(p.lover).toBe(false);
      expect(p.converted).toBe(false);
    }
    expect(v.players.find((p) => p.seat === 5)).toMatchObject({ alive: false, deathAt: null, deathCause: null }); // showDeathInfo 預設關
    expect(v.timeline!.every((e) => !e.secret)).toBe(true);
    expect(v.timeline!.some((e) => e.text.includes('查驗'))).toBe(false);
    const json = JSON.stringify(v);
    expect(json).not.toContain('werewolf');
    expect(json).not.toContain('seer');
  });

  it('夜晚 = 夜幕 stage=night', () => {
    const state = run(makeConfig([...STANDARD12]), [{ type: 'NIGHT_STARTED' }]);
    const v = buildSpectatorView(state, SETTINGS);
    expect(v.stage).toBe('night');
    expect(v.day).toBe(1);
    // 尚無死亡
    expect(v.players.every((p) => p.alive)).toBe(true);
  });

  it('開局前 stage=setup', () => {
    const state = run(makeConfig([...STANDARD12]), []);
    expect(buildSpectatorView(state, SETTINGS).stage).toBe('setup');
  });

  it('只報今天：第 2 天看不到第 1 天的投票與事件', () => {
    const { state, events } = twoDayGame();
    const v = withReport(state, events);
    expect(v.day).toBe(2);
    expect(v.stage).toBe('day');
    // 投票只含第 2 天
    expect(v.votes!.length).toBeGreaterThan(0);
    expect(v.votes!.every((r) => r.day === 2)).toBe(true);
    expect(v.votes!.some((r) => r.day === 1)).toBe(false);
    // 時間軸只含第 2 天白天（不含「第 1」、也不含夜晚行——白天板不報「天黑請閉眼」）
    expect(v.timeline!.every((e) => !e.phase.includes('第 1'))).toBe(true);
    expect(v.timeline!.every((e) => !e.phase.includes('夜'))).toBe(true);
    expect(v.timeline!.some((e) => e.text.includes('天黑請閉眼'))).toBe(false);
    // 事件帶時間戳（envelope.at）
    expect(v.timeline!.every((e) => typeof e.at === 'string' && e.at.length > 0)).toBe(true);
    // 但盤面仍是當前存活狀態：第 1 夜死的 5 號、第 1 天放逐的 9 號都還標死（當前結果）
    expect(v.players.find((p) => p.seat === 5)!.alive).toBe(false);
    expect(v.players.find((p) => p.seat === 9)!.alive).toBe(false);
  });

  it('showAllDays 開＝投票與時間軸含之前每一天；夜晚行仍不進白天板', () => {
    const { state, events } = twoDayGame();
    const v = withReport(state, events, { ...SETTINGS, showAllDays: true });
    expect(v.day).toBe(2);
    // 投票含第 1、2 天
    expect(v.votes!.some((r) => r.day === 1)).toBe(true);
    expect(v.votes!.some((r) => r.day === 2)).toBe(true);
    // 時間軸含第 1 天白天，但夜晚行照舊不下發
    expect(v.timeline!.some((e) => e.phase.includes('第 1'))).toBe(true);
    expect(v.timeline!.every((e) => !e.phase.includes('夜'))).toBe(true);
    expect(v.timeline!.every((e) => !e.secret)).toBe(true);
  });

  it('待公佈的夜晚死亡不得提前顯示', () => {
    const state = run(makeConfig([...STANDARD12]), [...night({ wolf: 5, seer: 9 })]); // 尚未 DEATHS_ANNOUNCED（此時已回白天）
    const v = buildSpectatorView(state, SETTINGS);
    expect(v.players.find((p) => p.seat === 5)!.alive).toBe(true);
    expect(v.aliveCount).toBe(12);
  });

  it('showDeadRoles 開才公開死者身分；白天死因公開、夜間死因永不下發', () => {
    const { state } = midGame();
    const di = { ...SETTINGS, showDeathInfo: true };
    const hidden = buildSpectatorView(state, di);
    expect(hidden.players.find((p) => p.seat === 9)!.role).toBeNull();
    expect(hidden.players.find((p) => p.seat === 9)!.deathCause).toBe('被投票放逐'); // 白天死因公開
    expect(hidden.players.find((p) => p.seat === 5)!.deathCause).toBeNull(); // 夜間死因不給

    const shown = buildSpectatorView(state, { ...di, showDeadRoles: true });
    expect(shown.players.find((p) => p.seat === 9)!).toMatchObject({ role: 'werewolf', deathCause: '被投票放逐' });
    expect(shown.players.find((p) => p.seat === 1)!.role).toBeNull(); // 活人仍隱藏
    expect(shown.players.find((p) => p.seat === 5)!).toMatchObject({ role: 'villager', deathCause: null }); // 明牌局翻牌不翻死法
  });

  it('showDeathInfo 預設關：死亡時間/死因整組不下發；開了才給、夜間死因仍不給', () => {
    const { state } = midGame();
    const off = buildSpectatorView(state, SETTINGS);
    expect(off.players.find((p) => p.seat === 9)!).toMatchObject({ alive: false, deathAt: null, deathCause: null });
    expect(off.players.find((p) => p.seat === 5)!).toMatchObject({ alive: false, deathAt: null, deathCause: null });

    const on = buildSpectatorView(state, { ...SETTINGS, showDeathInfo: true });
    expect(on.players.find((p) => p.seat === 9)!).toMatchObject({ deathAt: '第 1 天', deathCause: '被投票放逐' });
    expect(on.players.find((p) => p.seat === 5)!).toMatchObject({ deathAt: '第 1 夜', deathCause: null });
  });

  it('自曝身分：放棄開槍不進時間軸且不亮牌；亮牌開槍亮牌', () => {
    const noShot = run(makeConfig([...STANDARD12]), [
      ...night({ wolf: 3, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'SHOT_FIRED', shooter: 3, target: null },
      { type: 'LAST_WORDS_DONE', seat: 3 },
    ]);
    const v = buildSpectatorView(noShot, SETTINGS);
    expect(v.timeline!.some((e) => e.text.includes('放棄'))).toBe(false);
    expect(v.players.find((p) => p.seat === 3)!.role).toBeNull();

    const fired = run(makeConfig([...STANDARD12]), [
      ...night({ wolf: 3, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'SHOT_FIRED', shooter: 3, target: 9 },
      { type: 'LAST_WORDS_DONE', seat: 3 },
    ]);
    expect(buildSpectatorView(fired, SETTINGS).players.find((p) => p.seat === 3)!.role).toBe('hunter');
  });

  it('翻牌白癡不論設定都公開', () => {
    const state = run(makeConfig([...STANDARD12]), [
      ...night({ wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      { type: 'EXILE_VOTED', ballots: ballots([1, 4], [2, 4], [3, 4], [6, 4], [7, 4], [8, 4], [9, null], [10, null], [11, null], [12, null], [4, null]) },
    ]);
    expect(buildSpectatorView(state, SETTINGS).players.find((p) => p.seat === 4)!).toMatchObject({
      role: 'idiot',
      idiotRevealed: true,
      alive: true,
    });
  });

  it('GM 筆記任何情況不外流', () => {
    const { events } = midGame();
    const state = run(makeConfig([...STANDARD12]), [...events, { type: 'NOTE_ADDED', text: '懷疑 3 號 7 號串通' }]);
    const v = buildSpectatorView(state, SETTINGS);
    expect(v.timeline!.some((e) => e.text.includes('串通'))).toBe(false);
  });

  it('票型明細跟著 showVotes', () => {
    const { state, events } = midGame();
    const v = withReport(state, events);
    expect(v.votes!.find((r) => r.day === 1)!.counts.find((c) => c.seat === 9)!.votes).toBe(6);
    expect(v.votes![0]!.outcome).toContain('9 號被放逐');
    expect(withReport(state, events, { ...SETTINGS, showVotes: false }).votes).toBeNull();
  });

  it('終局全公開（跨日 votes/timeline 不再過濾）', () => {
    const quick = makeConfig(['seer', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf']);
    const state = run(quick, [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 1 },
      { type: 'SEER_ACTED', target: 4 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    const v = buildSpectatorView(state, { ...SETTINGS, showDeadRoles: false, showTimeline: false });
    expect(v.stage).toBe('ended');
    expect(v.winner?.faction).toBe('wolf');
    expect(v.players.every((p) => p.role !== null)).toBe(true);
    expect(v.timeline).not.toBeNull(); // 終局攤牌含祕密時間軸
  });

  it('replay 一致性：與 server 相同流程（envelopes → replay → view）', () => {
    const { events } = midGame();
    const envelopes = toEnvelopes(makeConfig([...STANDARD12]), events);
    const v = buildSpectatorView(replay(envelopes), SETTINGS, buildGameReport(envelopes));
    expect(v.phaseText).toContain('第 1 天');
    expect(v.aliveCount).toBe(10);
  });
});
