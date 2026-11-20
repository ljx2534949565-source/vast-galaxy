/**
 * 页面到顶 / 到底的橡皮筋（v3.7.9 重写）
 *
 * 原生壳关掉了 WebView 自带的过度滚动（OVER_SCROLL_NEVER），边缘回弹只能
 * 由网页层补。这里只让内容层 .page-content 跟着手指走，壁纸和固定元素不动。
 *
 * 四个场景，一个都不能少：
 *   1. 手指按着往边缘外拉 → 内容跟着拉伸（越拉越沉，开方阻尼，封顶 88px）
 *   2. 手指往回推 → 拉伸按手指位置 1:1 复原（不阻尼、不延迟、跟手）
 *   3. 手指在拉伸状态下松开 → 直接回弹到 0
 *   4. 快速滑动松手后靠惯性撞到边缘 → 顶出去一截，再回弹
 *
 * 三条铁律（真机踩坑换来的，别改）：
 *   - 位置驱动：拉伸量只由手指相对「触边零点」的位移决定，不按时间收敛，
 *     手指停住内容就停住，不会有搓衣板式的抖动。
 *   - 到边判定不读 window.scrollY（它能滞后 30 多帧），用内容层的
 *     getBoundingClientRect().top 反推实时滚动量，且只在接近边缘时才读。
 *   - 橡皮筋期间 preventDefault 掉原生滚动：否则合成器滚一份、transform
 *     动一份，内容跑得比手快一倍，节奏还不同步。
 */

/** 拉出的阻尼系数：手指走 100px → sqrt(100*22)=47px，走 300px → 81px */
const RESIST_K = 22;
/** 拉伸封顶，再拉就像整页被拽走 */
const MAX_PULL = 88;
/** 手指移动小于这个距离不判定方向 */
const AXIS_SLOP = 8;
/** 越过边缘多少才算到边，滤掉起手抖动 */
const EDGE_EPS = 3;
/** 离边缘多近才读实时位置精判，其余时候全程不碰布局 */
const EDGE_NEAR = 240;

/** 松手回弹：略微过冲再收回，像橡皮筋不像弹簧门 */
const REBOUND = 'transform 420ms cubic-bezier(.22, 1.1, .3, 1)';
/** 惯性撞边回弹：稳稳收回，别弹回来又弹出去 */
const SNAP = 'transform 460ms cubic-bezier(.24, 1.24, .34, 1)';
/** 回弹走完再清内联样式，清早了看起来像跳回去 */
const CLEANUP_MS = 520;

/** 抬手速度低于这个值（px/ms）不算惯性 */
const FLING_MIN = 0.32;
/** 惯性撞边速度低于这个值：轻轻靠上来，不弹 */
const FLING_IMPACT_MIN = 0.14;
/** 抬手后最多观察这么久，超时认为没有惯性 */
const FLING_WATCH_MS = 1600;
/** 安卓惯性减速的指数时间常数 */
const FLING_TAU = 240;
/** 撞边顶出多远 = 撞边速度 × 系数，再夹到 [MIN, MAX] */
const INERTIA_GAIN = 50;
const INERTIA_MIN = 20;
const INERTIA_MAX = 84;
/** 顶出去用时，放慢一点让这一下看得清 */
const INERTIA_RISE_MS = 170;

type Edge = 'top' | 'bottom';

/** 滚动可能落在这些节点上，逐个摸一遍，别只认 window */
const SCROLL_HOSTS = ['uni-page-body', 'uni-page', '#app', 'uni-app'];

/* ── 手势状态 ─────────────────────────────────────────── */
let touching = false;
let startX = 0;
let startY = 0;
let lastY = 0;
/** 上一次 touchmove 的手指 Y，用来判手指此刻的运动方向 */
let prevY = 0;
let axis: 'x' | 'y' | null = null;
/** 按下那一刻的滚动位置和内容层 top，此刻页面静止、读数最可靠 */
let startScroll = 0;
let startTop = 0;
let maxScroll = 0;
let targets: HTMLElement[] = [];
let hosts: Element[] = [];
let prepared = false;

/** 当前拉的是哪条边；null 表示还没到边或已归零 */
let edge: Edge | null = null;
/** 触边那一刻的手指 Y：拉伸从这儿算起，触边瞬间不跳变 */
let anchorY = 0;
/** 当前拉伸的绝对值（带符号写到 transform：顶部为正、底部为负） */
let absPull = 0;
/** 上一帧手指的越界量，用来算这一帧手指走了多少 */
let lastOver = 0;
/** 本次手势已推回原位、把滚动交还给浏览器；之后不再接管 */
let released = false;
/**
 * 推回原位后，浏览器在本趟手势里已被 preventDefault 过、不会再接管原生滚动。
 * 这个模式下改由 JS 把手指位移 1:1 同步到 window.scrollTo，接上"归零→正常滚动"
 * 那段真空，消除空滑。（v3.7.11 修复）
 */
let jsScroll = false;
/** jsScroll 接管那一刻的手指 Y 与真实滚动位置，位移从这儿算起 */
let jsScrollEdge: Edge | null = null;
let jsScrollAnchorY = 0;
let jsScrollBase = 0;
let frame = 0;
let lastWritten = Number.NaN;
let releaseToken = 0;

/** 抬手后对惯性的观察 */
type Fling = {
  edge: Edge;
  speed: number;
  startedAt: number;
  lastPos: number;
  lastAt: number;
  /** 惯性途中测到的最大瞬时撞边速度 */
  impact: number;
  token: number;
};
let fling: Fling | null = null;
let flingToken = 0;
let flingTimer = 0;

/** 最近几个触摸点，只用来算抬手速度 */
const samples: Array<{ y: number; t: number }> = [];

/**
 * 现场快照，挂在 window.__bounce 上。真机没控制台时靠它判断：
 * mode 是当前阶段，over 是手指越界量，offset 是实际位移，edgeY 是触边零点。
 * 字段名与历史 e2e 脚本保持一致，方便继续用老诊断工具。
 */
const debug = {
  max: 0, scroll: 0, dy: 0, expected: 0, over: 0,
  edge: '', offset: 0, mode: 'none', at: '', speed: 0,
  peak: 0, targets: 0, startTop: 0, realTop: 0, edgeY: 0
};
function log(extra?: Partial<typeof debug>) {
  debug.edge = edge ?? '';
  debug.offset = Math.round(Math.absPull * 10) / 10;
  debug.mode = debug.mode === 'inertia' ? 'inertia' : (edge ? 'drag' : 'none');
  debug.targets = targets.length;
  if (extra) Object.assign(debug, extra);
}

/** 键盘弹出时不参与：键盘态整页锁成一屏，聊天由内部容器滚，transform 会让 fixed 输入条跟着跑 */
function keyboardOpen(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.classList.contains('keyboard-open');
}

/** 悬浮球自己独占整段触摸；全局回弹在捕获阶段也不能抢这趟手势。 */
function isMusicOrbTouch(event: TouchEvent): boolean {
  const target = event.target;
  return target instanceof Element && target.closest('.music-orb') !== null;
}

function buildHosts() {
  hosts = [];
  if (document.documentElement) hosts.push(document.documentElement);
  if (document.body) hosts.push(document.body);
  for (const s of SCROLL_HOSTS) {
    const n = document.querySelector(s);
    if (n) hosts.push(n);
  }
}

/** 当前滚动位置：优先读 window（不触发布局），读不到再摸各宿主 */
function measureScroll(): number {
  const y = window.scrollY || 0;
  if (y > 0) return y;
  let deepest = 0;
  for (const n of hosts) {
    const top = (n as HTMLElement).scrollTop || 0;
    if (top > deepest) deepest = top;
  }
  return deepest;
}

/** 当前负责滚动的对象（正常态是 window，否则是最深的宿主），和 measureScroll 同一套判断 */
function scrollOwner(): Window | HTMLElement {
  const canWindowScroll = (document.documentElement.scrollHeight - (window.innerHeight || 0)) > 1
    || (document.body.scrollHeight - (window.innerHeight || 0)) > 1;
  if (canWindowScroll) return window;
  let deepest: HTMLElement = document.documentElement;
  let maxH = 0;
  for (const n of hosts) {
    const el = n as HTMLElement;
    const h = el.scrollHeight - el.clientHeight;
    if (h > maxH) { maxH = h; deepest = el; }
  }
  return deepest;
}

/** 直接把页面滚到某个真实位置：只驱动当前真正的滚动宿主，避免双份 */
function setScroll(y: number) {
  const clamped = Math.min(maxScroll, Math.max(0, y));
  const owner = scrollOwner();
  if (owner === window) {
    if (window.scrollY !== clamped) window.scrollTo(0, clamped);
  } else if (owner.scrollTop !== clamped) {
    owner.scrollTop = clamped;
  }
  debug.scroll = Math.round(clamped);
}

/** 最多能滚多远：只在一开始算一次 */
function measureMax(): number {
  const view = window.innerHeight || document.documentElement.clientHeight || 0;
  let max = 0;
  for (const n of hosts) {
    const h = n.scrollHeight || 0;
    const c = n.clientHeight || 0;
    const visible = c > 0 ? Math.max(c, view) : view;
    max = Math.max(max, Math.max(0, h - visible));
  }
  if (max <= AXIS_SLOP) {
    const c = document.querySelector<HTMLElement>('.page-content, .page');
    if (c) max = Math.max(max, Math.max(0, c.getBoundingClientRect().height - view));
  }
  return max;
}

/** 实时滚动量：用内容层的视觉位置反推，比 scrollY 可靠（合成器滚动时它每帧更新） */
function realScroll(): number {
  const node = targets[0];
  if (!node) return measureScroll();
  const top = node.getBoundingClientRect().top;
  debug.startTop = Math.round(startTop);
  debug.realTop = Math.round(top);
  return Math.min(maxScroll, Math.max(0, startScroll + (startTop - top)));
}

function visibleContents(): HTMLElement[] {
  const ok = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.width > 0 && getComputedStyle(el).display !== 'none';
  };
  const page = Array.from(document.querySelectorAll<HTMLElement>('.page-content')).filter(ok);
  return page.length ? page : Array.from(document.querySelectorAll<HTMLElement>('.page')).filter(ok);
}

/** 竖向手势一开始就挂上合成层，撞边那一下不用临时建层 */
function prepare() {
  if (prepared) return;
  targets = visibleContents();
  if (!targets.length) return;
  startTop = targets[0].getBoundingClientRect().top;
  for (const el of targets) el.style.setProperty('will-change', 'transform');
  prepared = true;
}

/** 拉出曲线：开方阻尼，越拉越沉，封顶 MAX_PULL */
function resist(over: number): number {
  return Math.min(MAX_PULL, Math.sqrt(Math.max(0, over) * RESIST_K));
}

/** 把拉伸写进 transform；值完全没变就不碰样式 */
function write(next: number) {
  absPull = Math.abs(next);
  if (next === lastWritten) return;
  lastWritten = next;
  const value = next ? `translate3d(0, ${next.toFixed(2)}px, 0)` : '';
  for (const el of targets) el.style.setProperty('transform', value, 'important');
  log();
}

function atEdge(direction: Edge, position: number): boolean {
  return direction === 'top'
    ? position <= EDGE_EPS
    : maxScroll > EDGE_EPS && position >= maxScroll - EDGE_EPS;
}

function cancelFrame() {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/** 手指还在屏幕上、推回原位：立刻归零（内容跟手），并接管接下来的原生滚动 */
function handBack() {
  cancelFrame();
  for (const el of targets) {
    el.style.setProperty('transition', 'none', 'important');
    el.style.setProperty('transform', '', 'important');
  }
  // v3.7.11：浏览器在本趟手势里被 preventDefault 过、归零后不会再接管滚动。
  // 记下这一刻的手指位置和真实滚动位置，改由 JS 把后续位移 1:1 同步过去。
  jsScrollEdge = edge;
  jsScrollAnchorY = lastY;
  jsScrollBase = measureScroll();
  jsScroll = true;
  edge = null;
  absPull = 0;
  lastWritten = Number.NaN;
  released = true;
  log({ scroll: Math.round(jsScrollBase) });
}

/** 松手 / 惯性结束：沿回弹曲线归零，走完再彻底清掉内联样式 */
function release(spring = REBOUND, cleanupMs = CLEANUP_MS) {
  const list = targets;
  const token = ++releaseToken;
  cancelFrame();
  edge = null;
  absPull = 0;
  lastWritten = Number.NaN;
  jsScroll = false;
  debug.mode = 'none';
  log();
  if (!list.length) return;
  for (const el of list) {
    el.style.setProperty('transition', spring, 'important');
    el.style.setProperty('transform', '', 'important');
  }
  window.setTimeout(() => {
    if (token !== releaseToken || edge) return;
    for (const el of list) {
      el.style.removeProperty('transition');
      el.style.removeProperty('will-change');
      el.style.removeProperty('transform');
    }
    if (list === targets) {
      targets = [];
      prepared = false;
    }
    log();
  }, cleanupMs);
}

/** 无回弹地撤干净（普通滚动、touchcancel） */
function cleanup() {
  releaseToken += 1;
  cancelFrame();
  for (const el of targets) {
    el.style.removeProperty('transition');
    el.style.removeProperty('will-change');
    el.style.removeProperty('transform');
  }
  targets = [];
  prepared = false;
  edge = null;
  absPull = 0;
  lastWritten = Number.NaN;
  jsScroll = false;
  debug.mode = 'none';
  log();
}

/**
 * 拖拽热路径：由 rAF 调用，一帧最多算一次、写一次。
 * 触边之后一次布局都不读 —— 拉伸量只由手指相对触边零点的位移决定。
 * 场景 1（拉出）走开方阻尼，场景 2（回推）1:1 跟手。
 */
function tick() {
  frame = 0;
  if (!touching || axis !== 'y') return;
  if (keyboardOpen()) {
    cleanup();
    touching = false;
    axis = null;
    return;
  }

  const dy = lastY - startY;
  const expected = startScroll - dy;
  log({ dy: Math.round(dy), expected: Math.round(expected) });

  // v3.7.11：橡皮筋归零后的空滑区。浏览器已被 preventDefault、本趟手势不会自己滚，
  // 这里把手指位移 1:1 同步成真实滚动，接上"归零→正常滚动"那段真空。
  if (jsScroll) {
    const target = jsScrollBase + (jsScrollAnchorY - lastY);
    const clamped = Math.min(maxScroll, Math.max(0, target));
    // 反向拉回边界外：顶部又往下拉、底部又往上推 → 退出接管，就地重建橡皮筋。
    // 这里已由 clamped 确认页面贴在边界，不再走下面 expected 的粗筛（那用的是整趟手势 dy）。
    const pullOutAgain = jsScrollEdge === 'top'
      ? clamped <= EDGE_EPS && lastY > prevY
      : clamped >= maxScroll - EDGE_EPS && lastY < prevY;
    if (pullOutAgain) {
      jsScroll = false;
      released = false;
      prepare();
      if (targets.length) {
        edge = jsScrollEdge;
        anchorY = lastY;
        lastOver = 0;
        absPull = 0;
        write(0);
        log({ edgeY: Math.round(anchorY) });
      }
      return;
    }
    setScroll(target);
    debug.mode = 'js-scroll';
    log({ scroll: Math.round(clamped) });
    return;
  }

  if (!edge) {
    // 还没到边：推算离边界还远就完全不碰布局；进入 240px 内才读真实位置精判
    if (expected >= EDGE_NEAR && expected <= maxScroll - EDGE_NEAR) return;
    const position = realScroll();
    log({ scroll: Math.round(position) });
    let dir: Edge | null = position <= EDGE_EPS
      ? 'top'
      : maxScroll > EDGE_EPS && position >= maxScroll - EDGE_EPS ? 'bottom' : null;

    // 方向闸门：到边不等于要拉伸，手指必须正朝「边界外」拉才算。
    // 页面停在顶部时 realScroll=0 恒成立，若只看位置，手指「上滑起手」
    // （本是想正常往下滚页面）也会被误判成触顶，建 edge 后立刻 over<=0
    // 走 handBack 把 released 置 true 且不再恢复 —— 之后真正拉出的橡皮筋
    // 抬手时 wasPulling 就成了 false，回弹走无动画的 cleanup，一帧跳回原位。
    // 加上方向判断后：顶部只在手指往下拉、底部只在手指往上推时才建 edge；
    // 顺着页面可滚方向滑的（顶部上滑 / 底部下滑）交给浏览器正常滚动。
    if (dir === 'top' && lastY <= prevY) dir = null;
    if (dir === 'bottom' && lastY >= prevY) dir = null;
    if (!dir) return;
    prepare();
    if (!targets.length) return;
    edge = dir;
    anchorY = lastY;
    lastOver = 0;
    // 重新接管：上一段手势可能已交还滚动（released=true），现在手指又拉出了
    // 新的橡皮筋，必须复位，否则抬手时 wasPulling=false 会走无动画清理。
    released = false;
    write(0);
    log({ edgeY: Math.round(anchorY) });
    return;
  }

  // 已触边：over 是手指越过零点的距离，正数表示往外拉的方向
  const over = edge === 'top' ? lastY - anchorY : anchorY - lastY;
  log({ over: Math.round(over) });
  if (over <= 0) {
    // 手指推回零点以内：交还滚动，之后的移动交给浏览器（场景 2 的收尾）
    handBack();
    return;
  }

  const delta = over - lastOver;
  lastOver = over;
  const sign = edge === 'top' ? 1 : -1;
  if (delta >= 0) {
    // 拉出（场景 1）：按增量累计、不越过开方上限。推回一点再拉出不会从当前值跳到曲线值
    absPull = Math.min(resist(over), absPull + delta);
  } else {
    // 回推（场景 2）：手指走多少内容退多少，1:1 跟手，不套曲线
    absPull = Math.max(0, absPull + delta);
  }
  write(sign * absPull);
}

/**
 * 橡皮筋期间挡住原生滚动（必须 passive:false 且只给这一个 listener）。
 * 一旦合成器开始滚，touchmove 的 cancelable 会变 false，所以要在触边前
 * 抢先挡住「朝边界外拉」的第一帧；已经触边则一律挡住。
 */
function blockNativeScroll(event: TouchEvent) {
  if (!touching || !event.cancelable) return;
  // jsScroll 阶段由 JS 单独驱动滚动，继续挡住原生，避免双份位移
  if (jsScroll) {
    event.preventDefault();
    return;
  }
  if (released) return;
  if (edge) {
    event.preventDefault();
    return;
  }
  if (axis !== 'y') return;
  const dy = lastY - startY;
  if ((startScroll <= EDGE_EPS && dy > 0)
    || (maxScroll > EDGE_EPS && startScroll >= maxScroll - EDGE_EPS && dy < 0)) {
    event.preventDefault();
  }
}

function pushSample(y: number, t: number) {
  samples.push({ y, t });
  while (samples.length > 2 && t - samples[0].t > 140) samples.shift();
}

/** 抬手速度 px/ms，正数代表内容继续往下滚（朝底部） */
function releaseSpeed(): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  if (dt < 12 || dt > 220) return 0;
  return (first.y - last.y) / dt;
}

function stopFling() {
  flingToken += 1;
  fling = null;
  if (flingTimer) {
    clearTimeout(flingTimer);
    flingTimer = 0;
  }
}

/**
 * 场景 4：惯性撞边。先看页面是不是已经贴在目标边，是就立刻弹；
 * 否则监听 scroll，等惯性真的撞到边界那一下再补回弹（不预测、不提前）。
 */
function checkFling() {
  if (!fling || touching) return;
  const now = performance.now();
  if (now - fling.startedAt > FLING_WATCH_MS) {
    stopFling();
    cleanup();
    return;
  }
  const position = measureScroll();
  log({ scroll: Math.round(position), at: atEdge(fling.edge, position) ? fling.edge : '' });

  // 实测撞边速度：两次滚动事件的位移 / 时间，比指数模型准
  const dt = now - fling.lastAt;
  if (dt >= 8 && dt <= 200) {
    const instant = Math.abs(position - fling.lastPos) / dt;
    if (instant < 8 && instant > fling.impact) fling.impact = instant;
  }
  fling.lastPos = position;
  fling.lastAt = now;

  if (!atEdge(fling.edge, position)) return;

  const decayed = fling.speed * Math.exp(-(now - fling.startedAt) / FLING_TAU);
  const impact = Math.min(fling.speed, fling.impact > 0.02 ? fling.impact : decayed);
  const direction = fling.edge;
  stopFling();
  if (impact < FLING_IMPACT_MIN) {
    cleanup();
    return;
  }
  playInertia(direction, impact);
}

/** 场景 4 的动画：先顺着手感顶出去一段，再交给回弹曲线收回 */
function playInertia(direction: Edge, speed: number) {
  prepare();
  if (!targets.length) return;
  const peak = Math.min(INERTIA_MAX, Math.max(INERTIA_MIN, speed * INERTIA_GAIN));
  const sign = direction === 'top' ? 1 : -1;
  const startedAt = performance.now();
  for (const el of targets) {
    el.style.setProperty('transition', 'none', 'important');
    el.style.setProperty('will-change', 'transform');
  }
  lastWritten = Number.NaN;
  debug.mode = 'inertia';
  log({ peak: Math.round(peak * 10) / 10 });

  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - startedAt) / INERTIA_RISE_MS));
    const eased = 1 - Math.pow(1 - t, 2); // 起手快、临近顶点收住，像惯性顶出去
    write(sign * peak * eased);
    if (t < 1) {
      frame = requestAnimationFrame(step);
    } else {
      frame = 0;
      release(SNAP);
    }
  };
  frame = requestAnimationFrame(step);
}

function beginFling(speed: number) {
  const direction: Edge = speed > 0 ? 'bottom' : 'top';
  const token = ++flingToken;
  const now = performance.now();
  fling = {
    edge: direction,
    speed: Math.abs(speed),
    startedAt: now,
    lastPos: measureScroll(),
    lastAt: now,
    impact: 0,
    token
  };
  log({ speed: Math.round(Math.abs(speed) * 100) / 100 });
  // 短定时器兜底：部分 WebView 里 scroll 事件冒不到 document
  flingTimer = window.setTimeout(() => {
    flingTimer = 0;
    if (!fling || fling.token !== token) return;
    checkFling();
    if (fling && fling.token === token) stopFling();
  }, FLING_WATCH_MS);
  checkFling();
}

/* ── 事件 ─────────────────────────────────────────────── */

function onTouchStart(event: TouchEvent) {
  stopFling();
  cleanup();
  // 这里运行在 document 捕获阶段，早于球体自身监听；必须先识别并整趟退出，
  // 否则后面的页面滚动/回弹状态已经建立，球体再 stopPropagation 也来不及。
  if (isMusicOrbTouch(event) || keyboardOpen() || event.touches.length !== 1) {
    touching = false;
    axis = null;
    return;
  }
  buildHosts();
  const max = measureMax();
  // 内容不满一屏就没有「撞到边界」这回事
  if (max <= AXIS_SLOP) {
    touching = false;
    return;
  }
  const p = event.touches[0];
  touching = true;
  startX = p.clientX;
  startY = lastY = prevY = p.clientY;
  axis = null;
  released = false;
  startScroll = measureScroll();
  maxScroll = max;
  samples.length = 0;
  pushSample(p.clientY, event.timeStamp);
  log({ max: Math.round(max), scroll: Math.round(startScroll) });
}

function onTouchMove(event: TouchEvent) {
  if (!touching) return;
  if (event.touches.length !== 1) {
    if (edge) release();
    touching = false;
    return;
  }
  const p = event.touches[0];
  // prevY 保留本帧之前的手指位置，tick 用它判方向；lastY 才是最新位置
  prevY = lastY;
  lastY = p.clientY;
  pushSample(lastY, event.timeStamp);

  if (axis === null) {
    const dx = p.clientX - startX;
    const dy = lastY - startY;
    if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return;
    // 横滑交给滑块 / 列表，绝不插手
    axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
    if (axis === 'y') prepare();
  }
  if (axis !== 'y') return;
  // 一帧只算一次、写一次：和渲染同一拍
  if (!frame) frame = requestAnimationFrame(tick);
}

function onTouchEnd() {
  if (!touching) return;
  // 把 touchend 前最后一段位移补上，别丢最后几像素
  if (axis === 'y' && frame) {
    cancelFrame();
    tick();
  }
  const wasPulling = !!edge && !released;
  const wasJsScroll = jsScroll;
  const speed = axis === 'y' ? releaseSpeed() : 0;
  const endedAxis = axis;
  touching = false;
  axis = null;

  // jsScroll 是 JS 手动滚动，抬手后没有原生惯性可观察；直接干净收尾，
  // 别走 beginFling 空转（否则 1.6s 内偶发 scroll 事件可能误触发撞边回弹）
  if (wasJsScroll) {
    cleanup();
    return;
  }
  if (wasPulling) {
    // 场景 3：手指还在拉伸状态就松开了 → 直接回弹
    release();
    return;
  }
  if (endedAxis === 'y' && Math.abs(speed) >= FLING_MIN) {
    // 场景 4：交给惯性观察
    beginFling(speed);
    return;
  }
  cleanup();
}

function onTouchCancel() {
  touching = false;
  axis = null;
  stopFling();
  if (edge) release();
  else cleanup();
}

function onScroll() {
  if (fling && !touching && !keyboardOpen()) checkFling();
}

export function useContentBounce(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __bounce?: typeof debug }).__bounce = debug;
  const passive: AddEventListenerOptions = { passive: true, capture: true };
  document.addEventListener('touchstart', onTouchStart, passive);
  document.addEventListener('touchmove', onTouchMove, passive);
  document.addEventListener('touchend', onTouchEnd, passive);
  document.addEventListener('touchcancel', onTouchCancel, passive);
  document.addEventListener('scroll', onScroll, passive);
  // 只有这一个 listener 需要 passive:false，且逻辑仍在上面 passive 的那个里
  document.addEventListener('touchmove', blockNativeScroll, { passive: false, capture: true });
}
