import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src';
import { replay, buildGameReport, buildSituationSummary } from '../src';
import { makeConfig, toEnvelopes, ballots, night } from './helpers';

const SEEDWOLF12 = ['seer', 'witch', 'hunter', 'idiot', 'villager', 'villager', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'seedWolf'] as const;
const CUPID12 = ['seer', 'witch', 'hunter', 'cupid', 'villager', 'villager', 'villager', 'villager', 'werewolf', 'werewolf', 'werewolf', 'werewolf'] as const;

function summarize(config: Parameters<typeof toEnvelopes>[0], events: GameEvent[]): string {
  const envelopes = toEnvelopes(config, events);
  return buildSituationSummary(replay(envelopes), buildGameReport(envelopes));
}

describe('buildSituationSummary', () => {
  it('種狼局：角色名、查驗行、投票行、感染標記、規則開關行都在摘要裡', () => {
    const config = makeConfig([...SEEDWOLF12]); // 座位 12 種狼，9/10/11 狼
    const events: GameEvent[] = [
      // 夜1：刀 5（民）、查 9（狼）
      ...night({ wolf: 5, seer: 9 }),
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 5 },
      { type: 'EXILE_VOTED', ballots: ballots([1, null], [2, null], [3, null], [4, null], [6, null], [7, null], [8, null], [9, null], [10, null], [11, null], [12, null]) },
      // 夜2：刀 6 並感染（刀口不死、轉狼）、查 10（狼）
      { type: 'DAY_ENDED' },
      { type: 'WOLVES_ACTED', target: 6 },
      { type: 'SEED_WOLF_ACTED', infect: true },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' }, // 平安夜（感染擋刀）
      { type: 'EXILE_VOTED', ballots: ballots([1, 6], [2, 6], [3, 6], [4, 6], [6, 1], [7, 6], [8, null], [9, null], [10, null], [11, null], [12, null]) },
      { type: 'LAST_WORDS_DONE', seat: 6 },
    ];
    const s = summarize(config, events);

    // 標題與存活統計
    expect(s).toContain('【戰況摘要】');
    expect(s).toContain('存活');
    // 角色中文名（種狼在座位 12）
    expect(s).toContain('種狼');
    expect(s).toContain('預言家');
    // 查驗行（factionOf 語意：查驗結果為「狼人」）
    expect(s).toContain('第 1 夜 查驗 9 號 → 狼人');
    expect(s).toContain('第 2 夜 查驗 10 號 → 狼人');
    // 投票行
    expect(s).toContain('放逐投票');
    expect(s).toContain('6 號被放逐');
    // 感染標記：座位 6 天亮生效後轉狼陣營
    expect(s).toContain('已感染轉狼');
    // 感染者的當前陣營走 factionOf，應顯示狼人陣營
    expect(s).toMatch(/6 號｜平民｜狼人陣營/);
    // 規則開關行
    expect(s).toContain('規則開關：');
    expect(s).toContain('女巫自救');
    expect(s).toContain('屠邊');
    // 死者死因
    expect(s).toContain('被狼人擊殺');
  });

  it('邱比特跨陣營情侶：情侶標記與勝負狀態出現在摘要', () => {
    const config = makeConfig([...CUPID12]); // 座位 4 邱比特，9~12 狼
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'CUPID_LINKED', a: 5, b: 9 }, // 民 + 狼 = 第三方情侶
      { type: 'WOLVES_ACTED', target: 6 },
      { type: 'WITCH_ACTED', save: false, poison: null },
      { type: 'SEER_ACTED', target: 10 },
      { type: 'NIGHT_ENDED' },
      { type: 'DEATHS_ANNOUNCED' },
      { type: 'LAST_WORDS_DONE', seat: 6 },
    ];
    const s = summarize(config, events);

    expect(s).toContain('邱比特');
    // 情侶標記在 5 號與 9 號
    expect(s).toMatch(/5 號.*情侶/);
    expect(s).toMatch(/9 號.*情侶/);
    // 尚未分出勝負
    expect(s).toContain('尚未分出勝負');
    // 查驗行
    expect(s).toContain('第 1 夜 查驗 10 號');
  });

  it('夜晚階段：夜晚進度段落與夜間 buffer 逐欄出現', () => {
    const config = makeConfig([...SEEDWOLF12], { sheriffEnabled: false });
    const events: GameEvent[] = [
      { type: 'NIGHT_STARTED' },
      { type: 'WOLVES_ACTED', target: 5 },
      // 停在女巫步驟之前（種狼首夜不可感染、走過場）：夜晚尚未結束
    ];
    const s = summarize(config, events);
    expect(s).toContain('夜晚進度：');
    expect(s).toContain('狼隊刀口：5 號');
    expect(s).toContain('女巫解藥：未使用');
  });
});
