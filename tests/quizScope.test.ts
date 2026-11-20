import { beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = new Map<string, unknown>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => (bucket.has(key) ? bucket.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => void bucket.set(key, value),
  removeStorageSync: (key: string) => void bucket.delete(key)
});

const { getQuizLessons, saveQuizLessons } = await import('@/utils/storage');
const { createQuizFrom, distractors, meaningsConflict } = await import('@/utils/quiz');
const words = (await import('@/data/wordsData')).default;

describe('快速测验的抽查范围', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('第一次进来默认全选 40 课', () => {
    const lessons = getQuizLessons();
    expect(lessons).toHaveLength(40);
    expect(lessons[0]).toBe(1);
    expect(lessons[39]).toBe(40);
  });

  it('记住上次勾的那几课，顺序按课号排好', () => {
    saveQuizLessons([18, 3, 32, 3]);
    expect(getQuizLessons()).toEqual([3, 18, 32]);
  });

  it('越界和脏值被丢掉，不会把 99 课写进去', () => {
    saveQuizLessons([0, 1, 41, 2.6, 7]);
    expect(getQuizLessons()).toEqual([1, 7]);
    bucket.set('ky_v1_quiz_scope', ['abc', 5]);
    expect(getQuizLessons()).toEqual([5]);
  });

  it('一个都没勾时不写盘，避免下次进来变成空范围', () => {
    saveQuizLessons([4]);
    saveQuizLessons([]);
    expect(getQuizLessons()).toEqual([4]);
  });

  it('存档损坏时回到全选，而不是空', () => {
    bucket.set('ky_v1_quiz_scope', { broken: true });
    expect(getQuizLessons()).toHaveLength(40);
  });
});

describe('从勾选范围里出题', () => {
  it('只会抽勾选过的课，不会串到别的课', () => {
    const pool = words.filter((word) => word.lesson === 18 || word.lesson === 32);
    const quiz = createQuizFrom(pool, 20);
    expect(quiz).toHaveLength(20);
    for (const question of quiz) {
      expect([18, 32]).toContain(question.word.lesson);
    }
  });

  it('题量超过词池时按词池上限出，不会重复出题', () => {
    const pool = words.filter((word) => word.lesson === 1);
    const quiz = createQuizFrom(pool, 999);
    expect(quiz).toHaveLength(pool.length);
    expect(new Set(quiz.map((item) => item.word.id)).size).toBe(pool.length);
  });

  it('每题五个选项，且干扰项不和正确答案撞意思', () => {
    const pool = words.filter((word) => word.lesson === 5);
    for (const question of createQuizFrom(pool, 10)) {
      expect(question.options).toHaveLength(5);
      expect(question.options.some((option) => option.id === question.word.id)).toBe(true);
      for (const option of question.options) {
        if (option.id === question.word.id) continue;
        expect(meaningsConflict(question.word.meaning, option.meaning)).toBe(false);
      }
    }
  });

  it('空词池不会崩，直接返回空题单', () => {
    expect(createQuizFrom([], 10)).toEqual([]);
    expect(distractors).toBeTypeOf('function');
  });
});
