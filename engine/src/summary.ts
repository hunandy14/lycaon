import type { Faction } from './types/roles';
import { roleName } from './types/roles';
import type { RuleConfig, SeatId } from './types/rules';
import type { GameState } from './types/state';
import type { GameReport, VoteRoundReport } from './report';
import { factionOf } from './alignment';
import { CAUSE_LABEL } from './day/deaths';
import { fmtCount } from './day/vote';
import { dashboardStats } from './selectors';
import { activeCandidates } from './day/sheriff';
import { currentNightStep, type NightStepId } from './night/plan';
import { BOARD_PRESETS } from './presets';
import { phaseLabel, seatLabel } from './ctx';

/**
 * GM 全知視角的戰況摘要（繁中純文字）。
 * 給 AI 規則助手當「目前戰況」的上下文用——把 GameState 與 GameReport 攤平成人看得懂、
 * AI 讀得動的整局現況。組裝手法對齊 watch.ts 的 buildGhostView（全知範本）：
 * 陣營一律走 factionOf（感染會讓陣營局中改變），角色中文名走 roleName。
 * 純函式、零副作用（不碰 Date.now/Math.random）。
 */

const NIGHT_STEP_LABEL: Record<NightStepId, string> = {
  cupid: '邱比特連結情侶',
  guard: '守衛守護',
  wolves: '狼人擊殺',
  seedWolf: '種狼感染',
  witch: '女巫用藥',
  seer: '預言家查驗',
};

function factionLabel(f: Faction): string {
  return f === 'wolf' ? '狼人陣營' : '好人陣營';
}

function seatOrNone(state: GameState, seat: SeatId | null): string {
  return seat === null ? '無' : seatLabel(state, seat);
}

/** 規則開關逐行（中文語意對照 types/rules.ts 每欄註解） */
function rulesLines(r: RuleConfig): string[] {
  const onOff = (b: boolean) => (b ? '開' : '關');
  const witchSelfSave = { always: '總是可自救', firstNightOnly: '僅首夜可自救', never: '不可自救' }[r.witchSelfSave];
  const lastWords = { firstDayOnly: '僅首日有遺言', always: '總是有遺言', none: '無遺言' }[r.lastWordsOnNightDeath];
  return [
    `- 警長機制：${onOff(r.sheriffEnabled)}`,
    `- 同守同救致死（奶穿）：${onOff(r.guardSaveConflictDies)}`,
    `- 女巫自救：${witchSelfSave}`,
    `- 勝利條件：${r.victory === 'slaughterSide' ? '屠邊' : '屠城'}`,
    `- 夜間死亡遺言：${lastWords}`,
    `- 翻牌白癡再被投票出局：${onOff(r.idiotExiledAgainDies)}`,
    `- 死亡角色夜晚仍走過場：${onOff(r.callDeadRoles)}`,
    `- 殉情的獵人／黑狼王可開槍：${onOff(r.lovesickCanShoot)}`,
    `- 種狼首夜即可感染：${onOff(r.seedWolfFirstNight)}`,
    `- 被感染者保留原技能：${onOff(r.infectedKeepsSkills)}`,
    `- 種狼感染後轉為狼王：${onOff(r.seedWolfMakesWolfKing)}`,
  ];
}

function outcomeLabel(o: VoteRoundReport['outcome']): string {
  switch (o.t) {
    case 'exiled':
      return `${o.seat} 號被放逐${
        o.chained.length ? `（連帶：${o.chained.map((c) => `${c.seat} 號 ${CAUSE_LABEL[c.cause]}`).join('、')}）` : ''
      }`;
    case 'idiotRevealed':
      return `${o.seat} 號翻牌【白癡】免死`;
    case 'elected':
      return `${o.seat} 號當選警長`;
    case 'pk':
      return `平票進入 PK：${o.seats.map((s) => `${s} 號`).join('、')}`;
    case 'none':
      return '無人出局';
  }
}

export function buildSituationSummary(state: GameState, report: GameReport): string {
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  // 1) 標題行
  const stats = dashboardStats(state);
  const total = state.players.length;
  push(
    `【戰況摘要】${phaseLabel(state)}　存活 ${stats.aliveTotal}/${total}（狼 ${stats.wolves}・神 ${stats.gods}・民 ${stats.villagers}）`,
  );

  // 2) 板子與規則開關
  const preset = state.config.presetId ? BOARD_PRESETS.find((p) => p.id === state.config.presetId) : undefined;
  push('', `板子：${preset?.name ?? '自訂局'}　人數：${state.config.playerCount} 人`, '規則開關：', ...rulesLines(state.config.rules));

  // 3) 玩家名冊
  push('', '玩家名冊：');
  for (const p of state.players) {
    const markers: string[] = [];
    if (state.sheriff === p.seat) markers.push('警長');
    if (state.lovers?.includes(p.seat)) markers.push('情侶');
    if (p.converted) markers.push('已感染轉狼');
    if (p.wolfKingPending) markers.push('狼王待生效');
    if (p.idiotRevealed) markers.push('白癡已翻牌');
    const status = p.alive
      ? '存活'
      : `死亡（第 ${p.death!.day} ${p.death!.during === 'night' ? '夜' : '天'}・${CAUSE_LABEL[p.death!.cause]}）`;
    const tail = markers.length ? `｜${markers.join('・')}` : '';
    push(`- ${seatLabel(state, p.seat)}｜${roleName(p.role)}｜${factionLabel(factionOf(p))}｜${status}${tail}`);
  }

  // 4) 警長與競選狀態
  push('', `警長：${state.sheriff !== null ? seatLabel(state, state.sheriff) : '目前無警長'}`);
  if (state.election) {
    const e = state.election;
    push(`競選候選：${e.candidates.length ? e.candidates.map((s) => `${s} 號`).join('、') : '無'}`);
    if (e.withdrawn.length) push(`退水：${e.withdrawn.map((s) => `${s} 號`).join('、')}`);
    if (e.pkSeats) push(`PK 名單：${e.pkSeats.map((s) => `${s} 號`).join('、')}`);
    const active = activeCandidates(state);
    push(`競選狀態：${e.done ? '已結束' : '進行中'}（有效候選：${active.length ? active.map((s) => `${s} 號`).join('、') : '無'}）`);
  }

  // 5) 待處理
  if (state.actionQueue.length) {
    const items = state.actionQueue.map((a) =>
      a.kind === 'lastWords' ? `${a.seat} 號遺言` : a.kind === 'shoot' ? `${a.seat} 號開槍` : '警徽移交',
    );
    push('', `待處理佇列（FIFO 嚴格消化）：${items.join(' → ')}`);
  }
  if (state.pendingDeaths.length) {
    push('', `已結算未公佈死亡：${state.pendingDeaths.map((d) => `${d.seat} 號（${CAUSE_LABEL[d.cause]}）`).join('、')}`);
  }

  // 6) 夜晚進度（僅 phase 為 night）
  if (state.phase.t === 'night') {
    const step = currentNightStep(state);
    push(
      '',
      '夜晚進度：',
      `- 目前步驟：${step ? `${NIGHT_STEP_LABEL[step.id]}${step.active ? '' : '（走過場）'}` : '夜晚行動已完成，待天亮結算'}`,
      `- 守衛守護：${seatOrNone(state, state.night.guardTarget)}`,
      `- 狼隊刀口：${seatOrNone(state, state.night.wolfTarget)}`,
      `- 種狼感染：${state.night.infect ? '本夜發動' : '未發動'}`,
      `- 女巫解藥：${state.night.witchSaved ? '已使用' : '未使用'}`,
      `- 女巫毒藥：${seatOrNone(state, state.night.witchPoison)}`,
      `- 預言家查驗：${seatOrNone(state, state.night.seerTarget)}`,
      `- 昨夜守衛目標：${seatOrNone(state, state.lastGuardTarget)}`,
    );
  }

  // 7) 查驗史
  push('', '查驗紀錄：');
  if (state.seerChecks.length) {
    for (const c of state.seerChecks) {
      push(`- 第 ${c.night} 夜 查驗 ${c.target} 號 → ${c.result === 'wolf' ? '狼人' : '好人'}`);
    }
  } else {
    push('- （尚無查驗）');
  }

  // 8) 投票史
  const rounds: VoteRoundReport[] = [];
  for (const d of report.days) {
    if (d.sheriff) rounds.push(...d.sheriff.rounds);
    rounds.push(...d.exileRounds);
  }
  rounds.sort((a, b) => a.seq - b.seq);
  push('', '投票紀錄：');
  if (rounds.length) {
    for (const r of rounds) {
      const kind = r.kind === 'sheriff' ? '警長競選' : '放逐投票';
      const roundTag = r.round > 1 ? '・PK 輪' : '';
      const detail = r.ballots.length ? r.ballots.map((b) => `${b.voter}→${b.target === null ? '棄' : b.target}`).join('、') : '無人投票';
      const counts = r.counts.length ? r.counts.map((c) => `${c.seat} 號 ${fmtCount(c.votes)} 票`).join('、') : '無有效票';
      push(`- 第 ${r.day} 天 ${kind}${roundTag}｜票型：${detail}｜計票：${counts}｜結果：${outcomeLabel(r.outcome)}`);
    }
  } else {
    push('- （尚無投票）');
  }

  // 9) 勝負
  const w = state.winner;
  const winnerText = w
    ? `${w.faction === 'lovers' ? '第三方情侶' : w.faction === 'wolf' ? '狼人陣營' : '好人陣營'}獲勝 — ${w.reason}`
    : '尚未分出勝負';
  push('', `勝負：${winnerText}`);

  return out.join('\n');
}
