import { ROLE_META, roleName } from './types/roles';
import { factionOf } from './alignment';
import { checkVictory } from './victory';
import type { EventEnvelope } from './types/events';
import type { GameConfig } from './types/rules';
import { EMPTY_NIGHT, type GameState } from './types/state';
import { buildNightPlan, skipInactive } from './night/plan';
import { settleNight } from './night/settle';
import { buildDawnAnnouncement } from './announce';
import { applyDeath } from './day/deaths';
import { resolveExileVote } from './day/vote';
import { resolveSheriffVote, transferBadge } from './day/sheriff';
import { validate } from './validate';
import { pushLog, seatLabel, type Ctx } from './ctx';

export class EngineError extends Error {}

export function initialState(config: GameConfig, seq: number, at: string): GameState {
  const hasWitch = config.seats.some((s) => s.role === 'witch');
  const state: GameState = {
    config,
    day: 0,
    phase: { t: 'setup' },
    players: [...config.seats]
      .sort((a, b) => a.seat - b.seat)
      .map((s) => ({
        seat: s.seat,
        role: s.role,
        name: s.name,
        alive: true,
        idiotRevealed: false,
        converted: false,
        wolfKingPending: false,
        canVote: true,
        skillUsed: false,
      })),
    night: { ...EMPTY_NIGHT },
    lastGuardTarget: null,
    lovers: null,
    seedWolfUsedOnNight: null,
    potions: { antidote: hasWitch, poison: hasWitch },
    pendingDeaths: [],
    actionQueue: [],
    sheriff: null,
    election: null,
    exile: null,
    dayInterrupted: false,
    seerChecks: [],
    winner: null,
    log: [],
  };
  const ctx: Ctx = { state, seq, at };
  pushLog(ctx, `對局建立：${config.playerCount} 人局`, false);
  return state;
}

/** 進入夜晚（首夜或白天結束後），重置夜晚暫存並定位到第一個 active 步驟 */
function enterNight(ctx: Ctx): void {
  const { state } = ctx;
  state.day += 1;
  state.night = { ...EMPTY_NIGHT };
  state.exile = null;
  state.dayInterrupted = false;
  // 上一夜轉換的狼王正式生效：本夜起可加入狼隊刀人
  for (const p of state.players) p.wolfKingPending = false;
  state.phase = { t: 'night', stepIndex: 0 };
  state.phase.stepIndex = skipInactive(buildNightPlan(state), 0);
  pushLog(ctx, `天黑請閉眼（第 ${state.day} 夜）`, false);
}

/** 夜晚行動完成後前進到下一個 active 步驟 */
function advanceNight(state: GameState): void {
  if (state.phase.t !== 'night') return;
  state.phase.stepIndex = skipInactive(buildNightPlan(state), state.phase.stepIndex + 1);
}

/**
 * 狀態轉移。事件先過 validate（不合法拋 EngineError），
 * 再以 structuredClone 產生新 state（原 state 不變）。
 */
export function reduce(state: GameState, envelope: EventEnvelope): GameState {
  const { event, seq, at } = envelope;
  const v = validate(state, event);
  if (!v.ok) throw new EngineError(v.reason);

  const next = structuredClone(state);
  const ctx: Ctx = { state: next, seq, at };

  switch (event.type) {
    case 'GAME_CREATED':
      throw new EngineError('對局已建立，不能重複建局'); // validate 已擋，防禦性保留

    case 'NIGHT_STARTED':
      enterNight(ctx);
      break;

    case 'CUPID_LINKED': {
      next.lovers = event.a < event.b ? [event.a, event.b] : [event.b, event.a];
      pushLog(ctx, `💘 邱比特將 ${seatLabel(next, event.a)}與 ${seatLabel(next, event.b)}連結為情侶`, true);
      advanceNight(next);
      break;
    }

    case 'SEED_WOLF_ACTED':
      if (event.infect) {
        next.night.infect = true;
        next.seedWolfUsedOnNight = next.day;
        pushLog(ctx, `🦠 種狼發動感染：今晚刀口 ${seatLabel(next, next.night.wolfTarget!)}將轉入狼人陣營`, true);
      } else {
        pushLog(ctx, '種狼今晚不發動感染', true);
      }
      advanceNight(next);
      break;

    case 'GUARD_ACTED':
      next.night.guardTarget = event.target;
      pushLog(ctx, event.target === null ? '守衛今晚空守' : `守衛守護 ${seatLabel(next, event.target)}`, true);
      advanceNight(next);
      break;

    case 'WOLVES_ACTED':
      next.night.wolfTarget = event.target;
      pushLog(ctx, event.target === null ? '狼人今晚空刀' : `狼人擊殺 ${seatLabel(next, event.target)}`, true);
      advanceNight(next);
      break;

    case 'WITCH_ACTED':
      if (event.save) {
        next.night.witchSaved = true;
        next.potions.antidote = false;
        pushLog(ctx, `女巫使用解藥救 ${seatLabel(next, next.night.wolfTarget!)}`, true);
      } else if (event.poison !== null) {
        next.night.witchPoison = event.poison;
        next.potions.poison = false;
        pushLog(ctx, `女巫毒殺 ${seatLabel(next, event.poison)}`, true);
      } else {
        pushLog(ctx, '女巫今晚不用藥', true);
      }
      advanceNight(next);
      break;

    case 'SEER_ACTED': {
      next.night.seerTarget = event.target;
      const result = factionOf(next.players.find((p) => p.seat === event.target)!);
      next.seerChecks.push({ night: next.day, target: event.target, result });
      pushLog(ctx, `預言家查驗 ${seatLabel(next, event.target)}：${result === 'wolf' ? '狼人 🐺' : '好人 ✋'}`, true);
      advanceNight(next);
      break;
    }

    case 'NIGHT_ENDED': {
      next.pendingDeaths = settleNight(next);
      next.lastGuardTarget = next.night.guardTarget;
      // 種狼感染於天亮生效：刀口轉入狼人陣營（同夜被毒仍會死，見 settleNight）
      if (next.night.infect && next.night.wolfTarget !== null) {
        const infected = next.players.find((p) => p.seat === next.night.wolfTarget)!;
        const prevRoleName = roleName(infected.role);
        infected.converted = true;
        if (next.config.rules.seedWolfMakesWolfKing) {
          infected.role = 'wolfKing';
          infected.wolfKingPending = true;
          pushLog(
            ctx,
            `🦠 ${seatLabel(next, infected.seat)}【${prevRoleName}】已被感染，蛻變為狼王（下一夜起才能加入刀人）`,
            true,
          );
        } else {
          pushLog(ctx, `🦠 ${seatLabel(next, infected.seat)}【${prevRoleName}】已被感染，加入狼人陣營`, true);
        }
      }
      const summary =
        next.pendingDeaths.length === 0
          ? '夜晚結算：平安夜'
          : `夜晚結算：${next.pendingDeaths.map((d) => `${d.seat} 號死亡`).join('、')}`;
      pushLog(ctx, summary, true);

      const needElection = next.day === 1 && next.config.rules.sheriffEnabled;
      if (needElection) {
        next.election = { candidates: [], withdrawn: [], pkSeats: null, round: 1, done: false };
        next.phase = { t: 'day', stage: 'sheriff' };
        pushLog(ctx, '天亮了，進入警長競選', false);
      } else {
        // 不記「天亮了」——死訊公佈（DEATHS_ANNOUNCED）那句「天亮了。昨晚死亡…」已含此意，避免重複
        next.phase = { t: 'day', stage: 'announce' };
      }
      break;
    }

    case 'SHERIFF_NOMINATED':
      next.election!.candidates = [...event.candidates].sort((a, b) => a - b);
      pushLog(ctx, `上警：${next.election!.candidates.map((s) => `${s} 號`).join('、')}`, false);
      break;

    case 'SHERIFF_WITHDRAWN':
      next.election!.withdrawn.push(event.seat);
      pushLog(ctx, `${seatLabel(next, event.seat)}退水`, false);
      break;

    case 'SHERIFF_VOTED':
      resolveSheriffVote(ctx, event.ballots);
      break;

    case 'SHERIFF_ELECTION_SKIPPED':
      next.election!.done = true;
      next.phase = { t: 'day', stage: 'announce' };
      pushLog(ctx, '跳過警長競選，本局無警長', false);
      break;

    case 'DEATHS_ANNOUNCED': {
      pushLog(ctx, buildDawnAnnouncement(next), false);
      // 套用期間保留 pendingDeaths：殉情級聯據此避開「另一半本來就會死」的情況（保留真實死因）
      const deaths = [...next.pendingDeaths].sort((a, b) => a.seat - b.seat);
      for (const d of deaths) applyDeath(ctx, d.seat, d.cause, d.poisoned, 'night');
      next.pendingDeaths = [];
      // 感染造成的陣營改變也可能達成屠邊（例如最後一個神被感染），死亡結算後補查一次
      if (!next.winner) {
        const v = checkVictory(next);
        if (v) {
          next.winner = v;
          next.actionQueue = [];
          next.phase = { t: 'ended' };
          pushLog(ctx, `遊戲結束：${v.reason}`, false);
        }
      }
      if (next.phase.t !== 'ended') {
        next.phase = { t: 'day', stage: next.dayInterrupted ? 'dayEnd' : 'speech' };
      }
      break;
    }

    case 'EXILE_VOTED':
      resolveExileVote(ctx, event.ballots);
      break;

    case 'DAY_ENDED':
      enterNight(ctx);
      break;

    case 'LAST_WORDS_DONE':
      next.actionQueue.shift();
      pushLog(ctx, `${seatLabel(next, event.seat)}遺言結束`, false);
      break;

    case 'SHOT_FIRED': {
      const via = (next.actionQueue.shift() as { via: 'hunter' | 'blackWolfKing' | 'whiteWolfExplode' }).via;
      const label = via === 'whiteWolfExplode' ? '白狼王自爆帶走' : `【${roleName(via)}】開槍帶走`;
      if (event.target === null) {
        // 不亮牌就沒人知道有槍：放棄開槍是祕密（公開會反向暴露死者是獵人/狼王）
        pushLog(ctx, `${seatLabel(next, event.shooter)}放棄${via === 'whiteWolfExplode' ? '帶人' : '開槍'}`, true);
      } else {
        const shooter = next.players.find((p) => p.seat === event.shooter)!;
        shooter.skillUsed = true; // 亮牌開槍 = 自曝身分（觀戰端據此亮牌）
        pushLog(ctx, `${seatLabel(next, event.shooter)}${label} ${seatLabel(next, event.target)}`, false);
        applyDeath(ctx, event.target, 'shot', false, 'day');
      }
      break;
    }

    case 'KNIGHT_DUELED': {
      const knight = next.players.find((p) => p.seat === event.knight)!;
      knight.skillUsed = true;
      const targetIsWolf = ROLE_META[next.players.find((p) => p.seat === event.target)!.role].faction === 'wolf';
      if (targetIsWolf) {
        pushLog(ctx, `${seatLabel(next, event.knight)}翻牌【騎士】決鬥 ${seatLabel(next, event.target)}：是狼人，決鬥成功！直接進入黑夜`, false);
        applyDeath(ctx, event.target, 'duel', false, 'day');
        if (next.phase.t !== 'ended') {
          next.dayInterrupted = true;
          next.phase = { t: 'day', stage: 'dayEnd' };
        }
      } else {
        pushLog(ctx, `${seatLabel(next, event.knight)}翻牌【騎士】決鬥 ${seatLabel(next, event.target)}：是好人，騎士以身殉職`, false);
        applyDeath(ctx, event.knight, 'duel', false, 'day');
      }
      break;
    }

    case 'WOLF_EXPLODED': {
      pushLog(ctx, `${seatLabel(next, event.seat)}自爆！`, false);
      next.dayInterrupted = true;
      if (next.phase.t === 'day' && next.phase.stage === 'sheriff') {
        next.election!.done = true;
        next.phase = { t: 'day', stage: 'announce' };
        pushLog(ctx, '警長競選因自爆中止，本局無警長', false);
      } else if (next.phase.t === 'day') {
        next.phase = { t: 'day', stage: 'dayEnd' };
      }
      applyDeath(ctx, event.seat, 'explode', false, 'day');
      break;
    }

    case 'BADGE_TRANSFERRED':
      next.actionQueue.shift();
      transferBadge(ctx, event.to);
      break;

    case 'NOTE_ADDED':
      pushLog(ctx, `📝 ${event.text}`, true, 'note');
      break;

    case 'GAME_ABORTED':
      next.phase = { t: 'ended' };
      pushLog(ctx, `對局中止${event.reason ? `：${event.reason}` : ''}`, false);
      break;
  }

  return next;
}

/** 從完整事件流重建狀態；首筆必須是 GAME_CREATED */
export function replay(envelopes: EventEnvelope[]): GameState {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  const first = sorted[0];
  if (!first || first.event.type !== 'GAME_CREATED') {
    throw new EngineError('事件流的第一筆必須是 GAME_CREATED');
  }
  let state = initialState(first.event.config, first.seq, first.at);
  for (const env of sorted.slice(1)) state = reduce(state, env);
  return state;
}
