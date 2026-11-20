import { describe, expect, it } from 'vitest';
import { addLocalDays, createCard, INITIAL_EASE, isDue, MIN_EASE, nextEase, reviewCard, startOfDay } from '../src/utils/sm2';

const day = (text: string) => new Date(`${text}T12:00:00`).getTime();

describe('SuperMemo-2 六个边界用例', () => {
  it('1. 首次认识：EF 2.5，间隔 1 天，明日到期', () => {
    const now = day('2026-01-01');
    const result = reviewCard(createCard(1, now), 5, now);
    expect(result.ef).toBe(INITIAL_EASE + 0.1);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.dueDate).toBe(addLocalDays(now, 1));
  });

  it('2. 第二次复习：固定间隔 6 天', () => {
    const now = day('2026-01-01');
    const first = reviewCard(createCard(2, now), 5, now);
    const second = reviewCard(first, 5, addLocalDays(now, 1));
    expect(second.interval).toBe(6);
    expect(second.repetitions).toBe(2);
    expect(second.dueDate).toBe(addLocalDays(now, 7));
  });

  it('3. 忘记：重置为 1 天、重复数清零并累计 lapse', () => {
    const now = day('2026-01-01');
    let card = reviewCard(createCard(3, now), 5, now);
    card = reviewCard(card, 5, addLocalDays(now, 1));
    const forgotten = reviewCard(card, 0, addLocalDays(now, 7));
    expect(forgotten.interval).toBe(1);
    expect(forgotten.repetitions).toBe(0);
    expect(forgotten.lapses).toBe(1);
    expect(forgotten.dueDate).toBe(addLocalDays(now, 8));
  });

  it('4. EF 连续下降仍不低于 1.3', () => {
    let ef = INITIAL_EASE;
    for (let index = 0; index < 20; index += 1) ef = nextEase(ef, 0);
    expect(ef).toBe(MIN_EASE);
    expect(nextEase(MIN_EASE, 0)).toBe(MIN_EASE);
  });

  it('5. dueDate 按本地自然日零点比较，不受当天时分影响', () => {
    const late = new Date(2026, 0, 1, 23, 59, 59).getTime();
    const card = reviewCard(createCard(5, late), 5, late);
    expect(isDue(card, late)).toBe(false);
    expect(isDue(card, new Date(2026, 0, 2, 0, 0, 0))).toBe(true);
    expect(card.dueDate).toBe(startOfDay(new Date(2026, 0, 2, 12)));
  });

  it('6. 连打三次模糊：1 天、6 天，再按新 EF 四舍五入', () => {
    const now = day('2026-01-01');
    const first = reviewCard(createCard(6, now), 3, now);
    const second = reviewCard(first, 3, first.dueDate);
    const third = reviewCard(second, 3, second.dueDate);
    expect([first.interval, second.interval, third.interval]).toEqual([1, 6, 12]);
    expect(third.ef).toBeCloseTo(2.08);
    expect(third.status).toBe('mastered');
  });
});
