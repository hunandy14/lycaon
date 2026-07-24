import { describe, expect, it } from 'vitest';
import { buildConversation, capSituation, AI_HISTORY_MESSAGES, SITUATION_MAX_CHARS } from '../src/aiPrompt';
import type { AiMessage } from '../src/ai';

const u = (content: string): AiMessage => ({ role: 'user', content });
const a = (content: string): AiMessage => ({ role: 'assistant', content });

describe('buildConversation（送給上游前的對話整理）', () => {
  it('正常交替：原樣保留', () => {
    const h = [u('Q1'), a('A1'), u('Q2'), a('A2')];
    expect(buildConversation(h)).toEqual(h);
  });

  it('空歷史：回空陣列', () => {
    expect(buildConversation([])).toEqual([]);
  });

  it('孤兒提問（連續 user）：丟舊留新、恢復交替', () => {
    const h = [u('Q1'), a('A1'), u('Q2孤兒'), u('Q3')];
    expect(buildConversation(h)).toEqual([u('Q1'), a('A1'), u('Q3')]);
  });

  it('多個連續孤兒：只保留最新一則 user', () => {
    const h = [u('Q1孤兒'), u('Q2孤兒'), u('Q3')];
    expect(buildConversation(h)).toEqual([u('Q3')]);
  });

  it('結果永遠嚴格交替、且以 user 起頭', () => {
    const h = [u('Q1'), u('Q2'), a('A2'), u('Q3'), u('Q4'), a('A4')];
    const out = buildConversation(h);
    expect(out[0]!.role).toBe('user');
    for (let i = 0; i < out.length - 1; i++) expect(out[i]!.role).not.toBe(out[i + 1]!.role);
  });

  it('超過上限：只取最近 AI_HISTORY_MESSAGES 則、且保住最後一則', () => {
    const many: AiMessage[] = [];
    for (let i = 0; i < 40; i++) many.push(i % 2 === 0 ? u(`Q${i}`) : a(`A${i}`));
    const out = buildConversation(many);
    expect(out.length).toBeLessThanOrEqual(AI_HISTORY_MESSAGES);
    expect(out.at(-1)).toEqual(many.at(-1));
  });

  it('近況切片邊界落在 assistant：丟棄開頭 assistant 確保以 user 起頭', () => {
    const many: AiMessage[] = [];
    // 2N+1 則、以 user 開頭交替：切片起點落在 assistant（N 為偶數時）
    for (let i = 0; i <= AI_HISTORY_MESSAGES * 2; i++) many.push(i % 2 === 0 ? u(`Q${i}`) : a(`A${i}`));
    const out = buildConversation(many);
    expect(out[0]!.role).toBe('user');
    for (let i = 0; i < out.length - 1; i++) expect(out[i]!.role).not.toBe(out[i + 1]!.role);
  });
});

describe('capSituation（戰況摘要字數上限）', () => {
  it('未超過上限：原樣回傳', () => {
    const s = '短短的戰況摘要';
    expect(capSituation(s)).toBe(s);
  });

  it('超過上限：截斷前段、附註記，總長受控', () => {
    const s = 'x'.repeat(SITUATION_MAX_CHARS + 500);
    const out = capSituation(s);
    expect(out.startsWith('x'.repeat(SITUATION_MAX_CHARS))).toBe(true);
    expect(out).toContain('已截斷');
    expect(out.length).toBeLessThan(s.length);
  });
});
