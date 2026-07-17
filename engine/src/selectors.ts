import { factionOf, clsOf } from './alignment';
import type { Faction } from './types/roles';
import type { SeatId } from './types/rules';
import type { DayStage, GameState, Phase } from './types/state';
import { currentNightStep } from './night/plan';
import { activeCandidates, canVoteInElection } from './day/sheriff';
import { phaseLabel } from './ctx';

export interface DashboardStats {
  wolves: number;
  gods: number;
  villagers: number;
  aliveTotal: number;
}

export function dashboardStats(state: GameState): DashboardStats {
  const alive = state.players.filter((p) => p.alive);
  return {
    wolves: alive.filter((p) => factionOf(p) === 'wolf').length,
    gods: alive.filter((p) => clsOf(p) === 'god').length,
    villagers: alive.filter((p) => clsOf(p) === 'villager').length,
    aliveTotal: alive.length,
  };
}

export const STAGE_LABEL: Record<DayStage, string> = {
  sheriff: '警長競選',
  announce: '公佈死訊',
  speech: '發言・投票',
  pk: 'PK 投票',
  dayEnd: '等待天黑',
};

export interface GameProgress {
  day: number;
  phase: Phase['t'];
  stage: DayStage | null;
  /** 顯示用：「第 2 夜」「第 2 天・發言・投票」「開局」「終局」 */
  label: string;
  alive: number;
  total: number;
  winner: Faction | 'lovers' | null;
}

/** 對局進度摘要（首頁列表等輕量顯示用） */
export function gameProgress(state: GameState): GameProgress {
  const stage = state.phase.t === 'day' ? state.phase.stage : null;
  const label = stage ? `${phaseLabel(state)}・${STAGE_LABEL[stage]}` : phaseLabel(state);
  return {
    day: state.day,
    phase: state.phase.t,
    stage,
    label,
    alive: state.players.filter((p) => p.alive).length,
    total: state.players.length,
    winner: state.winner?.faction ?? null,
  };
}

export type TargetPurpose =
  | 'cupidLink'
  | 'guard'
  | 'wolfKill'
  | 'witchPoison'
  | 'seerCheck'
  | 'shoot'
  | 'duel'
  | 'exile'
  | 'badge'
  | 'explode';

/** 各種選人操作的合法目標（UI 據此灰化 SeatGrid） */
export function eligibleTargets(state: GameState, purpose: TargetPurpose): SeatId[] {
  const alive = state.players.filter((p) => p.alive).map((p) => p.seat);
  const notPending = (seats: SeatId[]) => seats.filter((s) => !state.pendingDeaths.some((d) => d.seat === s));
  switch (purpose) {
    case 'cupidLink':
      return alive;
    case 'guard':
      return alive.filter((s) => s !== state.lastGuardTarget);
    case 'wolfKill':
    case 'witchPoison':
      return alive;
    case 'seerCheck': {
      const seer = state.players.find((p) => p.role === 'seer');
      return alive.filter((s) => s !== seer?.seat);
    }
    case 'shoot': {
      const head = state.actionQueue[0];
      const shooter = head?.kind === 'shoot' ? head.seat : null;
      return notPending(alive.filter((s) => s !== shooter));
    }
    case 'duel': {
      const knight = state.players.find((p) => p.role === 'knight');
      return alive.filter((s) => s !== knight?.seat);
    }
    case 'exile':
      if (state.phase.t === 'day' && state.phase.stage === 'pk') return state.exile?.pkSeats ?? [];
      return alive;
    case 'badge':
      return notPending(alive);
    case 'explode':
      return notPending(alive.filter((s) => factionOf(state.players.find((p) => p.seat === s)!) === 'wolf'));
  }
}

/** 放逐投票的有票者（翻牌白癡與死者除外；PK 輪排除台上玩家） */
export function exileVoters(state: GameState): SeatId[] {
  const pkSeats = state.phase.t === 'day' && state.phase.stage === 'pk' ? state.exile?.pkSeats ?? [] : [];
  return state.players
    .filter((p) => p.alive && p.canVote && !pkSeats.includes(p.seat))
    .map((p) => p.seat);
}

/** 警長競選的有票者 */
export function electionVoters(state: GameState): SeatId[] {
  return state.players.filter((p) => p.alive && canVoteInElection(state, p.seat)).map((p) => p.seat);
}

/** GM 下一步該做什麼的提示文字（儀表板頂部） */
export function nextStepHint(state: GameState): string {
  switch (state.phase.t) {
    case 'setup':
      return '按「天黑請閉眼」開始第一夜';
    case 'ended':
      return state.winner ? state.winner.reason : '對局已中止';
    case 'night': {
      const step = currentNightStep(state);
      if (!step) return '夜晚行動完成，按「天亮」進行結算';
      const labels = {
        cupid: '邱比特請睜眼，連結兩位玩家為情侶',
        guard: '守衛請睜眼，選擇守護對象',
        wolves: '狼人請睜眼，選擇擊殺對象',
        seedWolf: '種狼請睜眼，決定是否感染今晚刀口',
        witch: '女巫請睜眼',
        seer: '預言家請睜眼，選擇查驗對象',
      };
      return labels[step.id];
    }
    case 'day': {
      const head = state.actionQueue[0];
      if (head) {
        if (head.kind === 'lastWords') return `${head.seat} 號發表遺言`;
        if (head.kind === 'shoot') return `${head.seat} 號選擇開槍目標（或放棄）`;
        return '警長死亡：移交或撕毀警徽';
      }
      switch (state.phase.stage) {
        case 'sheriff':
          return state.election!.candidates.length === 0 ? '記錄上警名單（或跳過競選）' : `警長競選：${activeCandidates(state).map((s) => `${s}號`).join('、')}`;
        case 'announce':
          return '宣讀死訊播報稿';
        case 'speech':
          return '發言階段，結束後記錄放逐投票';
        case 'pk':
          return `PK 發言：${state.exile?.pkSeats?.map((s) => `${s}號`).join(' vs ')}，然後再投一輪`;
        case 'dayEnd':
          return '白天結束，按「進入下一夜」';
      }
    }
  }
}
