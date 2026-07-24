/**
 * AI 規則助手的 system prompt 組裝。
 * 開頭繁中指示 + 引擎規則檔原文（唯一規則權威）+【目前戰況】。
 * 規則檔原文在模組層一次讀入快取（原始碼是靜態資源，行程生命週期內不變）。
 * 路徑一律以 import.meta.url 解析（與 process.cwd 無關）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AiMessage } from './ai';

/** 帶進 prompt 的引擎規則檔（相對 engine/src 的路徑，兼作原文前的檔名標題） */
const RULE_FILES = [
  'types/roles.ts',
  'types/rules.ts',
  'presets.ts',
  'night/plan.ts',
  'night/settle.ts',
  'day/deaths.ts',
  'day/vote.ts',
  'day/sheriff.ts',
  'victory.ts',
];

function loadRuleSources(): { name: string; source: string }[] {
  return RULE_FILES.map((rel) => {
    let source: string;
    try {
      source = readFileSync(fileURLToPath(new URL(`../../engine/src/${rel}`, import.meta.url)), 'utf8');
    } catch {
      source = '（原始碼讀取失敗）';
    }
    return { name: `engine/src/${rel}`, source };
  });
}

const RULE_SOURCES = loadRuleSources();

const INSTRUCTION = [
  '你是一位「狼人殺（線下桌遊）GM」的規則助手。',
  '請嚴格遵守：',
  '1. 只依據下方【引擎原始碼】與【目前戰況】回答——這套引擎的實作就是本局規則的唯一權威。',
  '2. 原始碼未定義到的細節，直接回答「規則未定義，由 GM 裁定」，不要臆測。',
  '3. 禁止拿其他版本、其他桌的狼人殺規則腦補；只認這份引擎。',
  '4. 回答要精簡、直接，適合牌局現場快讀，不長篇大論。',
  '5. 一律使用繁體中文。',
].join('\n');

export function buildSystemPrompt(situation: string): string {
  const code = RULE_SOURCES.map((f) => `// ===== ${f.name} =====\n${f.source}`).join('\n\n');
  return `${INSTRUCTION}\n\n【引擎原始碼】\n${code}\n\n【目前戰況】\n${situation}`;
}

/**
 * 戰況摘要字數上限：越大的板子、越久的局，buildSituationSummary 的投票／查驗史越長，
 * 疊上固定塞入的引擎原始碼後容易撞小模型的 context 上限（表現為上游 502）。
 * 超過就截斷後段（摘要前段是當前盤面／名冊等最關鍵狀態，投票史在後段可捨）。
 */
export const SITUATION_MAX_CHARS = 8000;

export function capSituation(situation: string): string {
  if (situation.length <= SITUATION_MAX_CHARS) return situation;
  return `${situation.slice(0, SITUATION_MAX_CHARS)}\n…（戰況過長，已截斷後段歷史）`;
}

/**
 * 送給上游的近況對話則數上限：AI 房歷史會隨 GM 問答無限累積（listChat 上限 200 則），
 * 全塞進 messages 會隨局齡逐漸撞 context 上限。只取最近 N 則（約 N/2 輪問答）。
 */
export const AI_HISTORY_MESSAGES = 24;

/**
 * 把 AI 房歷史整理成送給上游的對話陣列（system 之後接這段）：
 * 1) 只取最近 AI_HISTORY_MESSAGES 則（限制隨局齡膨脹）；
 * 2) 必須以 user 開頭、user/assistant 嚴格交替——相鄰同角色只保留最新一則。
 *    連續兩則 user 代表「前一次上游失敗留下的孤兒提問」（問題已入歷史卻沒有對應回覆），
 *    若原封不動送出會破壞 Llama 系嚴格交替 chat template（常直接報錯），一旦命中就讓整局
 *    AI 助手永久卡在 502；丟舊留新即可自癒，且永遠保住最新這則問題。
 *    開頭若為 assistant（近況切片剛好切在回覆上）一併丟棄，確保以 user 起頭。
 */
export function buildConversation(history: AiMessage[]): AiMessage[] {
  const recent = history.slice(-AI_HISTORY_MESSAGES);
  const out: AiMessage[] = [];
  for (const m of recent) {
    if (out.length === 0 && m.role !== 'user') continue;
    if (out.length > 0 && out[out.length - 1]!.role === m.role) out[out.length - 1] = m;
    else out.push(m);
  }
  return out;
}
