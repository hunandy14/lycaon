import { ROLE_META } from './types/roles';
import type { SeatId } from './types/rules';
import type { GameState } from './types/state';
import { currentNightStep } from './night/plan';
import { activeCandidates, canVoteInElection } from './day/sheriff';

export interface DashboardStats {
  wolves: number;
  gods: number;
  villagers: number;
  aliveTotal: number;
}

export function dashboardStats(state: GameState): DashboardStats {
  const alive = state.players.filter((p) => p.alive);
  return {
    wolves: alive.filter((p) => ROLE_META[p.role].faction === 'wolf').length,
    gods: alive.filter((p) => ROLE_META[p.role].cls === 'god').length,
    villagers: alive.filter((p) => ROLE_META[p.role].cls === 'villager').length,
    aliveTotal: alive.length,
  };
}

export type TargetPurpose =
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
      return notPending(alive.filter((s) => ROLE_META[state.players.find((p) => p.seat === s)!.role].faction === 'wolf'));
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
      const labels = { guard: '守衛請睜眼，選擇守護對象', wolves: '狼人請睜眼，選擇擊殺對象', witch: '女巫請睜眼', seer: '預言家請睜眼，選擇查驗對象' };
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
