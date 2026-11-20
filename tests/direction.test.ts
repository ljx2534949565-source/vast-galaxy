import { describe, expect, it } from 'vitest';
import {
  answerOf,
  directionTag,
  flipDirection,
  hintOf,
  normalizeDirection,
  planDirections,
  promptOf,
  resolveDirection
} from '@/utils/direction';
import type { WordItem } from '@/utils/quiz';

const word: WordItem = {
  id: 1,
  word: 'fare',
  phonetic: '/feə(r)/',
  pos: 'n.',
  meaning: '车费，票价；vi. 进展',
  unit: 1,
  lesson: 3
};

describe('背诵方向', () => {
  it('看英文选中文：题目给单词，选项给释义', () => {
    expect(promptOf(word, 'en2zh')).toBe('fare');
    expect(answerOf(word, 'en2zh')).toBe('车费，票价；vi. 进展');
  });

  it('看中文选英文：题目给释义，选项给单词', () => {
    expect(promptOf(word, 'zh2en')).toBe('车费，票价；vi. 进展');
    expect(answerOf(word, 'zh2en')).toBe('fare');
  });

  it('两个方向互为反面，题目和答案不会撞在一起', () => {
    for (const direction of ['en2zh', 'zh2en'] as const) {
      expect(promptOf(word, direction)).not.toBe(answerOf(word, direction));
    }
  });

  it('三档按顺序循环：英→中 → 中→英 → 随机 → 英→中', () => {
    expect(flipDirection('en2zh')).toBe('zh2en');
    expect(flipDirection('zh2en')).toBe('random');
    expect(flipDirection('random')).toBe('en2zh');
  });

  it('随机会被认出来，不会被当成脏数据', () => {
    expect(normalizeDirection('random')).toBe('random');
  });

  it('脏数据按默认方向处理', () => {
    expect(normalizeDirection('zh2en')).toBe('zh2en');
    expect(normalizeDirection('ZH2EN')).toBe('en2zh');
    expect(normalizeDirection(undefined)).toBe('en2zh');
    expect(normalizeDirection(null)).toBe('en2zh');
  });

  it('提示语跟着方向走', () => {
    expect(hintOf('en2zh')).toContain('中文');
    expect(hintOf('zh2en')).toContain('英文');
  });
});

describe('随机方向', () => {
  it('随机档下两种方向各占一半，不会整轮都是同一个方向', () => {
    expect(planDirections('random', 10)).toHaveLength(10);
    const plan = planDirections('random', 10);
    expect(plan.filter((item) => item === 'en2zh')).toHaveLength(5);
    expect(plan.filter((item) => item === 'zh2en')).toHaveLength(5);
  });

  it('奇数题量也不会漏掉一种方向', () => {
    const plan = planDirections('random', 7);
    expect(plan).toHaveLength(7);
    expect(plan).toContain('en2zh');
    expect(plan).toContain('zh2en');
  });

  it('固定档的计划里全是同一个方向', () => {
    expect(planDirections('zh2en', 4)).toEqual(['zh2en', 'zh2en', 'zh2en', 'zh2en']);
  });

  it('随机档单题解析只会给出合法方向', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(['en2zh', 'zh2en']).toContain(resolveDirection('random'));
    }
    expect(resolveDirection('en2zh')).toBe('en2zh');
  });

  it('工具行芯片只在随机档显示，并标出这一题的方向', () => {
    expect(directionTag('en2zh', 'en2zh')).toBe('');
    expect(directionTag('random', 'zh2en')).toBe('随机 · 中→英');
    expect(directionTag('random', 'en2zh')).toBe('随机 · 英→中');
  });
});
