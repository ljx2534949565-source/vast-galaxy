/**
 * 答对均速的称号。
 *
 * 表按「低于 limit 秒」从快到慢排列，取第一个命中的——越靠前越快，
 * 所以顺序就是判定的优先级，别重排。
 *
 * 方向提醒：「挂」在这里是褒义（开挂 = 强到像用了外挂），是全表最高档，
 * 对应 2.0 秒内答对一题。号码越小、称号越靠前，不是「越快越差」。
 *
 * 每个称号自带底色（bg）和底色上的字色（fg）：底色按用户给的十六档配色，
 * 字色是为了保证对比度——浅粉、香槟金、黄色这些必须配深色字，否则糊成一片。
 */
export type PaceTone = 'gold' | 'purple' | 'green' | 'grey';

export interface PaceRank {
  title: string;
  tone: PaceTone;
  /** 胶囊底色，允许是渐变 */
  bg: string;
  /** 底色上的文字色 */
  fg: string;
  /** 单个实色：首页进度格里的小圆点用它，渐变在 14rpx 的圆点上完全看不出来 */
  dot: string;
}

type PaceTier = { limit: number; title: string; tone: PaceTone; bg: string; fg: string; dot: string };

const TIERS: PaceTier[] = [
  // v2.4.0 全表提速：前三档压缩到 2.0 / 2.15 / 2.3 秒，神明以上只留给极限手速
  { limit: 2.0, title: '挂', tone: 'gold', bg: 'linear-gradient(135deg, #FF6F9C, #E33A6B)', fg: '#FFFFFF', dot: '#FF6F9C' },
  // 红
  { limit: 2.15, title: '超越神了', tone: 'gold', bg: 'linear-gradient(135deg, #F0453C, #C31D1D)', fg: '#FFFFFF', dot: '#E5362F' },
  // 粉红
  { limit: 2.3, title: '神明', tone: 'gold', bg: 'linear-gradient(135deg, #FFB5D3, #FF7FAF)', fg: '#5A0E2C', dot: '#FF9CC2' },
  // 浅粉
  { limit: 2.5, title: '天外飞仙', tone: 'gold', bg: 'linear-gradient(135deg, #FFE6F0, #FFC8DB)', fg: '#8A2350', dot: '#FFC8DB' },
  // 土豪金
  { limit: 2.7, title: '不明飞行物', tone: 'gold', bg: 'linear-gradient(135deg, #EBC85E, #C3981F)', fg: '#2A1C00', dot: '#D9B23C' },
  // 香槟金
  { limit: 2.9, title: '无敌战神', tone: 'gold', bg: 'linear-gradient(135deg, #FFF1D6, #E7D0A2)', fg: '#4A3510', dot: '#E3CB96' },
  // 橘色
  { limit: 3.1, title: '超级王牌', tone: 'purple', bg: 'linear-gradient(135deg, #FFA23A, #F07C12)', fg: '#351700', dot: '#FFA23A' },
  // 橙色
  { limit: 3.3, title: '荣耀皇冠', tone: 'purple', bg: 'linear-gradient(135deg, #FF7A2F, #E4560B)', fg: '#FFFFFF', dot: '#F26A14' },
  // 黄色
  { limit: 3.5, title: '不朽星钻', tone: 'purple', bg: 'linear-gradient(135deg, #FFE14A, #FFC400)', fg: '#3B2C00', dot: '#FFD51F' },
  // 紫色
  { limit: 3.7, title: '夯', tone: 'purple', bg: 'linear-gradient(135deg, #9A6BFF, #6E35E6)', fg: '#FFFFFF', dot: '#8A57F5' },
  // 靛
  { limit: 3.9, title: '半步夯', tone: 'purple', bg: 'linear-gradient(135deg, #5B54C8, #352D96)', fg: '#FFFFFF', dot: '#5B54C8' },
  // 深蓝
  { limit: 4.1, title: '顶级', tone: 'green', bg: 'linear-gradient(135deg, #2A4FA8, #112B69)', fg: '#FFFFFF', dot: '#2A4FA8' },
  // 浅蓝
  { limit: 4.3, title: '人上人', tone: 'green', bg: 'linear-gradient(135deg, #A9DEFF, #6FB9EE)', fg: '#0B2C48', dot: '#6FB9EE' },
  // 墨绿
  { limit: 4.5, title: 'NPC', tone: 'grey', bg: 'linear-gradient(135deg, #2C6852, #12382B)', fg: '#D6F5E4', dot: '#2C6852' },
  // 浅绿
  { limit: 4.7, title: '还得多练', tone: 'grey', bg: 'linear-gradient(135deg, #C8F0B9, #9BDD8C)', fg: '#14351A', dot: '#9BDD8C' }
];

/** 秒数无效（还没答对过）时给一个空称号，模板里自己判断要不要渲染 */
const NONE: PaceRank = { title: '', tone: 'grey', bg: 'transparent', fg: 'inherit', dot: 'transparent' };
/** 4.7 秒以上 · 灰色 */
const SLOWEST: PaceRank = { title: '不做评价', tone: 'grey', bg: 'linear-gradient(135deg, #A7AEBE, #7D8595)', fg: '#FFFFFF', dot: '#A7AEBE' };

export function paceRank(seconds: number): PaceRank {
  if (!Number.isFinite(seconds) || seconds <= 0) return NONE;
  const hit = TIERS.find((tier) => seconds < tier.limit);
  return hit ? { ...hit } : { ...SLOWEST };
}

/**
 * 称号在表里的位置：0 是「挂」，数字越大越慢。
 * 首页小圆点、结算页的"是否值得庆祝"都要靠它比较档位。
 */
export function rankIndex(title: string): number {
  return TIERS.findIndex((tier) => tier.title === title);
}

/** 从称号名反查颜色，给首页小圆点用；认不出的称号返回灰 */
export function rankDotOf(title: string): string {
  const hit = TIERS.find((tier) => tier.title === title);
  return hit ? hit.dot : SLOWEST.dot;
}

/** 结算时值得大办一场的门槛：超级王牌（含）以上 */
export const CELEBRATE_MIN_TITLE = '超级王牌';

/** 称号够不够格触发庆祝动画（不做评价 / 更慢的档一律不算） */
export function isCelebrationRank(title: string): boolean {
  const index = rankIndex(title);
  const floor = rankIndex(CELEBRATE_MIN_TITLE);
  return index !== -1 && floor !== -1 && index <= floor;
}

/** 少于这个题数不给称号：两三道题全对说明不了什么，均速也压不住偶然 */
export const RANK_MIN_ANSWERS = 6;
/** 正确率低于这个值，称号最高只到「顶级」（速度再快也不往上给） */
export const RANK_MIN_ACCURACY = 0.8;
/** 正确率不达标时的封顶档 */
const ACCURACY_CAP_TITLE = '顶级';

export interface RoundPace {
  /** null = 本轮不显示称号 */
  rank: PaceRank | null;
  /** 界面上一句话解释为什么没给 / 为什么被压档 */
  note: '' | 'few' | 'accuracy';
}

/**
 * 结算与练习中的称号：在纯速度之外加两道闸。
 * 1. 题量不到 6 题 → 不给称号（错题本只剩三道题时，全对也不给）
 * 2. 正确率不到 80% → 称号封顶「顶级」，不会出现「错一半还拿挂」的荒诞结果
 */
export function paceForRound(seconds: number, answered: number, correct: number): RoundPace {
  const base = paceRank(seconds);
  if (answered < RANK_MIN_ANSWERS) return { rank: null, note: 'few' };
  // 一题都没答对：本来就该没有称号，不用再解释
  if (!base.title) return { rank: null, note: '' };

  const accuracy = answered > 0 ? correct / answered : 0;
  if (accuracy >= RANK_MIN_ACCURACY) return { rank: base, note: '' };

  const capIndex = TIERS.findIndex((tier) => tier.title === ACCURACY_CAP_TITLE);
  const index = TIERS.findIndex((tier) => tier.title === base.title);
  // 已经比封顶档慢（或正好是它）就不用动；-1 是「不做评价」，本来就慢
  if (index === -1 || index >= capIndex) return { rank: base, note: '' };

  const tier = TIERS[capIndex];
  return {
    rank: { title: tier.title, tone: tier.tone, bg: tier.bg, fg: tier.fg, dot: tier.dot },
    note: 'accuracy'
  };
}
