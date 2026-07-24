/**
 * AI 規則助手的 system prompt 組裝。
 * 開頭繁中指示 + 引擎規則檔原文（唯一規則權威）+【目前戰況】。
 * 規則檔原文在模組層一次讀入快取（原始碼是靜態資源，行程生命週期內不變）。
 * 路徑一律以 import.meta.url 解析（與 process.cwd 無關）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
