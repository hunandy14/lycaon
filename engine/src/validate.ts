import { ROLE_META } from './types/roles';
import type { GameEvent } from './types/events';
import type { SeatId } from './types/rules';
import type { GameState } from './types/state';
import { buildNightPlan, currentNightStep } from './night/plan';
import { activeCandidates, canVoteInElection } from './day/sheriff';
import type { Ballot } from './types/events';

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const ok: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });

/**
 * 事件合法性驗證（純函式）。server append 前的權威檢查；client 用同一函式做 UX 預檢。
 * state 為 null 表示尚未建局（只允許 GAME_CREATED）。
 */
export function validate(state: GameState | null, event: GameEvent): ValidationResult {
  if (state === null) {
    return event.type === 'GAME_CREATED' ? ok : fail('對局尚未建立');
  }
  if (event.type === 'GAME_CREATED') return fail('對局已建立，不能重複建局');
  if (event.type === 'NOTE_ADDED') return ok;
  if (state.phase.t === 'ended') return fail('對局已結束');
  if (event.type === 'GAME_ABORTED') return ok;

  // 待辦佇列非空時，只能消化佇列頭
  const head = state.actionQueue[0];
  if (head) {
    switch (event.type) {
      case 'LAST_WORDS_DONE':
        if (head.kind !== 'lastWords') return fail('目前待辦不是遺言');
        if (head.seat !== event.seat) return fail(`目前輪到 ${head.seat} 號的遺言`);
        return ok;
      case 'SHOT_FIRED': {
        if (head.kind !== 'shoot') return fail('目前待辦不是開槍');
        if (head.seat !== event.shooter) return fail(`目前輪到 ${head.seat} 號開槍`);
        if (event.target === null) return ok;
        const t = seatOf(state, event.target);
        if (!t) return fail('目標座位不存在');
        if (!t.alive) return fail('不能對已死亡的玩家開槍');
        if (event.target === event.shooter) return fail('不能對自己開槍');
        if (isPendingDead(state, event.target)) return fail('該玩家昨晚已死亡（死訊尚未公佈），不能成為目標');
        return ok;
      }
      case 'BADGE_TRANSFERRED': {
        if (head.kind !== 'badge') return fail('目前待辦不是警徽移交');
        if (event.to === null) return ok;
        const t = seatOf(state, event.to);
        if (!t) return fail('目標座位不存在');
        if (!t.alive) return fail('警徽只能移交給存活玩家');
        if (isPendingDead(state, event.to)) return fail('該玩家昨晚已死亡（死訊尚未公佈），不能接受警徽');
        return ok;
      }
      default:
        return fail(queueHint(head));
    }
  }

  switch (event.type) {
    case 'LAST_WORDS_DONE':
    case 'SHOT_FIRED':
    case 'BADGE_TRANSFERRED':
      return fail('目前沒有待處理的出局事項');

    case 'NIGHT_STARTED':
      return state.phase.t === 'setup' ? ok : fail('只有開局時才用「天黑請閉眼」，白天結束請用「進入下一夜」');

    case 'GUARD_ACTED': {
      const step = requireNightStep(state, 'guard');
      if (step !== true) return step;
      if (event.target === null) return ok; // 空守
      const t = seatOf(state, event.target);
      if (!t) return fail('目標座位不存在');
      if (!t.alive) return fail('不能守護已死亡的玩家');
      if (event.target === state.lastGuardTarget) return fail('守衛不能連續兩晚守護同一人');
      return ok;
    }

    case 'WOLVES_ACTED': {
      const step = requireNightStep(state, 'wolves');
      if (step !== true) return step;
      if (event.target === null) return ok; // 空刀
      const t = seatOf(state, event.target);
      if (!t) return fail('目標座位不存在');
      if (!t.alive) return fail('不能擊殺已死亡的玩家');
      return ok;
    }

    case 'WITCH_ACTED': {
      const step = requireNightStep(state, 'witch');
      if (step !== true) return step;
      if (event.save && event.poison !== null) return fail('女巫一晚只能使用一瓶藥');
      if (event.save) {
        if (state.night.wolfTarget === null) return fail('今晚狼人空刀，沒有可以救的對象');
        if (!state.potions.antidote) return fail('解藥已經用完了');
        const witch = state.players.find((p) => p.role === 'witch');
        if (witch && state.night.wolfTarget === witch.seat) {
          const rule = state.config.rules.witchSelfSave;
          if (rule === 'never') return fail('規則設定：女巫不能自救');
          if (rule === 'firstNightOnly' && state.day > 1) return fail('規則設定：女巫只有首夜可以自救');
        }
      }
      if (event.poison !== null) {
        if (!state.potions.poison) return fail('毒藥已經用完了');
        const t = seatOf(state, event.poison);
        if (!t) return fail('目標座位不存在');
        if (!t.alive) return fail('不能毒殺已死亡的玩家');
      }
      return ok;
    }

    case 'SEER_ACTED': {
      const step = requireNightStep(state, 'seer');
      if (step !== true) return step;
      const t = seatOf(state, event.target);
      if (!t) return fail('目標座位不存在');
      if (!t.alive) return fail('不能查驗已死亡的玩家');
      const seer = state.players.find((p) => p.role === 'seer');
      if (seer && event.target === seer.seat) return fail('預言家不能查驗自己');
      return ok;
    }

    case 'NIGHT_ENDED': {
      if (state.phase.t !== 'night') return fail('現在不是夜晚');
      const plan = buildNightPlan(state);
      if (state.phase.stepIndex < plan.length) return fail('夜晚行動尚未全部完成');
      return ok;
    }

    case 'SHERIFF_NOMINATED': {
      const e = requireSheriffStage(state);
      if (e !== true) return e;
      if (state.election!.candidates.length > 0) return fail('上警名單已經確認過了');
      if (event.candidates.length === 0) return fail('上警名單不能為空（無人上警請用「跳過競選」）');
      if (new Set(event.candidates).size !== event.candidates.length) return fail('上警名單有重複座位');
      for (const s of event.candidates) {
        const p = seatOf(state, s);
        if (!p) return fail(`座位 ${s} 不存在`);
        if (!p.alive) return fail(`${s} 號已死亡，不能上警`);
      }
      return ok;
    }

    case 'SHERIFF_WITHDRAWN': {
      const e = requireSheriffStage(state);
      if (e !== true) return e;
      if (!activeCandidates(state).includes(event.seat)) return fail(`${event.seat} 號不在競選名單中`);
      return ok;
    }

    case 'SHERIFF_VOTED': {
      const e = requireSheriffStage(state);
      if (e !== true) return e;
      if (state.election!.candidates.length === 0) return fail('請先確認上警名單');
      const candidates = activeCandidates(state);
      if (candidates.length <= 1) {
        return event.ballots.length === 0 ? ok : fail('競選人不足兩人，無需投票，直接確認即可');
      }
      return validateBallots(state, event.ballots, {
        canVote: (v) => canVoteInElection(state, v),
        cantVoteReason: '上警未退水者與死亡玩家不能投票',
        validTargets: candidates,
      });
    }

    case 'SHERIFF_ELECTION_SKIPPED': {
      const e = requireSheriffStage(state);
      return e === true ? ok : e;
    }

    case 'DEATHS_ANNOUNCED':
      if (state.phase.t !== 'day' || state.phase.stage !== 'announce') return fail('現在不是公佈死訊的時機');
      return ok;

    case 'EXILE_VOTED': {
      if (state.phase.t !== 'day') return fail('現在不是白天');
      const stage = state.phase.stage;
      if (stage !== 'speech' && stage !== 'pk') return fail('現在不是放逐投票的時機');
      const pkSeats = stage === 'pk' ? state.exile?.pkSeats ?? [] : null;
      return validateBallots(state, event.ballots, {
        canVote: (v) => {
          const p = seatOf(state, v);
          return !!p && p.alive && p.canVote && (pkSeats === null || !pkSeats.includes(v));
        },
        cantVoteReason: '死亡玩家、翻牌白癡與 PK 台上玩家不能投票',
        validTargets: pkSeats ?? state.players.filter((p) => p.alive).map((p) => p.seat),
      });
    }

    case 'DAY_ENDED':
      if (state.phase.t !== 'day' || state.phase.stage !== 'dayEnd') return fail('白天流程尚未完成');
      return ok;

    case 'KNIGHT_DUELED': {
      if (state.phase.t !== 'day' || state.phase.stage !== 'speech') return fail('騎士只能在白天發言階段翻牌決鬥');
      const knight = seatOf(state, event.knight);
      if (!knight || knight.role !== 'knight') return fail(`${event.knight} 號不是騎士`);
      if (!knight.alive) return fail('騎士已死亡');
      if (knight.skillUsed) return fail('騎士已經用過決鬥技能');
      const t = seatOf(state, event.target);
      if (!t) return fail('目標座位不存在');
      if (!t.alive) return fail('不能決鬥已死亡的玩家');
      if (event.target === event.knight) return fail('騎士不能決鬥自己');
      return ok;
    }

    case 'WOLF_EXPLODED': {
      if (state.phase.t !== 'day') return fail('只能在白天自爆');
      const stage = state.phase.stage;
      if (stage !== 'sheriff' && stage !== 'speech') return fail('只能在警長競選或發言階段自爆');
      const p = seatOf(state, event.seat);
      if (!p) return fail('座位不存在');
      if (!p.alive) return fail('該玩家已死亡');
      if (ROLE_META[p.role].faction !== 'wolf') return fail('只有狼人陣營可以自爆');
      if (isPendingDead(state, event.seat)) return fail('該玩家昨晚已死亡（死訊尚未公佈），不能自爆');
      return ok;
    }
  }
}

function seatOf(state: GameState, seat: SeatId) {
  return state.players.find((p) => p.seat === seat);
}

function isPendingDead(state: GameState, seat: SeatId): boolean {
  return state.pendingDeaths.some((d) => d.seat === seat);
}

function queueHint(head: NonNullable<GameState['actionQueue'][number]>): string {
  switch (head.kind) {
    case 'lastWords':
      return `請先處理 ${head.seat} 號的遺言`;
    case 'shoot':
      return `請先處理 ${head.seat} 號的開槍`;
    case 'badge':
      return '請先處理警徽移交';
  }
}

function requireNightStep(state: GameState, id: 'guard' | 'wolves' | 'witch' | 'seer'): true | ValidationResult {
  if (state.phase.t !== 'night') return fail('現在不是夜晚');
  const step = currentNightStep(state);
  if (!step) return fail('夜晚行動已全部完成，請天亮');
  if (step.id !== id) return fail(`現在輪到${STEP_LABEL[step.id]}行動`);
  return true;
}

const STEP_LABEL = { guard: '守衛', wolves: '狼人', witch: '女巫', seer: '預言家' } as const;

function requireSheriffStage(state: GameState): true | ValidationResult {
  if (state.phase.t !== 'day' || state.phase.stage !== 'sheriff') return fail('現在不是警長競選階段');
  if (!state.election || state.election.done) return fail('警長競選已結束');
  return true;
}

function validateBallots(
  state: GameState,
  ballots: Ballot[],
  opts: { canVote: (voter: SeatId) => boolean; cantVoteReason: string; validTargets: SeatId[] },
): ValidationResult {
  const voters = new Set<SeatId>();
  for (const b of ballots) {
    if (voters.has(b.voter)) return fail(`${b.voter} 號重複投票`);
    voters.add(b.voter);
    if (!seatOf(state, b.voter)) return fail(`座位 ${b.voter} 不存在`);
    if (!opts.canVote(b.voter)) return fail(`${b.voter} 號沒有投票資格（${opts.cantVoteReason}）`);
    if (b.target !== null && !opts.validTargets.includes(b.target)) {
      return fail(`${b.voter} 號的投票目標 ${b.target} 號不合法`);
    }
  }
  return { ok: true };
}
