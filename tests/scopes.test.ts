import { describe, expect, it } from 'vitest';
import words from '@/data/wordsData';
import { CHUNK_SIZE, EPIC_UNITS, LESSONS_PER_UNIT, bestOf, buildBoard, doneCount, normalizeScopeKey, parseScopeKey, scopeOf, scopeKey, scopesOf } from '@/utils/scopes';

describe('背诵粒度切块', () => {
  it('按课：40 块，合计等于词库', () => {
    const list = scopesOf('lesson');
    expect(list).toHaveLength(40);
    expect(list.reduce((sum, item) => sum + item.words.length, 0)).toBe(words.length);
    expect(list[0].key).toBe('lesson:1');
    expect(list[0].name).toBe('Unit 1 · Lesson 1');
    expect(list[39].name).toBe('Unit 10 · Lesson 4');
  });

  it('按 Unit：10 块，每块 4 课', () => {
    const list = scopesOf('unit');
    expect(list).toHaveLength(10);
    expect(list.reduce((sum, item) => sum + item.words.length, 0)).toBe(words.length);
    expect(list[0].label).toBe('U1');
  });

  it('Chunk：每 500 词一块，最后一块收尾', () => {
    const list = scopesOf('chunk');
    expect(list).toHaveLength(Math.ceil(words.length / CHUNK_SIZE));
    expect(list[0].words).toHaveLength(500);
    expect(list[5].words).toHaveLength(words.length - 2500);
    expect(list[5].key).toBe('chunk:6');
    expect(list[5].name).toContain('第 2501');
    // 切块不重不漏
    const ids = new Set(list.flatMap((item) => item.words.map((word) => word.id)));
    expect(ids.size).toBe(words.length);
  });

  it('Epic：按 Unit 前后对半分，两块', () => {
    const list = scopesOf('epic');
    expect(list).toHaveLength(2);
    expect(list[0].key).toBe('epic:1');
    expect(list[1].key).toBe('epic:2');
    // 前一块只收 Unit 1–5（第 1–20 课），后一块只收 Unit 6–10（第 21–40 课）
    expect(list[0].words.every((word) => (word.unit ?? 1) <= EPIC_UNITS)).toBe(true);
    expect(list[1].words.every((word) => (word.unit ?? 1) > EPIC_UNITS)).toBe(true);
    expect(list[0].name).toContain('前 20 课');
    expect(list[1].name).toContain('后 20 课');
    // 不重不漏：两块合起来正好是全词
    const ids = list.flatMap((item) => item.words.map((word) => word.id));
    expect(new Set(ids).size).toBe(words.length);
  });

  it('Epic 的两块按课数对半，不再按词数', () => {
    const list = scopesOf('epic');
    const lessonsOf = (index: number) => new Set(list[index].words.map((word) => word.lesson)).size;
    expect(lessonsOf(0)).toBe(EPIC_UNITS * LESSONS_PER_UNIT);
    expect(lessonsOf(1)).toBe(EPIC_UNITS * LESSONS_PER_UNIT);
  });

  it('Astra：只有一块，就是全词', () => {
    const list = scopesOf('astra');
    expect(list).toHaveLength(1);
    expect(list[0].words).toHaveLength(words.length);
    expect(list[0].label).toBe('Astra');
  });

  it('scopeOf 越界返回 null', () => {
    expect(scopeOf('chunk', 1)?.key).toBe('chunk:1');
    expect(scopeOf('epic', 9)).toBeNull();
    expect(scopeOf('epic', 3)).toBeNull();
  });
});

describe('成绩 key', () => {
  it('新格式原样保留，旧纯数字补 lesson: 前缀', () => {
    expect(normalizeScopeKey('unit:3')).toBe('unit:3');
    expect(normalizeScopeKey('7')).toBe('lesson:7');
    expect(normalizeScopeKey('astra:1')).toBe('astra:1');
    expect(normalizeScopeKey('chunk')).toBeNull();
  });

  it('解析出粒度与编号', () => {
    expect(parseScopeKey('epic:2')).toEqual({ mode: 'epic', id: 2 });
    expect(parseScopeKey('12')).toEqual({ mode: 'lesson', id: 12 });
    expect(scopeKey('chunk', 4)).toBe('chunk:4');
  });
});

describe('课程板统计', () => {
  it('全新账号：全部未开始，没有成绩', () => {
    const board = buildBoard('lesson', {}, {});
    expect(board).toHaveLength(40);
    expect(board.every((cell) => cell.total > 0)).toBe(true);
    expect(board.every((cell) => cell.left === cell.total)).toBe(true);
    expect(doneCount(board)).toBe(0);
    expect(bestOf(board)).toBeNull();
  });

  it('学完一课即 done，成绩取该块记录', () => {
    const lessonWords = words.filter((word) => word.lesson === 5);
    const progress: Record<string, unknown> = {};
    for (const word of lessonWords) progress[String(word.id)] = { status: 'learning' };
    const board = buildBoard('lesson', progress, { 'lesson:5': { avg: 4.21 } });
    const cell = board.find((item) => item.id === 5)!;
    expect(cell.done).toBe(true);
    expect(cell.left).toBe(0);
    expect(cell.best).toBe(4.21);
    expect(doneCount(board)).toBe(1);
    expect(bestOf(board)).toBe(4.21);
  });

  it('Chunk 统计按词库顺序，学过一半显示对半', () => {
    const progress: Record<string, unknown> = {};
    for (const word of words.slice(0, 250)) progress[String(word.id)] = { status: 'learning' };
    const board = buildBoard('chunk', progress, {});
    expect(board[0].total).toBe(500);
    expect(board[0].left).toBe(250);
    expect(board[1].left).toBe(500);
  });

  it('Epic 只学 Unit 1–5 的词不等于 E1 学完：只算「推荐学习」', () => {
    const progress: Record<string, unknown> = {};
    for (const word of words) if ((word.unit ?? 1) <= EPIC_UNITS) progress[String(word.id)] = { status: 'mastered' };
    const board = buildBoard('epic', progress, {});
    expect(board[0].left).toBe(0);
    expect(board[0].done).toBe(false);
    expect(board[0].recommend).toBe(true);
    expect(board[1].left).toBe(board[1].total);
  });

  it('五种粒度各走一轮才算全部完成', () => {
    const progress: Record<string, unknown> = {};
    for (const word of words) progress[String(word.id)] = { status: 'mastered' };
    for (const mode of ['lesson', 'unit', 'chunk', 'epic', 'astra'] as const) {
      const times = Object.fromEntries(scopesOf(mode).map((scope) => [scope.key, { avg: 4 }]));
      const board = buildBoard(mode, progress, times);
      expect(doneCount(board)).toBe(board.length);
    }
  });
});

describe('进度格里的称号圆点', () => {
  const progress = (() => {
    const map: Record<string, unknown> = {};
    for (const word of words.filter((item) => item.lesson === 1)) map[String(word.id)] = { status: 'mastered' };
    return map;
  })();

  it('没学过的块不画圆点', () => {
    const board = buildBoard('lesson', {}, {});
    expect(board.every((cell) => cell.rank === null)).toBe(true);
  });

  it('存了称号就用存下来的颜色', () => {
    const board = buildBoard('lesson', progress, { 'lesson:1': { avg: 3.0, words: 69, rank: { title: '荣耀皇冠', dot: '#F26A14' } } });
    expect(board[0].rank).toEqual({ title: '荣耀皇冠', dot: '#F26A14' });
  });

  it('老记录只有均速时，按速度补一个称号', () => {
    const board = buildBoard('lesson', progress, { 'lesson:1': { avg: 2.95, words: 69 } });
    expect(board[0].rank?.title).toBe('超级王牌');
    expect(board[0].rank?.dot).toMatch(/^#/);
  });
});

describe('粒度互相独立', () => {
  /** 把一个 Unit 的 4 课都学完，并且 4 课各自都按整课走过一轮 */
  const progress: Record<string, unknown> = {};
  for (const word of words) if (word.unit === 1) progress[String(word.id)] = { status: 'mastered' };
  const lessonTimes = Object.fromEntries([1, 2, 3, 4].map((id) => [`lesson:${id}`, { avg: 3.2 }]));

  it('4 个 Lesson 学完，Unit 仍然不算学完，只标推荐学习', () => {
    const board = buildBoard('unit', progress, lessonTimes);
    expect(board[0].done).toBe(false);
    expect(board[0].recommend).toBe(true);
    expect(doneCount(board)).toBe(0);
  });

  it('Unit 按整块走一轮之后才算完成，Lesson 的记录一点不受影响', () => {
    const board = buildBoard('unit', progress, { ...lessonTimes, 'unit:1': { avg: 4.1 } });
    expect(board[0].done).toBe(true);
    expect(board[0].recommend).toBe(false);
    expect(board[0].best).toBe(4.1);
    // Lesson 的记录还在
    const lessons = buildBoard('lesson', progress, { ...lessonTimes, 'unit:1': { avg: 4.1 } });
    expect(lessons[0].done).toBe(true);
    expect(lessons[0].best).toBe(3.2);
  });

  it('词学过一半的块既不算完成也不算推荐，只显示进度', () => {
    const half: Record<string, unknown> = {};
    for (const word of words.filter((item) => item.lesson === 1).slice(0, 20)) half[String(word.id)] = { status: 'learning' };
    const board = buildBoard('lesson', half, {});
    expect(board[0].done).toBe(false);
    expect(board[0].recommend).toBe(false);
    expect(board[0].inherited).toBe(false);
    expect(board[0].left).toBeGreaterThan(0);
  });

  it('先做小的：4 课各自走完，Unit 标推荐学习，课本身是完成不计继承', () => {
    const board = buildBoard('lesson', progress, lessonTimes);
    for (let id = 1; id <= 4; id += 1) {
      const cell = board.find((item) => item.id === id)!;
      expect(cell.done).toBe(true);
      expect(cell.best).toBe(3.2);
      expect(cell.inherited).toBe(false);
    }
  });

  it('先做大的：Unit 走完后它包含的 4 课显示继承完成（绿框无分数），不写推荐', () => {
    // 词都学过，但 4 课自己都没成绩；只有 unit:1 有成绩 = 先做大的把词带会了
    const board = buildBoard('lesson', progress, { 'unit:1': { avg: 4.1 } });
    for (let id = 1; id <= 4; id += 1) {
      const cell = board.find((item) => item.id === id)!;
      expect(cell.left).toBe(0);
      expect(cell.done).toBe(false);
      expect(cell.best).toBeNull();
      expect(cell.inherited).toBe(true);
      expect(cell.recommend).toBe(false);
    }
    // 不在 Unit 1 的课不受影响
    expect(board.find((item) => item.id === 5)!.inherited).toBe(false);
  });

  it('Unit 没成绩时，词都学完的课仍标推荐学习（不被误判为继承）', () => {
    const board = buildBoard('lesson', progress, {});
    const cell = board.find((item) => item.id === 1)!;
    expect(cell.inherited).toBe(false);
    expect(cell.recommend).toBe(true);
  });
});
