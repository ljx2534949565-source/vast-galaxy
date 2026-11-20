import { describe, expect, it } from 'vitest';
import words from '@/data/wordsData';
import { distractors, meaningsConflict, meaningSegments } from '@/utils/quiz';

describe('相似释义识别', () => {
  it('拆分义项时去掉词性标签', () => {
    expect(meaningSegments('adv. 勉强才能；几乎不；仅仅')).toEqual(['勉强才能', '几乎不', '仅仅']);
  });

  it('截图里的 barely：两个「几乎不」不能同时出现', () => {
    expect(meaningsConflict('勉强才能；几乎不；仅仅', '几乎不；刚… 就…')).toBe(true);
  });

  it('截图里的 occur：发生 / 突然发生不能同时出现', () => {
    expect(meaningsConflict('突然发生，爆发', '发生；出现；存在')).toBe(true);
  });

  it('意思确实不同的释义不会被误杀', () => {
    expect(meaningsConflict('立法；制定法律', '发生；出现；存在')).toBe(false);
    expect(meaningsConflict('脸红；n. 红晕；腮红', '晕倒；adj. 微弱的；n. 昏厥')).toBe(false);
  });
});

describe('选项生成', () => {
  it('四个干扰项都不和正确答案撞意思', () => {
    for (const word of words) {
      const options = distractors(word, 4);
      expect(options).toHaveLength(4);
      for (const option of options) {
        expect(option.id).not.toBe(word.id);
        expect(meaningsConflict(word.meaning, option.meaning)).toBe(false);
      }
    }
  });

  it('干扰项彼此之间也不撞意思', () => {
    for (const word of words) {
      const options = distractors(word, 4);
      for (let i = 0; i < options.length; i += 1) {
        for (let j = i + 1; j < options.length; j += 1) {
          expect(meaningsConflict(options[i].meaning, options[j].meaning)).toBe(false);
        }
      }
    }
  });
});
