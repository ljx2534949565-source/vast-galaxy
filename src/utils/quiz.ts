import words from '@/data/wordsData';

export interface WordItem {
  id: number;
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  unit: number;
  /** 词库自带，用来切「按课」的块；手写测试数据可以不带 */
  lesson?: number;
}
export interface QuizQuestion {
  word: WordItem;
  options: WordItem[];
}

export function shuffle<T>(input: T[]): T[] {
  const result = [...input];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** 释义里的词性标签：选选项时不参与相似度判断，否则「n. 红晕」和「n. 脸红」只差词性 */
const POS_TAG = /\b(?:adv|adj|n|v|vt|vi|prep|conj|pron|num|art|int|aux)\.\s*/gi;
/** 一个释义内部的义项分隔符：「勉强才能；几乎不；仅仅」会被拆成三个义项 */
const MEANING_SPLIT = /[；;，,、/／|（）()【】\[\]·…—\-]+/;

/** 把释义拆成义项，短于两个字的（「刚」「就」）信息量太低，不参与比较 */
export function meaningSegments(meaning: string): string[] {
  return String(meaning || '')
    .replace(POS_TAG, ' ')
    .split(MEANING_SPLIT)
    .map((segment) => segment.replace(/\s+/g, '').trim())
    .filter((segment) => segment.length >= 2);
}

/** 最长公共子串：中文里两个字连续相同，基本就是同一个意思了 */
function longestCommonRun(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  let best = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best;
}

/**
 * 两个释义是不是「换个说法而已」：
 * - 有完全相同的义项（几乎不 / 几乎不）
 * - 一个义项包含另一个（发生 ⊂ 突然发生）
 * - 任意连续两个汉字相同（突然发生 ↔ 发生；出现；存在）
 * 只要命中一条，就不该同时出现在同一道题的选项里。
 */
export function meaningsConflict(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const a = meaningSegments(left);
  const b = meaningSegments(right);
  if (!a.length || !b.length) return false;
  for (const one of a) {
    for (const other of b) {
      if (one === other) return true;
      if (one.includes(other) || other.includes(one)) return true;
      if (longestCommonRun(one, other) >= 2) return true;
    }
  }
  return false;
}

/**
 * 干扰项：优先同词性，但必须和正确答案、以及彼此之间都不「撞意思」。
 * 截图里 barely 的「几乎不」和「几乎不；刚… 就…」同时出现，就是只按整串去重造成的。
 */
export function distractors(target: WordItem, count = 3): WordItem[] {
  const selected: WordItem[] = [];
  const usedIds = new Set<number>([target.id]);
  const usedMeanings = new Set<string>([target.meaning.trim().toLowerCase()]);
  const samePos = shuffle(words.filter((item) => item.pos === target.pos));
  const ordered = [...samePos, ...shuffle(words)];

  const take = (allowPairConflict: boolean) => {
    for (const item of ordered) {
      if (selected.length >= count) return;
      if (usedIds.has(item.id)) continue;
      const key = item.meaning.trim().toLowerCase();
      if (usedMeanings.has(key)) continue;
      if (meaningsConflict(target.meaning, item.meaning)) continue;
      if (!allowPairConflict && selected.some((picked) => meaningsConflict(picked.meaning, item.meaning))) continue;
      selected.push(item);
      usedIds.add(item.id);
      usedMeanings.add(key);
    }
  };

  take(false);
  // 极端情况（词库被裁剪到只剩几个词）才放宽「彼此之间」这一层，仍不允许和正确答案撞
  if (selected.length < count) take(true);
  return selected.slice(0, count);
}

/**
 * 从指定词池里抽题。快速测验只从用户勾选的 Lesson 里出题，
 * 所以不能直接吃全词库——那样会抽到没勾的课，进度看着像乱跳。
 */
export function createQuizFrom(pool: WordItem[], count: number): QuizQuestion[] {
  if (!pool.length) return [];
  const size = Math.max(1, Math.min(count, pool.length));
  return shuffle(pool).slice(0, size).map((word) => ({
    word,
    // 和学习页同口径：4 个干扰项 + 正确答案，两页都是 A–E 五个选项
    options: shuffle([word, ...distractors(word, 4)])
  }));
}

export function createQuiz(count: number): QuizQuestion[] {
  return createQuizFrom(words as WordItem[], count);
}
