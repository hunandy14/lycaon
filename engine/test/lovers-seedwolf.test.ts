import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, RoleId } from '../src';
import { buildDawnAnnouncement, buildNightPlan, initialState, reduce, replay, validate } from '../src';
import { currentNightStep, skipInactive } from '../src/night/plan';
import { run, makeConfig, ballots, dead, toEnvelopes } from './helpers';

// 邱比特 8 人板：1邱 2預 3女 4獵 5-6民 7-8狼
const CUPID8: RoleId[] = ['cupid', 'seer', 'witch', 'hunter', 'villager', 'villager', 'werewolf', 'werewolf'];
// 種狼 7 人板：1預 2女 3獵 4-5民 6狼 7種狼（屠城規則，避免小板屠邊干擾感染測試）
const SEED7: RoleId[] = ['seer', 'witch', 'hunter', 'villager', 'villager', 'werewolf', 'seedWolf'];
const seedCfg = (rules = {}) => makeConfig(SEED7, { victory: 'slaughterCity', ...rules });

describe('邱比特：殉情', () => {
  it('夜刀情侶一方 → 播報雙死、另一半殉情；殉情獵人預設不能開槍', () => {
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 4, b: 5 }, // 獵人+平民
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 7 },
      { type: 'NIGHT_ENDED' },
    ];
    const beforeAnnounce = run(makeConfig(CUPID8), events);
    expect(buildDawnAnnouncement(beforeAnnounce)).toContain('4 號、5 號'); // 殉情者一起播報

    const s = run(makeConfig(CUPID8), [...events, { type: 'DEATHS_ANNOUNCED' }]);
    expect(dead(s)).toEqual([4, 5]);
    expect(s.players[3]!.death?.cause).toBe('lovesick');
    // 殉情獵人（預設）不能開槍：佇列只有兩人的遺言
    expect(s.actionQueue).toEqual([
      { kind: 'lastWords', seat: 5 },
      { kind: 'lastWords', seat: 4 },
    ]);
  });

  it('lovesickCanShoot 開啟 → 殉情獵人可開槍（含連鎖消化）', () => {
    const s = run(makeConfig(CUPID8, { lovesickCanShoot: true }), [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 4, b: 5 },
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 7 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      { type: 'SHOT_FIRED', shooter: 4, target: 7 }, // 殉情獵人帶走一狼
      { type: 'LAST_WORDS_DONE', seat: 4 },
      { type: 'LAST_WORDS_DONE', seat: 7 },
    ]);
    expect(dead(s).sort((a, b) => a - b)).toEqual([4, 5, 7]);
    expect(s.actionQueue).toEqual([]);
  });

  it('白天被票 → 另一半立即殉情', () => {
    const s = run(makeConfig(CUPID8), [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 4, b: 5 },
      { type: 'WOLVES_ACTED', target: null },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 7 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: ballots([1, 5], [2, 5], [7, 5], [8, 5]) },
    ]);
    expect(dead(s)).toEqual([4, 5]);
    expect(s.players[4]!.death?.cause).toBe('exile');
    expect(s.players[3]!.death?.cause).toBe('lovesick');
  });

  it('刀A毒B 的情侶雙死：各保留真實死因（被毒者不能開槍）', () => {
    // 情侶 = 獵人4 + 平民5；刀5、毒4 → 4 的死因必須是刀+毒（poisoned），不是殉情
    const s = run(makeConfig(CUPID8), [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 4, b: 5 },
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: false, poison: 4 },
      { type: 'SEER_ACTED', target: 7 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(dead(s)).toEqual([4, 5]);
    expect(s.players[3]!.death?.cause).toBe('poison');
    expect(s.players[3]!.death?.poisoned).toBe(true);
    expect(s.actionQueue.filter((a) => a.kind === 'shoot')).toEqual([]); // 被毒不能開槍
  });
});

describe('邱比特：第三方情侶', () => {
  // 5 人板：1邱 2預 3民 4狼 5狼
  const TP5: RoleId[] = ['cupid', 'seer', 'villager', 'werewolf', 'werewolf'];

  it('跨陣營情侶：場上只剩情侶（+邱比特）→ 情侶獲勝、待辦作廢', () => {
    const s = run(makeConfig(TP5), [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 3, b: 4 }, // 民+狼 = 跨陣營
      { type: 'WOLVES_ACTED', target: 2 },
      { type: 'SEER_ACTED', target: 4 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 2 },
      { type: 'EXILE_VOTED', ballots: ballots([1, 5], [3, 5]) }, // 放逐 5 號狼
    ]);
    expect(s.winner?.faction).toBe('lovers');
    expect(s.phase.t).toBe('ended');
    expect(s.actionQueue).toEqual([]); // 被票者遺言作廢（終局）
    expect(dead(s)).toEqual([2, 5]);
  });

  it('同陣營情侶不構成第三方：狼全滅 → 好人勝', () => {
    const s = run(makeConfig(['cupid', 'seer', 'villager', 'villager', 'werewolf']), [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 3, b: 4 }, // 雙平民
      { type: 'WOLVES_ACTED', target: null },
      { type: 'SEER_ACTED', target: 5 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: ballots([1, 5], [2, 5], [3, 5]) },
    ]);
    expect(s.winner?.faction).toBe('good');
  });

  it('邱比特不能把同一人連兩次（自己連自己）', () => {
    expect(() =>
      run(makeConfig(TP5), [
        { type: 'NIGHT_STARTED' },
        { type: 'CUPID_LINKED', a: 3, b: 3 },
      ]),
    ).toThrow(/兩個不同的人/);
  });
});

describe('種狼：感染', () => {
  /** 第一夜（刀4平民）+ 平安白天，進入第二夜可感染的狀態 */
  const night1AndDay: GameEvent[] = [
    { type: 'NIGHT_STARTED' },
    { type: 'WOLVES_ACTED', target: 4 },
    { type: 'WITCH_ACTED', save: false, poison: null },
    { type: 'SEER_ACTED', target: 6 },
    { type: 'NIGHT_ENDED' },
    { type: 'DEATHS_ANNOUNCED' },
    { type: 'LAST_WORDS_DONE', seat: 4 },
    { type: 'EXILE_VOTED', ballots: [] },
    { type: 'DAY_ENDED' },
  ];

  it('標準版首夜不能感染', () => {
    expect(() =>
      run(seedCfg(), [
        { type: 'NIGHT_STARTED' },
        { type: 'WOLVES_ACTED', target: 4 },
        { type: 'SEED_WOLF_ACTED', infect: true },
      ]),
    ).toThrow(); // 首夜種狼步驟為走過場，事件不合時序
  });

  it('seedWolfFirstNight 開啟 → 首夜可感染', () => {
    const s = run(seedCfg({ seedWolfFirstNight: true }), [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 4 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(s.players[3]!.alive).toBe(true);
    expect(s.players[3]!.converted).toBe(true);
  });

  it('第二夜感染：刀口不死、天亮轉狼；當夜查驗仍是好人、次夜查驗變狼', () => {
    const s = run(seedCfg(), [
      ...night1AndDay,
      // 夜2：刀5 + 感染；預言家當夜查 5（感染天亮才生效 → 好人）
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 5 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' }, // 平安夜（感染擋刀）
      { type: 'EXILE_VOTED', ballots: [] },
      { type: 'DAY_ENDED' },
      // 夜3：空刀；種狼已用（走過場）；預言家再查 5 → 狼
      { type: 'WOLVES_ACTED', target: null },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 5 },
      { type: 'NIGHT_ENDED' },
    ]);
    const p5 = s.players[4]!;
    expect(p5.alive).toBe(true);
    expect(p5.converted).toBe(true);
    expect(s.seerChecks).toEqual([
      { night: 1, target: 6, result: 'wolf' },
      { night: 2, target: 5, result: 'good' }, // 感染當夜查驗：天亮才生效
      { night: 3, target: 5, result: 'wolf' },
    ]);
  });

  it('感染 + 女巫毒同一人 → 照死（感染只擋刀不擋毒）', () => {
    const s = run(seedCfg(), [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: 5 },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(s.players[4]!.alive).toBe(false);
    expect(s.players[4]!.death?.cause).toBe('poison');
  });

  it('感染的獵人：預設失去槍；infectedKeepsSkills 開啟則保留', () => {
    const infectHunter: GameEvent[] = [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 3 }, // 刀獵人
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      // 白天放逐被感染的獵人
      { type: 'EXILE_VOTED', ballots: ballots([1, 3], [2, 3], [5, 3]) },
    ];
    const lost = run(seedCfg(), infectHunter);
    expect(lost.players[2]!.alive).toBe(false);
    expect(lost.actionQueue).toEqual([{ kind: 'lastWords', seat: 3 }]); // 沒有槍

    const kept = run(seedCfg({ infectedKeepsSkills: true }), infectHunter);
    expect(kept.actionQueue[0]).toEqual({ kind: 'shoot', seat: 3, via: 'hunter' });
  });

  it('感染最後一個神 → 屠邊即時成立（天亮公佈時判定）', () => {
    // 1預(唯一神) 2民 3民 4狼 5種狼，屠邊規則
    const cfg = makeConfig(['seer', 'villager', 'villager', 'werewolf', 'seedWolf'], { victory: 'slaughterSide' });
    const s = run(cfg, [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 2 },
      { type: 'SEER_ACTED', target: 4 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 2 },
      { type: 'EXILE_VOTED', ballots: [] },
      { type: 'DAY_ENDED' },
      // 夜2：刀預言家 + 感染 → 神職歸零
      { type: 'WOLVES_ACTED', target: 1 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'SEER_ACTED', target: 5 }, // 預言家本夜仍可行動
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(s.winner?.faction).toBe('wolf');
    expect(s.winner?.reason).toContain('神職');
    expect(s.players[0]!.alive).toBe(true); // 預言家沒死，是被策反的
  });

  it('感染一局一次：再次發動被拒', () => {
    expect(() =>
      run(seedCfg(), [
        ...night1AndDay,
        { type: 'WOLVES_ACTED', target: 5 },
        { type: 'SEED_WOLF_ACTED', infect: true },
        { type: 'WITCH_ACTED', save: false, poison: null },
        { type: 'SEER_ACTED', target: 6 },
        { type: 'NIGHT_ENDED' },
        { type: 'DEATHS_ANNOUNCED' },
        { type: 'EXILE_VOTED', ballots: [] },
        { type: 'DAY_ENDED' },
        { type: 'WOLVES_ACTED', target: 1 },
        { type: 'SEED_WOLF_ACTED', infect: true }, // 已用過 → 步驟為走過場
      ]),
    ).toThrow();
  });

  it('感染的女巫失去夜間行動（步驟轉走過場）、藥水凍結', () => {
    const events: GameEvent[] = [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 2 }, // 刀女巫 + 感染
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null }, // 感染天亮生效，本夜女巫仍行動
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: [] },
      { type: 'DAY_ENDED' },
      // 夜3：女巫已轉狼 → 女巫步驟走過場，直接狼→預言家
      { type: 'WOLVES_ACTED', target: null },
    ];
    const s = run(seedCfg(), events);
    const plan = buildNightPlan(s);
    expect(plan.find((x) => x.id === 'witch')?.active).toBe(false);
    // 不需要 WITCH_ACTED 即可直接查驗
    const s2 = run(seedCfg(), [...events, { type: 'SEER_ACTED', target: 2 }, { type: 'NIGHT_ENDED' }]);
    expect(s2.seerChecks[s2.seerChecks.length - 1]).toEqual({ night: 3, target: 2, result: 'wolf' });
  });

  it('不能感染狼陣營刀口（狼刀自己人再感染）', () => {
    expect(() =>
      run(seedCfg(), [
        ...night1AndDay,
        { type: 'WOLVES_ACTED', target: 6 }, // 自刀
        { type: 'SEED_WOLF_ACTED', infect: true },
      ]),
    ).toThrow(/狼人陣營/);
  });
});

describe('種狼進階版：感染變狼王（seedWolfMakesWolfKing，延後一夜生效）', () => {
  /** 第一夜（刀4平民）+ 平安白天，進入第二夜可感染的狀態 */
  const night1AndDay: GameEvent[] = [
    { type: 'NIGHT_STARTED' },
    { type: 'WOLVES_ACTED', target: 4 },
    { type: 'WITCH_ACTED', save: false, poison: null },
    { type: 'SEER_ACTED', target: 6 },
    { type: 'NIGHT_ENDED' },
    { type: 'DEATHS_ANNOUNCED' },
    { type: 'LAST_WORDS_DONE', seat: 4 },
    { type: 'EXILE_VOTED', ballots: [] },
    { type: 'DAY_ENDED' },
  ];

  it('規則關閉（預設）：感染後角色維持原樣、不出現 wolfKingPending，行為與現況一致', () => {
    const s = run(seedCfg(), [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
    ]);
    const p5 = s.players[4]!;
    expect(p5.role).toBe('villager'); // 角色不變，只有陣營變狼
    expect(p5.converted).toBe(true);
    expect(p5.wolfKingPending).toBe(false);
  });

  it('規則開啟：感染當夜目標天亮結算後 role 變 wolfKing、converted=true、wolfKingPending=true，且不算真死於刀', () => {
    const s = run(seedCfg({ seedWolfMakesWolfKing: true }), [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
    ]);
    const p5 = s.players[4]!;
    expect(p5.alive).toBe(true);
    expect(p5.role).toBe('wolfKing');
    expect(p5.converted).toBe(true);
    expect(p5.wolfKingPending).toBe(true);
    expect(s.pendingDeaths).toEqual([]); // 感染擋刀，非死於刀

    const s2 = run(seedCfg({ seedWolfMakesWolfKing: true }), [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(s2.players[4]!.alive).toBe(true); // 死訊公佈後也仍活著（感染不是死亡）
  });

  it('wolfKingPending 期間不出現在 buildNightPlan 的狼隊可行動名單（唯一存活狼即待生效狼王時，wolves 步驟不啟用）', () => {
    // 感染後手動模擬「原生狼與種狼皆已陣亡，僅剩待生效狼王存活」的邊界情境，
    // 驗證 anyWolfAlive 的排除邏輯（正常事件流下 pending 只會存在於白天，這裡是防禦性單元測試）
    const s = run(seedCfg({ seedWolfMakesWolfKing: true }), [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
    ]);
    const forced: GameState = structuredClone(s);
    forced.players.find((p) => p.role === 'werewolf')!.alive = false;
    forced.players.find((p) => p.role === 'seedWolf')!.alive = false;

    const plan = buildNightPlan(forced);
    expect(plan.find((x) => x.id === 'wolves')?.active).toBe(false);

    // 比照 enterNight 的真實行為：stepIndex 落在 skipInactive 後的第一個 active 步驟，
    // 絕不會停在剛被排除的 wolves 步驟上
    forced.phase = { t: 'night', stepIndex: skipInactive(plan, 0) };
    expect(currentNightStep(forced)?.id).not.toBe('wolves');

    const v = validate(forced, { type: 'WOLVES_ACTED', target: 1 });
    expect(v.ok).toBe(false);
  });

  it('下一次進入夜晚後 wolfKingPending 清除，該玩家能正常參與狼隊刀人', () => {
    const s = run(seedCfg({ seedWolfMakesWolfKing: true }), [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: [] },
      { type: 'DAY_ENDED' }, // 進入夜3：狼王正式生效
    ]);
    const p5 = s.players[4]!;
    expect(p5.role).toBe('wolfKing');
    expect(p5.wolfKingPending).toBe(false);
    const plan = buildNightPlan(s);
    expect(plan.find((x) => x.id === 'wolves')?.active).toBe(true);

    // 狼王已能正常參與刀人（不再被排除）
    const s2 = run(seedCfg({ seedWolfMakesWolfKing: true }), [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: [] },
      { type: 'DAY_ENDED' },
      { type: 'WOLVES_ACTED', target: 3 }, // 夜3狼刀（狼王已可正常參與此團體行動）
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 5 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
    ]);
    expect(s2.players[2]!.alive).toBe(false); // 3 號被刀死亡
    expect(s2.seerChecks[s2.seerChecks.length - 1]).toEqual({ night: 3, target: 5, result: 'wolf' });
  });

  it('infectedKeepsSkills 交互：狼王本身無死亡技能，即使感染前是獵人、且開啟保留技能也不能開槍', () => {
    const infectHunter: GameEvent[] = [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 3 }, // 刀獵人
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: ballots([1, 3], [2, 3], [5, 3]) }, // 白天放逐被感染的（狼王化）獵人
    ];
    const lost = run(seedCfg({ seedWolfMakesWolfKing: true }), infectHunter);
    expect(lost.players[2]!.role).toBe('wolfKing');
    expect(lost.players[2]!.alive).toBe(false);
    expect(lost.actionQueue).toEqual([{ kind: 'lastWords', seat: 3 }]); // 沒有槍（角色已不是獵人）

    const kept = run(seedCfg({ seedWolfMakesWolfKing: true, infectedKeepsSkills: true }), infectHunter);
    expect(kept.players[2]!.role).toBe('wolfKing');
    expect(kept.actionQueue).toEqual([{ kind: 'lastWords', seat: 3 }]); // infectedKeepsSkills 對狼王無意義，仍沒有槍
  });

  it('undo/redo：截斷到感染前的重播應完整回復，不留 wolfKing/wolfKingPending 殘留欄位', () => {
    const config = seedCfg({ seedWolfMakesWolfKing: true });
    const events: GameEvent[] = [
      ...night1AndDay,
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'EXILE_VOTED', ballots: [] },
      { type: 'DAY_ENDED' },
      { type: 'WOLVES_ACTED', target: null },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 5 },
      { type: 'NIGHT_ENDED' },
    ];
    const envelopes = toEnvelopes(config, events);

    // undo 到「發動感染」事件之前：回放較短的事件流，狀態必須完全乾淨（無殘留欄位）
    const infectSeq = envelopes.find((e) => e.event.type === 'SEED_WOLF_ACTED')!.seq;
    const beforeInfect = replay(envelopes.filter((e) => e.seq < infectSeq));
    expect(beforeInfect.players[4]!.role).toBe('villager');
    expect(beforeInfect.players[4]!.converted).toBe(false);
    expect(beforeInfect.players[4]!.wolfKingPending).toBe(false);

    // redo（重新 append 完整事件流）與逐事件增量 reduce 必須逐步等價（一致性驗證，同「回放一致性」寫法）
    let incremental: GameState | null = null;
    for (let i = 0; i < envelopes.length; i++) {
      const env = envelopes[i]!;
      incremental =
        i === 0
          ? initialState((env.event as { type: 'GAME_CREATED'; config: never }).config, env.seq, env.at)
          : reduce(incremental!, env);
      expect(replay(envelopes.slice(0, i + 1))).toEqual(incremental);
    }
    expect(incremental!.players[4]!.role).toBe('wolfKing');
    expect(incremental!.players[4]!.wolfKingPending).toBe(false); // 夜3已開始，早已生效
  });
});

describe('新角色：回放一致性', () => {
  it('邱比特+種狼混合劇本：任意截斷點增量 reduce ≡ 全量 replay', () => {
    // 9 人板：1邱 2預 3女 4獵 5-6民 7狼 8狼 9種狼
    const config = makeConfig(
      ['cupid', 'seer', 'witch', 'hunter', 'villager', 'villager', 'werewolf', 'werewolf', 'seedWolf'],
      { victory: 'slaughterCity' },
    );
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 4, b: 7 }, // 獵人+狼 = 跨陣營情侶
      { type: 'WOLVES_ACTED', target: 5 },
      { type: 'WITCH_ACTED', save: true, poison: null },
      { type: 'SEER_ACTED', target: 8 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' }, // 平安夜
      { type: 'EXILE_VOTED', ballots: ballots([1, 8], [2, 8], [3, 8], [4, 8], [5, 8]) },
      { type: 'LAST_WORDS_DONE', seat: 8 },
      { type: 'DAY_ENDED' },
      { type: 'WOLVES_ACTED', target: 6 },
      { type: 'SEED_WOLF_ACTED', infect: true }, // 感染 6 號平民
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 6 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'NOTE_ADDED', text: '6 號行為異常' },
      // 放逐情侶之一的 7 號狼 → 4 號獵人殉情（預設不能開槍；第二天殉情依規則無遺言）
      { type: 'EXILE_VOTED', ballots: ballots([1, 7], [2, 7], [3, 7], [5, 7], [6, 7]) },
      { type: 'LAST_WORDS_DONE', seat: 7 },
      { type: 'DAY_ENDED' },
    ];
    const envelopes = toEnvelopes(config, events);
    let incremental: GameState | null = null;
    for (let i = 0; i < envelopes.length; i++) {
      const env = envelopes[i]!;
      incremental =
        i === 0
          ? initialState((env.event as { type: 'GAME_CREATED'; config: never }).config, env.seq, env.at)
          : reduce(incremental!, env);
      expect(replay(envelopes.slice(0, i + 1))).toEqual(incremental);
    }
    // 劇本尾聲狀態抽查：6 號已轉狼、情侶雙亡、遊戲未結束
    expect(incremental!.players[5]!.converted).toBe(true);
    expect(dead(incremental!).sort((a, b) => a - b)).toEqual([4, 7, 8]);
    expect(incremental!.winner).toBeNull();
  });
});
