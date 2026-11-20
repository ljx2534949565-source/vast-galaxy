export const MIN_EASE = 1.3;
export const INITIAL_EASE = 2.5;
export const QUALITY = { forgot: 0, fuzzy: 3, known: 5 } as const;

export type Grade = keyof typeof QUALITY;
export interface Sm2Card {
  wordId: number;
  ef: number;
  interval: number;
  repetitions: number;
  dueDate: number;
  status: 'new' | 'learning' | 'mastered';
  lapses: number;
  lastQuality: number | null;
}

export function startOfDay(input: number | Date = Date.now()): number {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function addLocalDays(input: number | Date, days: number): number {
  const date = new Date(startOfDay(input));
  date.setDate(date.getDate() + days);
  return startOfDay(date);
}

export function isDue(card: Sm2Card, now: number | Date = Date.now()): boolean {
  return startOfDay(card.dueDate) <= startOfDay(now);
}

export function createCard(wordId: number, now: number | Date = Date.now()): Sm2Card {
  return {
    wordId,
    ef: INITIAL_EASE,
    interval: 0,
    repetitions: 0,
    dueDate: startOfDay(now),
    status: 'new',
    lapses: 0,
    lastQuality: null
  };
}

export function nextEase(ef: number, quality: number): number {
  const updated = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return Math.max(MIN_EASE, Number(updated.toFixed(4)));
}

export function reviewCard(card: Sm2Card, quality: number, now: number | Date = Date.now()): Sm2Card {
  if (![0, 3, 5].includes(quality)) throw new Error('评分必须为 0、3 或 5');
  const ef = nextEase(card.ef, quality);

  if (quality === 0) {
    return {
      ...card,
      ef,
      interval: 1,
      repetitions: 0,
      dueDate: addLocalDays(now, 1),
      status: 'learning',
      lapses: card.lapses + 1,
      lastQuality: quality
    };
  }

  const repetitions = card.repetitions + 1;
  const interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(card.interval * ef);
  return {
    ...card,
    ef,
    interval,
    repetitions,
    dueDate: addLocalDays(now, interval),
    status: 'mastered',
    lastQuality: quality
  };
}

export function reviewByGrade(card: Sm2Card, grade: Grade, now: number | Date = Date.now()): Sm2Card {
  return reviewCard(card, QUALITY[grade], now);
}
