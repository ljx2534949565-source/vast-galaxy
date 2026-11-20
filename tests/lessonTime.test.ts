import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import words from '@/data/wordsData';

vi.stubGlobal('uni', {
  getStorageSync: () => '',
  setStorageSync: () => undefined,
  removeStorageSync: () => undefined
});

const { useProgressStore } = await import('@/stores/progress');

describe('背诵块成绩', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('第一次记录直接写入，保留两位小数', () => {
    const store = useProgressStore();
    expect(store.recordScopeTime('lesson:1', 9.44, 73)).toBe(true);
    expect(store.scopeTimes['lesson:1'].avg).toBe(9.44);
    expect(store.scopeTimes['lesson:1'].words).toBe(73);
  });

  it('变慢时不覆盖，历史最快保留', () => {
    const store = useProgressStore();
    store.recordScopeTime('lesson:1', 9.0, 73);
    expect(store.recordScopeTime('lesson:1', 12.5, 73)).toBe(false);
    expect(store.scopeTimes['lesson:1'].avg).toBe(9);
  });

  it('变快时刷新记录', () => {
    const store = useProgressStore();
    store.recordScopeTime('lesson:1', 9.0, 73);
    expect(store.recordScopeTime('lesson:1', 7.2, 73)).toBe(true);
    expect(store.scopeTimes['lesson:1'].avg).toBe(7.2);
  });

  it('非法用时被忽略，不污染记录', () => {
    const store = useProgressStore();
    expect(store.recordScopeTime('lesson:2', 0, 73)).toBe(false);
    expect(store.recordScopeTime('lesson:2', Number.NaN, 73)).toBe(false);
    expect(store.scopeTimes['lesson:2']).toBeUndefined();
  });

  it('同一批词的不同粒度各自记分，互不覆盖', () => {
    const store = useProgressStore();
    store.recordScopeTime('lesson:1', 8, 73);
    store.recordScopeTime('unit:1', 6, 292);
    store.recordScopeTime('chunk:1', 5.5, 500);
    store.recordScopeTime('epic:1', 5.2, 1000);
    store.recordScopeTime('astra:1', 4.9, 2931);
    expect(store.scopeTimes['lesson:1'].avg).toBe(8);
    expect(store.scopeTimes['unit:1'].avg).toBe(6);
    expect(store.scopeTimes['chunk:1'].avg).toBe(5.5);
    expect(store.scopeTimes['epic:1'].avg).toBe(5.2);
    expect(store.scopeTimes['astra:1'].avg).toBe(4.9);
  });

  it('重置后本课成绩清掉、词打回未学（计数归零），但块外的词、错题与其他范围成绩不动', () => {
    const ids = words.filter((word) => word.lesson === 3).map((word) => word.id);
    const other = words.find((word) => word.lesson !== 3)!;
    const store = useProgressStore();
    store.recordScopeTime('lesson:3', 8, ids.length);
    store.recordScopeTime('chunk:1', 5, 500);
    store.gradeWord(ids[0], 'known');
    store.gradeWord(ids[1], 'forgot');
    store.gradeWord(other.id, 'known');
    expect(store.resetScope('lesson:3', ids)).toBe(true);
    expect(store.scopeTimes['lesson:3']).toBeUndefined();
    // 本块的词打回未学：全部重新变成新词，进度归零（看板从 2/N 回到 0/N）
    expect(store.newWords(3)).toHaveLength(ids.length);
    expect(store.progress[String(ids[0])]).toBeFalsy();
    // 块外的词不受影响
    expect(store.progress[String(other.id)]).toBeTruthy();
    expect(store.mistakes).toHaveLength(1);
    expect(store.scopeTimes['chunk:1'].avg).toBe(5);
  });

  it('重置 Unit 不清掉其中 Lesson 的成绩与称号，但本 Unit 的词打回未学、计数归零', () => {
    const store = useProgressStore();
    const u1 = words.filter((word) => word.unit === 1);
    const l1Ids = u1.filter((word) => word.lesson === 1).map((word) => word.id);
    // 先逐课学完并记录成绩，再把 Unit 也走一轮
    store.recordScopeTime('lesson:1', 3.2, l1Ids.length, undefined, { title: '王牌', dot: '#fff' });
    store.recordScopeTime('unit:1', 4.1, u1.length);
    for (const word of u1) store.gradeWord(word.id, 'known');
    expect(store.scopeTimes['lesson:1'].avg).toBe(3.2);
    expect(store.newWords(1)).toHaveLength(0);

    expect(store.resetScope('unit:1', u1.map((word) => word.id))).toBe(true);
    // Unit 成绩没了，但 Lesson 的成绩和称号分毫不动——「各组独立」成立
    expect(store.scopeTimes['unit:1']).toBeUndefined();
    expect(store.scopeTimes['lesson:1'].avg).toBe(3.2);
    expect(store.scopeTimes['lesson:1'].rank).toEqual({ title: '王牌', dot: '#fff' });
    // 本 Unit 的词打回未学：这些词重新变回「没学过」，看板从 N/N 回到 0/N
    expect(store.newWords(1)).toHaveLength(l1Ids.length);
  });

  it('学到一半（有进度、没成绩）也能重置：返回 true、本块词打回未学、打上整块重来标记，其他块不动', () => {
    const ids = words.filter((word) => word.lesson === 1).map((word) => word.id);
    const store = useProgressStore();
    store.gradeWord(ids[0], 'known');
    store.gradeWord(ids[1], 'known');
    store.recordScopeTime('chunk:1', 5, 500);
    expect(store.scopeTimes['lesson:1']).toBeUndefined();
    // 半途的课现在能重置了：以前这里返回 false，点了没反应
    expect(store.resetScope('lesson:1', ids)).toBe(true);
    // 留下整块重来标记，study.scopePool 会据此把整块词从第 1 题排进队列
    expect(store.consumeRestartScope('lesson:1')).toBe(true);
    // 标记只能消费一次，避免以后每次进来都从头
    expect(store.consumeRestartScope('lesson:1')).toBe(false);
    // 学的那一半词也打回未学：进度归零，重新变成新词
    expect(store.progress[String(ids[0])]).toBeFalsy();
    expect(store.progress[String(ids[1])]).toBeFalsy();
    expect(store.newWords(1)).toHaveLength(ids.length);
    expect(store.scopeTimes['chunk:1'].avg).toBe(5);
  });

  it('重置标记按块独立：重置一课不会触发另一课重来', () => {
    const ids1 = words.filter((word) => word.lesson === 1).map((word) => word.id);
    const ids2 = words.filter((word) => word.lesson === 2).map((word) => word.id);
    const store = useProgressStore();
    store.gradeWord(ids1[0], 'known');
    store.gradeWord(ids2[0], 'known');
    store.resetScope('lesson:1', ids1);
    expect(store.consumeRestartScope('lesson:1')).toBe(true);
    expect(store.consumeRestartScope('lesson:2')).toBe(false);
  });

  it('没有进度和成绩时重置返回 false，不会误删别的块', () => {
    const store = useProgressStore();
    store.recordScopeTime('unit:1', 4.2, 292);
    expect(store.resetScope('unit:2', [])).toBe(false);
    expect(store.scopeTimes['unit:1'].avg).toBe(4.2);
  });
});

describe('结算明细（再次打开已学完的课）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('明细每次都刷新，最快均速只留最好那次', () => {
    const store = useProgressStore();
    store.recordScopeTime('lesson:1', 4.2, 69, { correct: 60, answered: 69, avg: 4.2, elapsedMs: 250000, at: 1 });
    store.recordScopeTime('lesson:1', 5.6, 69, { correct: 66, answered: 69, avg: 5.6, elapsedMs: 348000, at: 2 });
    expect(store.scopeTimes['lesson:1'].avg).toBe(4.2);
    expect(store.scopeTimes['lesson:1'].round?.correct).toBe(66);
    expect(store.scopeTimes['lesson:1'].round?.answered).toBe(69);
    expect(store.scopeTimes['lesson:1'].round?.elapsedMs).toBe(348000);
  });

  it('没有明细时不伪造，保留旧记录的最快均速', () => {
    const store = useProgressStore();
    store.recordScopeTime('lesson:2', 3.2, 69);
    expect(store.scopeTimes['lesson:2'].round).toBeUndefined();
    expect(store.scopeTimes['lesson:2'].avg).toBe(3.2);
  });

  it('称号跟着成绩存下来，首页小圆点才有颜色可读', () => {
    const store = useProgressStore();
    store.recordScopeTime('lesson:7', 2.9, 70, { correct: 70, answered: 70, avg: 2.9, elapsedMs: 203000, at: 3 }, { title: '超级王牌', dot: '#FFA23A' });
    expect(store.scopeTimes['lesson:7'].rank).toEqual({ title: '超级王牌', dot: '#FFA23A' });
    // 再走一轮没带称号：沿用上一次的，不会把圆点擦掉
    store.recordScopeTime('lesson:7', 3.4, 70);
    expect(store.scopeTimes['lesson:7'].rank?.title).toBe('超级王牌');
  });

  it('重置清掉成绩时明细一起消失', () => {
    const store = useProgressStore();
    store.recordScopeTime('lesson:4', 3.2, 69, { correct: 66, answered: 69, avg: 3.2, elapsedMs: 200000, at: 1 });
    store.resetScope('lesson:4', words.filter((word) => word.lesson === 4).map((word) => word.id));
    expect(store.scopeTimes['lesson:4']).toBeUndefined();
  });
});
