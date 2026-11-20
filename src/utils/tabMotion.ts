/**
 * 左右切板块的 3D 摆位（旋转木马）。
 *
 * 三个板块像贴在一个竖着的圆筒侧面：当前页正对镜头，邻页转到侧后方，
 * 越远越斜、越退、越小。所有计算都只跟「相对当前进度的页偏移」有关，
 * 所以拖到一半、回弹、点击切换共用同一套坐标，不会出现两种手感。
 *
 * 这里是纯函数，不碰 DOM —— 手势和样式都从这几个函数取值，单测直接覆盖。
 */

export interface PoseOptions {
  /** 相邻一页的最大旋转角（度）：越大越像圆筒，越小越像平移 */
  angle: number;
  /** 一页的横向位移倍数：中间段用来让两页贴住（小于 1 才不会互相压） */
  spread: number;
  /** 末端额外多推的距离（屏宽倍数）：补掉透视缩水，旧页在终点必须完全出屏 */
  tail: number;
  /** 转到侧面时额外后退的距离（px），配合透视产生近大远小 */
  depth: number;
  /** 转到侧面时额外缩小的比例（每页） */
  shrink: number;
}

/** 调参入口：改这里就能整体改手感 */
export const POSE: PoseOptions = {
  angle: 30,
  spread: 0.92,
  tail: 0.16,
  depth: 110,
  shrink: 0.055
};

/* 透视距离写在 index.vue 的 .tab-track 上：越小越夸张。
   它属于舞台样式而不是摆位计算，所以不在这里重复一份常量。 */

/* 精度必须给够：scale 只要保留两位小数，整段转场的缩放就只有五六级台阶
   （总变化 5.5%，每级 1% ≈ 4px），慢速拖动时会看见页面一跳一跳地胀缩。
   px/deg 用不到这么细，但统一取四位省得以后再踩同一个坑。 */
const round = (n: number, digits = 4) => {
  const p = 10 ** digits;
  const v = Math.round(n * p) / p;
  return v === 0 ? 0 : v;
};

/**
 * 页偏移 → CSS transform。
 * offset 以「页」为单位：0 = 正对镜头，-1 = 退到左边一屏，+1 = 右边一屏。
 */
export function poseTransform(offset: number, width: number, opt: PoseOptions = POSE): string {
  const abs = Math.abs(offset);
  /* 透视会把位移按 d/(d-z) 缩掉一成多：0.92 屏在终点只剩 0.82 屏，
     旧页会留十几像素的边在屏幕里，落地清理前一直看得见。
     最后 12% 把位移补到 1.08 屏；smoothstep 两端导数为 0，中间段
     完全不动，两页照样贴得住，也不会突然加速。 */
  const t = Math.min(1, Math.max(0, (abs - 0.88) / 0.12));
  const push = opt.spread + opt.tail * t * t * (3 - 2 * t);
  const x = round(offset * width * push);
  const z = round(-abs * opt.depth);
  // 负角度 = 右侧远处；页面在左时右边缘朝向观众，所以角度随 offset 反号
  const rotate = round(-offset * opt.angle);
  const scale = round(Math.max(0.6, 1 - abs * opt.shrink));
  return `translate3d(${x}px, 0, ${z}px) rotateY(${rotate}deg) scale(${scale})`;
}

/**
 * 到头了还继续拖：位移打个折，手指走了 100px 页面只挪 20px，
 * 松手再弹回去 —— 和上下撞墙的橡皮筋是同一个意思。
 */
export function dampBeyond(raw: number, ratio = 0.2): number {
  return raw * ratio;
}

export interface TurnRule {
  /** 拖过屏幕宽度的这个比例就直接翻页（不看好坏，只看距离） */
  commitAt: number;
  /** 距离不够但甩得够快也算：至少要拖过这么多 */
  flickAt: number;
  /** 「甩」的判定速度（px/ms，沿拖动方向） */
  flickSpeed: number;
}

export const TURN_RULE: TurnRule = {
  commitAt: 0.3,
  flickAt: 0.11,
  flickSpeed: 0.16
};

/**
 * 松手这一下：翻过去还是弹回来。
 * progress 是当前已经拖出的页数（0~1），speed 是沿拖动方向的速度（px/ms）。
 */
export function shouldCommit(progress: number, speed: number, rule: TurnRule = TURN_RULE): boolean {
  if (!(progress > 0)) return false;
  if (progress >= rule.commitAt) return true;
  return progress >= rule.flickAt && speed >= rule.flickSpeed;
}

/**
 * 收尾动画时长：走得越远收得越久，但都落在 220~380ms 之间，
 * 快到像被轻轻推了一下，慢到眼睛能跟上。
 */
export function settleMs(remaining: number): number {
  const d = Math.min(1, Math.abs(remaining));
  return Math.round(220 + 160 * d);
}

/** 点底栏的收尾时长：一格 280ms，跨格多给 40ms，别像瞬移也别拖沓 */
export function spanMs(span: number): number {
  return Math.round(280 + 40 * Math.max(0, Math.abs(span) - 1));
}
