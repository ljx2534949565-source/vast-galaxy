import type { WordItem } from './quiz';

/**
 * 实际出题方向：
 * - `en2zh` 看英文选中文（默认，也是最传统的背单词方式）
 * - `zh2en` 看中文选英文，用来练"能想起来"而不是"能认出来"
 */
export type QuizDirection = 'en2zh' | 'zh2en';

/**
 * 设置里可选的三档：两种固定方向 + 随机。
 * 随机档不是"每题都随机"这么简单——它要保证一轮里两种方向都出现，
 * 否则手气不好时会连着十题都是同一个方向，等于没随机。
 */
export type DirectionMode = QuizDirection | 'random';

export const DEFAULT_DIRECTION: DirectionMode = 'en2zh';

export const DIRECTION_OPTIONS: Array<{ key: DirectionMode; label: string; full: string }> = [
  { key: 'en2zh', label: '英→中', full: '看英文选中文' },
  { key: 'zh2en', label: '中→英', full: '看中文选英文' },
  { key: 'random', label: '随机', full: '两种方向随机出现' }
];

/** 只在三个合法值之间取值，脏数据一律按默认值处理 */
export function normalizeDirection(value: unknown): DirectionMode {
  if (value === 'zh2en' || value === 'random') return value;
  return DEFAULT_DIRECTION;
}

/** 拨杆/三档按钮的循环顺序：英→中 → 中→英 → 随机 → 英→中 */
export function flipDirection(direction: DirectionMode): DirectionMode {
  if (direction === 'en2zh') return 'zh2en';
  if (direction === 'zh2en') return 'random';
  return 'en2zh';
}

/** 设置项是"随机"时，某一题实际用哪个方向 */
export function resolveDirection(mode: DirectionMode, random: () => number = Math.random): QuizDirection {
  if (mode !== 'random') return mode;
  return random() < 0.5 ? 'en2zh' : 'zh2en';
}

/**
 * 一整轮的方向序列：随机档下先对半铺好再打乱，
 * 保证「中→英」和「英→中」在整轮里各占一半，不会扎堆。
 */
export function planDirections(mode: DirectionMode, count: number, random: () => number = Math.random): QuizDirection[] {
  if (mode !== 'random') return Array.from({ length: count }, () => mode);
  const half = Math.ceil(count / 2);
  const plan: QuizDirection[] = [];
  for (let index = 0; index < count; index += 1) plan.push(index < half ? 'en2zh' : 'zh2en');
  // Fisher-Yates，用注入的随机源，测试里可复现
  for (let index = plan.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [plan[index], plan[target]] = [plan[target], plan[index]];
  }
  return plan;
}

/** 题目卡上那行大字：中文模式显示释义，英文模式显示单词 */
export function promptOf(word: WordItem, direction: QuizDirection): string {
  return direction === 'zh2en' ? word.meaning : word.word;
}

/** 选项和"正确答案是…"用的文本，与 promptOf 互为反面 */
export function answerOf(word: WordItem, direction: QuizDirection): string {
  return direction === 'zh2en' ? word.word : word.meaning;
}

export function hintOf(direction: QuizDirection): string {
  return direction === 'zh2en' ? '选出正确的英文单词' : '选出正确的中文释义';
}

/** 工具行上那个芯片显示的字：随机档要让人知道这一题到底在看什么 */
export function directionTag(mode: DirectionMode, direction: QuizDirection): string {
  if (mode !== 'random') return '';
  return direction === 'zh2en' ? '随机 · 中→英' : '随机 · 英→中';
}
