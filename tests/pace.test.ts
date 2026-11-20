import { describe, expect, it } from 'vitest';
import { isCelebrationRank, paceForRound, paceRank, rankDotOf, rankIndex } from '@/utils/pace';

describe('答对均速称号', () => {
  it('每一档的中间值都落在正确的称号上', () => {
    expect(paceRank(1.9).title).toBe('挂');
    expect(paceRank(2.07).title).toBe('超越神了');
    expect(paceRank(2.22).title).toBe('神明');
    expect(paceRank(2.4).title).toBe('天外飞仙');
    expect(paceRank(2.6).title).toBe('不明飞行物');
    expect(paceRank(2.8).title).toBe('无敌战神');
    expect(paceRank(3.0).title).toBe('超级王牌');
    expect(paceRank(3.2).title).toBe('荣耀皇冠');
    expect(paceRank(3.4).title).toBe('不朽星钻');
    expect(paceRank(3.6).title).toBe('夯');
    expect(paceRank(3.8).title).toBe('半步夯');
    expect(paceRank(4.0).title).toBe('顶级');
    expect(paceRank(4.2).title).toBe('人上人');
    expect(paceRank(4.4).title).toBe('NPC');
    expect(paceRank(4.6).title).toBe('还得多练');
    expect(paceRank(5.2).title).toBe('不做评价');
  });

  it('正好等于阈值时落到下一档——表里说的是「低于」', () => {
    expect(paceRank(2.0).title).toBe('超越神了');
    expect(paceRank(2.1).title).toBe('超越神了');
    expect(paceRank(2.15).title).toBe('神明');
    expect(paceRank(2.3).title).toBe('天外飞仙');
    expect(paceRank(2.5).title).toBe('不明飞行物');
    expect(paceRank(2.7).title).toBe('无敌战神');
    expect(paceRank(2.9).title).toBe('超级王牌');
    expect(paceRank(3.1).title).toBe('荣耀皇冠');
    expect(paceRank(3.3).title).toBe('不朽星钻');
    expect(paceRank(3.5).title).toBe('夯');
    expect(paceRank(3.7).title).toBe('半步夯');
    expect(paceRank(3.9).title).toBe('顶级');
    expect(paceRank(4.1).title).toBe('人上人');
    expect(paceRank(4.3).title).toBe('NPC');
    expect(paceRank(4.5).title).toBe('还得多练');
    expect(paceRank(4.7).title).toBe('不做评价');
  });

  it('神明以上只剩极窄的极限区间', () => {
    expect(paceRank(1.999).title).toBe('挂');
    expect(paceRank(2.0).title).toBe('超越神了');
    expect(paceRank(2.149).title).toBe('超越神了');
    expect(paceRank(2.15).title).toBe('神明');
    expect(paceRank(2.299).title).toBe('神明');
    expect(paceRank(2.3).title).toBe('天外飞仙');
  });

  it('三位小数的细微差别也能落到不同档位', () => {
    expect(paceRank(3.099).title).toBe('超级王牌');
    expect(paceRank(3.101).title).toBe('荣耀皇冠');
    expect(paceRank(4.699).title).toBe('还得多练');
  });

  it('还没答对过时没有称号', () => {
    expect(paceRank(0).title).toBe('');
    expect(paceRank(Number.NaN).title).toBe('');
  });

  it('极慢也只给一句「不做评价」，不会出错', () => {
    expect(paceRank(59.99).title).toBe('不做评价');
  });
});

describe('称号的题量与正确率门槛', () => {
  it('不到 6 题不给称号——错题本只剩三道题全对也不给', () => {
    expect(paceForRound(1.9, 3, 3).rank).toBeNull();
    expect(paceForRound(1.9, 3, 3).note).toBe('few');
    expect(paceForRound(1.9, 5, 5).rank).toBeNull();
  });

  it('正好 6 题、全对且均速低于 2 秒：正常给「挂」', () => {
    expect(paceForRound(1.9, 6, 6).rank?.title).toBe('挂');
    expect(paceForRound(1.9, 6, 6).note).toBe('');
    expect(paceForRound(2.0, 6, 6).rank?.title).toBe('超越神了');
  });

  it('正确率不到 80% 时封顶「顶级」', () => {
    const result = paceForRound(1.9, 10, 7);
    expect(result.rank?.title).toBe('顶级');
    expect(result.note).toBe('accuracy');
  });

  it('正好 80% 不压档', () => {
    expect(paceForRound(1.9, 10, 8).rank?.title).toBe('挂');
    expect(paceForRound(1.9, 10, 8).note).toBe('');
  });

  it('本来就不如「顶级」的，不因为正确率再压一档', () => {
    expect(paceForRound(4.4, 10, 3).rank?.title).toBe('NPC');
    expect(paceForRound(4.4, 10, 3).note).toBe('');
  });

  it('封顶后保留「顶级」的原配色', () => {
    const capped = paceForRound(1.9, 10, 1).rank;
    const direct = paceRank(4.0);
    expect(capped?.bg).toBe(direct.bg);
    expect(capped?.fg).toBe(direct.fg);
  });

  it('一题没答对：没有称号，也不用写解释', () => {
    expect(paceForRound(0, 10, 0).rank).toBeNull();
    expect(paceForRound(0, 10, 0).note).toBe('');
  });
});

describe('称号色点与庆祝门槛', () => {
  it('每个称号都有自己的实色小圆点，不会是透明', () => {
    for (const seconds of [1.9, 2.1, 2.25, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2, 4.4, 4.6, 5.2]) {
      const rank = paceRank(seconds);
      expect(rank.dot).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('称号名能反查出同一个颜色', () => {
    expect(rankDotOf('超级王牌')).toBe(paceRank(3.0).dot);
    expect(rankDotOf('不存在的称号')).toBeTruthy();
  });

  it('超级王牌及以上才算值得庆祝', () => {
    expect(isCelebrationRank('超级王牌')).toBe(true);
    expect(isCelebrationRank('挂')).toBe(true);
    expect(isCelebrationRank('荣耀皇冠')).toBe(false);
    expect(isCelebrationRank('不做评价')).toBe(false);
  });

  it('档位序号从「挂」开始递增', () => {
    expect(rankIndex('挂')).toBe(0);
    expect(rankIndex('超级王牌')).toBe(6);
    expect(rankIndex('顶级')).toBe(11);
  });
});
