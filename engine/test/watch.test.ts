import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '../src';
import { buildGameReport, buildSpectatorView, DEFAULT_SHARE, replay } from '../src';
import { makeConfig, toEnvelopes, ballots, night, run, STANDARD12 } from './helpers';

const SETTINGS = { ...DEFAULT_SHARE, enabled: true, godViewForDead: true };

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

describe('buildSpectatorView', () => {
  it('預設視角：身分全隱藏、公開時間軸不含夜晚祕密', () => {
    const { state } = midGame();
    const v = buildSpectatorView(state, SETTINGS, null);

    expect(v.god).toBe(false);
    for (const p of v.players) {
      expect(p.role).toBeNull();
      expect(p.lover).toBe(false);
      expect(p.converted).toBe(false);
    }
    // 死亡是公開事實
    expect(v.players.find((p) => p.seat === 5)).toMatchObject({ alive: false, deathAt: '第 1 夜', deathCause: null });
    // 查驗是 secret log，公開時間軸不得出現
    expect(v.timeline).not.toBeNull();
    expect(v.timeline!.every((e) => !e.secret)).toBe(true);
    expect(v.timeline!.some((e) => e.text.includes('查驗'))).toBe(false);
    // 序列化整包也不能洩漏角色字串
    const json = JSON.stringify(v);
    expect(json).not.toContain('werewolf');
    expect(json).not.toContain('seer');
  });

  it('待公佈的夜晚死亡不得提前顯示', () => {
    const state = run(makeConfig([...STANDARD12]), [...night({ wolf: 5, seer: 9 })]); // 尚未 DEATHS_ANNOUNCED
    const v = buildSpectatorView(state, SETTINGS, null);
    expect(v.players.find((p) => p.seat === 5)!.alive).toBe(true);
    expect(v.aliveCount).toBe(12);
  });

  it('showDeadRoles 開啟才公開死者身分；白天死因公開、夜間死因永不下發', () => {
    const { state } = midGame();
    const hidden = buildSpectatorView(state, SETTINGS, null);
    expect(hidden.players.find((p) => p.seat === 9)!.role).toBeNull();
    // 放逐是白天公開事件：純觀眾也看得到死因（不用開 showDeadRoles）
    expect(hidden.players.find((p) => p.seat === 9)!.deathCause).toBe('被投票放逐');
    // 夜間死因（被刀）不下發
    expect(hidden.players.find((p) => p.seat === 5)!.deathCause).toBeNull();

    const shown = buildSpectatorView(state, { ...SETTINGS, showDeadRoles: true }, null);
    expect(shown.players.find((p) => p.seat === 9)!).toMatchObject({ role: 'werewolf', deathCause: '被投票放逐' });
    expect(shown.players.find((p) => p.seat === 1)!.role).toBeNull(); // 活人仍隱藏
    // 明牌局翻的是牌、不是死法：夜死者亮牌但死因仍隱藏
    expect(shown.players.find((p) => p.seat === 5)!).toMatchObject({ role: 'villager', deathCause: null });
  });

  it('票型明細隨 showVotes 從時間軸剔除；GM 筆記任何視角不外流', () => {
    const { events } = midGame();
    const state = run(makeConfig([...STANDARD12]), [...events, { type: 'NOTE_ADDED', text: '懷疑 3 號 7 號串通' }]);

    const noVotes = buildSpectatorView(state, { ...SETTINGS, showVotes: false }, null);
    expect(noVotes.timeline!.some((e) => e.text.includes('放逐投票（'))).toBe(false);

    const withVotes = buildSpectatorView(state, SETTINGS, null);
    expect(withVotes.timeline!.some((e) => e.text.includes('放逐投票（'))).toBe(true);

    // 上帝視角也看不到 GM 筆記
    const god = buildSpectatorView(state, SETTINGS, 5);
    expect(god.god).toBe(true);
    expect(god.timeline!.some((e) => e.text.includes('串通'))).toBe(false);
  });

  it('放棄開槍不進公開時間軸；亮牌開槍後座位亮牌', () => {
    const state = run(makeConfig([...STANDARD12]), [
      ...night({ wolf: 3, seer: 9 }), // 刀獵人
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'SHOT_FIRED', shooter: 3, target: null }, // 放棄開槍
      { type: 'LAST_WORDS_DONE', seat: 3 },
    ]);
    const v = buildSpectatorView(state, SETTINGS, null);
    expect(v.timeline!.some((e) => e.text.includes('放棄'))).toBe(false);
    expect(v.players.find((p) => p.seat === 3)!.role).toBeNull(); // 沒亮牌就不是自曝

    const fired = run(makeConfig([...STANDARD12]), [
      ...night({ wolf: 3, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'SHOT_FIRED', shooter: 3, target: 9 }, // 亮牌開槍
      { type: 'LAST_WORDS_DONE', seat: 3 },
    ]);
    const v2 = buildSpectatorView(fired, SETTINGS, null);
    expect(v2.players.find((p) => p.seat === 3)!.role).toBe('hunter'); // 自曝身分
  });

  it('翻牌白癡不論設定都公開', () => {
    const state = run(makeConfig([...STANDARD12]), [
      ...night({ wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 4], [2, 4], [3, 4], [6, 4], [7, 4], [8, 4], [9, null], [10, null], [11, null], [12, null], [4, null]),
      },
    ]);
    const v = buildSpectatorView(state, SETTINGS, null);
    expect(v.players.find((p) => p.seat === 4)!).toMatchObject({ role: 'idiot', idiotRevealed: true, alive: true });
  });

  it('上帝視角：死者可看全部、活人不行、開關可擋', () => {
    const { state } = midGame();
    const dead = buildSpectatorView(state, SETTINGS, 5);
    expect(dead.god).toBe(true);
    expect(dead.players.every((p) => p.role !== null)).toBe(true);
    expect(dead.timeline!.some((e) => e.secret && e.text.includes('查驗'))).toBe(true);

    const alive = buildSpectatorView(state, SETTINGS, 2);
    expect(alive.god).toBe(false);
    expect(alive.players.find((p) => p.seat === 9)!.role).toBeNull();

    const blocked = buildSpectatorView(state, { ...SETTINGS, godViewForDead: false }, 5);
    expect(blocked.god).toBe(false);
    expect(blocked.players.every((p) => p.seat === 4 || p.role === null || !p.alive)).toBe(true);
  });

  it('終局全公開', () => {
    const quick = makeConfig(['seer', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf']);
    const state = run(quick, [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 1 },
      { type: 'SEER_ACTED', target: 4 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    const v = buildSpectatorView(state, { ...SETTINGS, showDeadRoles: false, showTimeline: false }, null);
    expect(v.ended).toBe(true);
    expect(v.winner?.faction).toBe('wolf');
    expect(v.players.every((p) => p.role !== null)).toBe(true);
    expect(v.timeline).not.toBeNull(); // 終局攤牌含祕密時間軸
  });

  it('投票明細跟著 showVotes、含計票與結果', () => {
    const { state, events } = midGame();
    const report = buildGameReport(toEnvelopes(makeConfig([...STANDARD12]), events));
    const v = buildSpectatorView(state, SETTINGS, null, report);
    expect(v.votes).not.toBeNull();
    expect(v.votes![0]!.counts.find((c) => c.seat === 9)!.votes).toBe(6);
    expect(v.votes![0]!.outcome).toContain('9 號被放逐');

    const off = buildSpectatorView(state, { ...SETTINGS, showVotes: false }, null, report);
    expect(off.votes).toBeNull();
  });

  it('replay 一致性：與 server 相同流程（envelopes → replay → view）', () => {
    const { events } = midGame();
    const envelopes = toEnvelopes(makeConfig([...STANDARD12]), events);
    const v = buildSpectatorView(replay(envelopes), SETTINGS, null, buildGameReport(envelopes));
    expect(v.phaseText).toContain('第 1 天');
    expect(v.aliveCount).toBe(10);
  });
});
