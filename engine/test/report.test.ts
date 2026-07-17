import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src';
import { buildGameReport } from '../src';
import { makeConfig, toEnvelopes, ballots, night, STANDARD12, WOLFKING12 } from './helpers';

const CUPID12 = ['seer', 'witch', 'hunter', 'cupid', 'villager', 'villager', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'werewolf'] as const;
const SEEDWOLF12 = ['seer', 'witch', 'hunter', 'idiot', 'villager', 'villager', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'seedWolf'] as const;

describe('buildGameReport', () => {
  it('標準局 smoke：夜晚行動、放逐結果、玩家死因與查驗軌跡', () => {
    const config = makeConfig([...STANDARD12]);
    const events: GameEvent[] = [
      ...night({ wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 9], [2, 9], [3, 9], [4, 9], [6, 9], [7, 9], [8, null], [9, 1], [10, 1], [11, 1], [12, 1]),
      },
      { type: 'LAST_WORDS_DONE', seat: 9 },
      { type: 'DAY_ENDED' },
    ];
    const r = buildGameReport(toEnvelopes(config, events));

    expect(r.result.ongoing).toBe(true);
    expect(r.result.totalDays).toBe(2); // 已進入第 2 夜
    expect(r.nights[0]).toMatchObject({ night: 1, wolfTarget: 5, settled: true, peaceful: false });
    expect(r.nights[0]!.deaths).toEqual([{ seat: 5, cause: 'wolf', poisoned: false }]);
    expect(r.nights[0]!.seer).toMatchObject({ night: 1, target: 9, result: 'wolf' });
    expect(r.seerTrack).toHaveLength(1);

    const day1 = r.days.find((d) => d.day === 1)!;
    expect(day1.announcedDeaths).toEqual([{ seat: 5, cause: 'wolf' }]);
    expect(day1.exileRounds).toHaveLength(1);
    expect(day1.exileRounds[0]!.outcome).toEqual({ t: 'exiled', seat: 9, chained: [] });

    expect(r.players.find((p) => p.seat === 9)!.death).toMatchObject({ cause: 'exile', day: 1, during: 'day' });
    expect(r.players.find((p) => p.seat === 5)!.death).toMatchObject({ cause: 'wolf', during: 'night' });
    // 查殺亮點
    expect(r.highlights.some((h) => h.title.includes('查殺'))).toBe(true);
  });

  it('投票準確度：好人投狼計分、棄票不入分母、狼票不計', () => {
    const config = makeConfig([...STANDARD12]);
    const events: GameEvent[] = [
      ...night({ wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 9], [2, 6], [3, null], [4, 9], [6, 9], [7, 9], [8, 9], [9, 1], [10, 1], [11, null], [12, 1]),
      },
      { type: 'LAST_WORDS_DONE', seat: 9 },
    ];
    const r = buildGameReport(toEnvelopes(config, events));
    const p = (s: number) => r.players.find((x) => x.seat === s)!.voteStats;

    expect(p(1)).toMatchObject({ countable: 1, hitWolf: 1, accuracy: 1 }); // 好人投狼
    expect(p(2)).toMatchObject({ countable: 1, hitWolf: 0, accuracy: 0 }); // 好人投好人
    expect(p(3)).toMatchObject({ countable: 0, abstain: 1, accuracy: null }); // 棄票不入分母
    expect(p(9)).toMatchObject({ countable: 0, accuracy: null }); // 狼陣營不計
    expect(p(11)).toMatchObject({ countable: 0, abstain: 1 });
  });

  it('警長競選：counts 記錄、當選人、放逐時警長 1.5 票', () => {
    const config = makeConfig([...STANDARD12], { sheriffEnabled: true });
    const events: GameEvent[] = [
      ...night({ wolf: 5, seer: 9 }),
      { type: 'SHERIFF_NOMINATED', candidates: [1, 9] },
      {
        type: 'SHERIFF_VOTED',
        ballots: ballots([2, 1], [3, 1], [4, 1], [5, 9], [6, 9], [7, null], [8, null], [10, null], [11, null], [12, null]),
      },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 9], [2, 9], [3, 9], [4, null], [6, null], [7, null], [8, null], [9, 1], [10, 1], [11, 1], [12, null]),
      },
      { type: 'LAST_WORDS_DONE', seat: 9 },
    ];
    const r = buildGameReport(toEnvelopes(config, events));
    const day1 = r.days.find((d) => d.day === 1)!;

    expect(day1.sheriff).not.toBeNull();
    expect(day1.sheriff!.candidates).toEqual([1, 9]);
    expect(day1.sheriff!.elected).toBe(1);
    expect(day1.sheriff!.rounds[0]!.outcome).toEqual({ t: 'elected', seat: 1 });
    expect(day1.sheriff!.rounds[0]!.counts.find((c) => c.seat === 1)!.votes).toBe(3);

    // 放逐：1 號警長票重 1.5 → 9 號 3.5 票 vs 1 號 3 票
    const exile = day1.exileRounds[0]!;
    expect(exile.counts.find((c) => c.seat === 9)!.votes).toBe(3.5);
    expect(exile.outcome).toMatchObject({ t: 'exiled', seat: 9 });
    expect(r.players.find((p) => p.seat === 1)!.everSheriff).toBe(true);
  });

  it('種狼感染：感染記錄、感染者的票不再計分、投感染者算投中狼', () => {
    const config = makeConfig([...SEEDWOLF12]);
    const events: GameEvent[] = [
      ...night({ wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      { type: 'EXILE_VOTED', ballots: ballots([1, null], [2, null], [3, null], [4, null], [6, null], [7, null], [8, null], [9, null], [10, null], [11, null], [12, null]) },
      // 第 2 夜：刀 6 並感染（刀口不死、轉狼）
      { type: 'DAY_ENDED' },
      { type: 'WOLVES_ACTED', target: 6 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' }, // 平安夜
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 6], [2, 6], [3, 6], [4, 6], [6, 1], [7, 6], [8, null], [9, null], [10, null], [11, null], [12, null]),
      },
      { type: 'LAST_WORDS_DONE', seat: 6 },
    ];
    const r = buildGameReport(toEnvelopes(config, events));

    expect(r.nights[1]!.infected).toBe(6);
    expect(r.nights[1]!.peaceful).toBe(true); // 感染擋刀
    const p6 = r.players.find((p) => p.seat === 6)!;
    expect(p6.converted).toBe(true);
    expect(p6.convertedOnNight).toBe(2);
    expect(p6.finalCamp).toBe('wolf');
    // 6 號投票當下已是狼 → 不計分；1 號投 6（當下已轉狼）→ 算投中狼
    expect(p6.voteStats.countable).toBe(0);
    expect(r.players.find((p) => p.seat === 1)!.voteStats).toMatchObject({ countable: 1, hitWolf: 1 });
    expect(r.highlights.some((h) => h.title === '種狼感染')).toBe(true);
  });

  it('第三方情侶：情侶票不計分、邱比特照計', () => {
    const config = makeConfig([...CUPID12]);
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 5, b: 9 }, // 民 + 狼 = 第三方
      { type: 'WOLVES_ACTED', target: 6 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 6 },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [7, null], [8, null], [9, 1], [10, null], [11, null], [12, null]),
      },
      { type: 'LAST_WORDS_DONE', seat: 10 },
    ];
    const r = buildGameReport(toEnvelopes(config, events));

    expect(r.nights[0]!.cupid).toEqual({ a: 5, b: 9, thirdParty: true });
    const p5 = r.players.find((p) => p.seat === 5)!;
    const p4 = r.players.find((p) => p.seat === 4)!;
    expect(p5.finalCamp).toBe('third');
    expect(p5.lover).toBe(true);
    expect(p5.voteStats.countable).toBe(0); // 第三方不計分
    expect(p4.finalCamp).toBe('third'); // 邱比特也標第三方（同組）
    expect(p4.voteStats).toMatchObject({ countable: 1, hitWolf: 1 }); // 但票照計（好人勝利條件仍在）
  });

  it('白癡被票：outcome 為翻牌、免死', () => {
    const config = makeConfig([...STANDARD12]);
    const events: GameEvent[] = [
      ...night({ wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 4], [2, 4], [3, 4], [6, 4], [7, 4], [8, 4], [9, null], [10, null], [11, null], [12, null], [4, null]),
      },
    ];
    const r = buildGameReport(toEnvelopes(config, events));
    expect(r.days[0]!.exileRounds[0]!.outcome).toEqual({ t: 'idiotRevealed', seat: 4 });
    const p4 = r.players.find((p) => p.seat === 4)!;
    expect(p4.idiotRevealed).toBe(true);
    expect(p4.death).toBeNull();
    expect(r.highlights.some((h) => h.title === '白癡翻牌')).toBe(true);
  });

  it('放逐平票 PK：第一輪 outcome=pk、第二輪 round=2 且帶 pkSeats', () => {
    const config = makeConfig([...STANDARD12]);
    const events: GameEvent[] = [
      ...night({ wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 9], [2, 9], [3, 10], [4, 10], [6, null], [7, null], [8, null], [9, null], [10, null], [11, null], [12, null]),
      },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 9], [2, 9], [3, 9], [4, null], [6, null], [7, null], [8, null], [11, null], [12, null]),
      },
      { type: 'LAST_WORDS_DONE', seat: 9 },
    ];
    const r = buildGameReport(toEnvelopes(config, events));
    const rounds = r.days[0]!.exileRounds;

    expect(rounds).toHaveLength(2);
    expect(rounds[0]!.outcome).toEqual({ t: 'pk', seats: [9, 10] });
    expect(rounds[1]!).toMatchObject({ round: 2, pkSeats: [9, 10] });
    expect(rounds[1]!.outcome).toMatchObject({ t: 'exiled', seat: 9 });
  });

  it('守衛擋刀與女巫雙藥亮點', () => {
    const config = makeConfig([...WOLFKING12]); // 4 = 守衛
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'GUARD_ACTED', target: 5 },
      { type: 'WOLVES_ACTED', target: 5 }, // 守=刀 → 擋刀成功
      { type: 'WITCH_ACTED', save: false, poison: 9 }, // 毒中狼
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 9 },
      { type: 'EXILE_VOTED', ballots: ballots([1, null], [2, null], [3, null], [4, null], [5, null], [6, null], [7, null], [8, null], [10, null], [11, null], [12, null]) },
      // 第 2 夜：刀 6、女巫解藥救
      { type: 'DAY_ENDED' },
      { type: 'GUARD_ACTED', target: 7 },
      { type: 'WOLVES_ACTED', target: 6 },
      { type: 'WITCH_ACTED', save: true, poison: null },
      { type: 'SEER_ACTED', target: 11 },
      { type: 'NIGHT_ENDED' },
    ];
    const r = buildGameReport(toEnvelopes(config, events));

    expect(r.nights[0]!.saved).toEqual({ seat: 5, by: 'guard' });
    expect(r.nights[0]!.witchPoisonCamp).toBe('wolf');
    expect(r.nights[0]!.deaths).toEqual([{ seat: 9, cause: 'poison', poisoned: true }]);
    expect(r.nights[1]!.saved).toEqual({ seat: 6, by: 'witch' });
    expect(r.nights[1]!.peaceful).toBe(true);
    expect(r.highlights.some((h) => h.title.startsWith('神守'))).toBe(true);
    expect(r.highlights.some((h) => h.title === '雙藥全中')).toBe(true);
  });

  it('放逐殉情級聯：chained 記錄真實死因', () => {
    const config = makeConfig([...CUPID12]);
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 5, b: 6 }, // 同陣營情侶（民民）
      { type: 'WOLVES_ACTED', target: 7 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 9 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 7 },
      {
        type: 'EXILE_VOTED',
        ballots: ballots([1, 5], [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, null], [11, null], [12, null], [5, null], [6, null]),
      },
    ];
    const r = buildGameReport(toEnvelopes(config, events));

    expect(r.nights[0]!.cupid).toEqual({ a: 5, b: 6, thirdParty: false });
    expect(r.days[0]!.exileRounds[0]!.outcome).toEqual({
      t: 'exiled',
      seat: 5,
      chained: [{ seat: 6, cause: 'lovesick' }],
    });
    expect(r.players.find((p) => p.seat === 6)!.finalCamp).toBe('good'); // 同陣營情侶不是第三方
  });

  it('終局與中止局：winner / aborted / ongoing 旗標', () => {
    // 速勝局：單神被刀 → 屠邊狼勝
    const quick = makeConfig(['seer', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf']);
    const won = buildGameReport(
      toEnvelopes(quick, [
        { type: 'NIGHT_STARTED' },
        { type: 'WOLVES_ACTED', target: 1 },
        { type: 'SEER_ACTED', target: 4 },
        { type: 'NIGHT_ENDED' },
        { type: 'DEATHS_ANNOUNCED' },
      ]),
    );
    expect(won.result.winner?.faction).toBe('wolf');
    expect(won.result.aborted).toBe(false);
    expect(won.result.ongoing).toBe(false);

    const aborted = buildGameReport(toEnvelopes(makeConfig([...STANDARD12]), [{ type: 'GAME_ABORTED' }]));
    expect(aborted.result.winner).toBeNull();
    expect(aborted.result.aborted).toBe(true);
    expect(aborted.result.ongoing).toBe(false);
  });
});
