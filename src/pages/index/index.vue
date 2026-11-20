<template>
  <view class="page" :class="{ 'has-nav': experimental, 'is-turning': turning, 'is-thaw': thaw, 'is-thawing': thawing }">
    <view
      class="tab-track"
      :class="{ 'is-turning': turning }"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="resetGesture"
    >
      <view class="tab-panel" data-tab="0" :class="{ 'is-on': tab === 0, 'is-live': liveTabs.includes(0) }">
        <WordsPanel />
      </view>
      <view v-if="experimental" class="tab-panel" data-tab="1" :class="{ 'is-on': tab === 1, 'is-live': liveTabs.includes(1) }">
        <AiPanel />
      </view>
      <view v-if="experimental" class="tab-panel" data-tab="2" :class="{ 'is-on': tab === 2, 'is-live': liveTabs.includes(2) }">
        <MusicPanel />
      </view>
    </view>

    <BottomNav v-if="experimental" :current="tab" :preview="previewTab" :sync="turning" @pick="go" />
  </view>

  <!-- 音乐律动悬浮球：放在 .page 之外，fixed 不受页面 transform / overflow 影响。
       是否有播放由它自己订阅播放状态判断，三个板块都能用。 -->
  <MusicOrb />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import WordsPanel from '@/components/panels/WordsPanel.vue';
import AiPanel from '@/components/panels/AiPanel.vue';
import MusicPanel from '@/components/panels/MusicPanel.vue';
import BottomNav from '@/components/BottomNav.vue';
import MusicOrb from '@/components/MusicOrb.vue';
import { TAB_ORDER } from '@/config/tabs';
import { setChatActive } from '@/utils/backNav';
import { useSettingsStore } from '@/stores/settings';
import { useLabStore } from '@/stores/lab';
import { dampBeyond, poseTransform, settleMs, shouldCommit, spanMs } from '@/utils/tabMotion';

const TAB_KEY = 'ky_v1_tab';
const LAST_TAB = 2;

const settings = useSettingsStore();
const lab = useLabStore();

const tab = ref(readTab());
const experimental = computed(() => settings.experimental);

/** 转场中：两个（跨格时三个）面板同时摆进 3D 场景，页面锁成一屏 */
const turning = ref(false);
/** 需要以 3D 层显示的面板（tab 值） */
const liveTabs = ref<number[]>([]);
/** 已经确定要翻过去、但 tab 还没提交：底栏胶囊提前跟着走 */
const previewTab = ref<number | null>(null);

/* ── 落地「结霜」（v3.7.1）──
   转场期间面板里的 backdrop-filter 被整片关掉（3D 变换下每帧重采样，必闪）。
   如果落地那一帧直接恢复，就是「全透明 → 磨砂」的一帧跳变，用户感知到的卡顿
   正是这一帧。现在的做法：落地先挂 is-thaw 把玻璃按到 blur(0)，下一帧再放开
   过渡，让它补间到用户当前设定的档位（雾玻璃 / 液态玻璃都由 CSS 变量给出，
   这里不需要分叉）。 */
const thaw = ref(false);
const thawing = ref(false);
/** 结霜时长：v3.7.2 从 400ms 放到 800ms（用户反馈「变太快，不像 400ms」）。
 *  与同文件 `.page.is-thawing` 里的 transition 时长必须完全一致，改一处等于改两处。 */
const THAW_MS = 800;
let thawFrame = 0;
let thawTimer = 0;

/** 中断/收尾：把结霜状态整个摘掉（转场开始时也要调用，避免两条规则打架） */
function endThaw() {
  if (thawFrame) window.cancelAnimationFrame(thawFrame);
  thawFrame = 0;
  if (thawTimer) window.clearTimeout(thawTimer);
  thawTimer = 0;
  thaw.value = false;
  thawing.value = false;
}

/**
 * 开始结霜：必须等 is-thaw 真的画过一帧再放开过渡。
 * 同一帧里「blur(0) → 目标值」浏览器不会补间，会被合并成一次跳变。
 */
function startThaw() {
  if (thawFrame) window.cancelAnimationFrame(thawFrame);
  if (thawTimer) window.clearTimeout(thawTimer);
  thawFrame = window.requestAnimationFrame(() => {
    // 读一次布局，逼浏览器把 blur(0) 这版样式算出来（起点必须落在 DOM 上）
    if (typeof document !== 'undefined') void document.documentElement.offsetHeight;
    // 双 rAF：这一帧画的还是 blur(0)，下一帧才改终点，浏览器才会补间
    thawFrame = window.requestAnimationFrame(() => {
      thawFrame = 0;
      thawing.value = true;
      thaw.value = false;
      thawTimer = window.setTimeout(() => {
        thawTimer = 0;
        thawing.value = false;
      }, THAW_MS + 120);
    });
  });
}

/**
 * 落地：面板回到文档流、页面解锁，同时让玻璃从 0 补间回来。
 * thaw 与 turning 必须一起改 —— Vue 会把两个 class 合进同一次 patch，
 * 浏览器只会看到「is-turning 没了，但 is-thaw 在」这一个状态。
 */
function land(after?: () => void) {
  thaw.value = true;
  turning.value = false;
  liveTabs.value = [];
  turn = null;
  nextTick(() => {
    after?.();
    startThaw();
  });
}

interface TurnState {
  from: number;
  to: number;
  /** +1 = 去视觉上的右邻（手指往左滑），-1 = 去左邻 */
  dir: 1 | -1;
  /** 跨几格：手势恒为 1，点底栏跨格时可能是 2 */
  span: number;
  progress: number;
  /** 起手时页面滚到哪，转场层要照着这个位置铺内容 */
  scroll: number;
  /** 到头了还往里拖：只跟 20%，松手弹回 */
  blocked: boolean;
}

let turn: TurnState | null = null;
let raf = 0;
let pending = 0;
let savedScroll = 0;
/** 每个板块各自记住离开时的滚动位置（tab 值 → window.scrollY）。
 *  面板是 display:none 切换、共用一条 window 滚动，切走再切回若不记住就会回到顶。
 *  横滑来回、点底栏来回都走这份记忆，只在本次会话内有效（冷启动各页从顶开始）。 */
const scrollMemo: Record<number, number> = {};
/** 单词主页（tab 值 0）不记位置：每次都从顶部开始，让顶部的励志语录和逐层飞入动画重新可见。
 *  否则从别的板块切回、主页停在下方时，会先看到一片空白，过一会儿动画才飞进来，很诡异。 */
const HOME_TAB = 0;
/** 切到某页应恢复的滚动位置：主页恒为 0，其余页用记忆值（没记过也是 0） */
function restorePos(value: number): number {
  return value === HOME_TAB ? 0 : (scrollMemo[value] ?? 0);
}

function readTab(): number {
  // 实验性功能关着时只有单词板块一屏：存档里残留的 AI / 音乐位置要丢掉，
  // 否则冷启动会停在一个没被渲染的面板上（白屏）
  if (!settings.experimental) return 0;
  try {
    const saved = Number(uni.getStorageSync(TAB_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved <= LAST_TAB ? saved : 0;
  } catch {
    return 0;
  }
}

/** tab 值 → 视觉位置（AI 在 0、单词在 1、音乐在 2） */
function visual(value: number) {
  return TAB_ORDER.indexOf(value);
}

function persist(value: number) {
  try {
    uni.setStorageSync(TAB_KEY, value);
  } catch {
    // 存不了就只在本次会话里记住，不影响切换
  }
}

function reduceMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 键盘弹着的时候整页是锁死的，硬做 3D 会和锁窗布局打架，直接切 */
function keyboardLocked() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('keyboard-chat');
}

function panels(): HTMLElement[] {
  if (typeof document === 'undefined') return [];
  return Array.from(document.querySelectorAll('.tab-panel')) as HTMLElement[];
}

/** 把一个面板摆到 3D 场景里的 offset 位置 */
function placePanel(el: HTMLElement, offset: number, width: number) {
  el.style.transform = poseTransform(offset, width);
  // 越靠近镜头越靠上：换页时新页压在旧页上面，交界处不会闪
  el.style.zIndex = String(20 - Math.round(Math.min(2, Math.abs(offset)) * 6));
}

/**
 * 按进度重新摆所有面板。
 * base 是「此刻正对镜头的位置」，用视觉坐标表示；每个面板的 offset
 * 就是它离镜头的页数。progress 走到 span 时目标页正好落在 0。
 */
function paint(progress: number) {
  if (!turn) return;
  const width = window.innerWidth || 1;
  const base = visual(turn.from) + turn.dir * progress;
  for (const el of panels()) {
    const value = Number(el.dataset.tab);
    if (!liveTabs.value.includes(value)) continue;
    if (!el.style.getPropertyValue('--tab-shift')) {
      // 被翻走的页照着起手时的真实滚动位置铺；新进来的页照着它上次离开时记住的位置铺
      // （没有记忆就是 0，即从顶开始）——这样转场动画里目标页就直接落在该停的位置，
      // 落地时 window.scrollTo 接上同一个数，不会先闪一下顶部再跳回中间。
      const remembered = restorePos(value);
      el.style.setProperty('--tab-shift', `${value === turn.from ? turn.scroll : remembered}px`);
    }
    placePanel(el, visual(value) - base, width);
  }
}

function flush() {
  raf = 0;
  paint(pending);
}

function schedule(progress: number) {
  pending = progress;
  if (raf) return;
  raf = window.requestAnimationFrame(flush);
}

function cancelFrame() {
  if (raf) window.cancelAnimationFrame(raf);
  raf = 0;
}

/** 收尾的兜底定时器 + transitionend 监听，落地时一起摘掉，避免叠加 */
let settleTimer = 0;
let settleOff: (() => void) | null = null;

function stopSettle() {
  if (settleTimer) window.clearTimeout(settleTimer);
  settleTimer = 0;
  if (settleOff) settleOff();
  settleOff = null;
}

/**
 * 等收尾动画真的走完再落地。
 * 优先听 transitionend：它在终点那一帧就回调，比死等 ms+70 早得多，
 * 不会让旧页在屏幕上多停三四帧。定时器只作兜底（面板被打断时事件不会来）。
 */
function whenSettled(targets: HTMLElement[], ms: number, cb: () => void) {
  stopSettle();
  let fired = false;
  const once = () => {
    if (fired) return;
    fired = true;
    stopSettle();
    cb();
  };
  const onEnd = (event: Event) => {
    const e = event as TransitionEvent;
    if (e.propertyName !== 'transform') return;
    if (!targets.includes(e.target as HTMLElement)) return;
    once();
  };
  for (const el of targets) el.addEventListener('transitionend', onEnd);
  settleOff = () => {
    for (const el of targets) el.removeEventListener('transitionend', onEnd);
  };
  settleTimer = window.setTimeout(once, ms + 40);
}

/** 清掉所有内联样式，让面板回到文档流里的原样 */
function clearPanels() {
  for (const el of panels()) {
    el.style.transform = '';
    el.style.transition = '';
    el.style.zIndex = '';
    el.style.removeProperty('--tab-shift');
  }
}

/**
 * 开始一次转场：把 from/to 两块面板挂成 3D 层，页面锁一屏。
 * 目标越界（已经到头）时只有当前页参与，用来做撞边回弹。
 */
function beginTurn(to: number, dir: 1 | -1, span: number, blocked: boolean) {
  /* 兜底：实验性功能关着时只有一屏，不存在「翻到哪」这回事。
     正常路径已经在 onTouchStart 拦住了，这里防的是以后新加的调用点。 */
  if (!experimental.value) return;
  // 上一轮的结霜还没走完就又要转：直接收掉，别让两条规则同时作用在卡片上
  endThaw();
  turn = {
    from: tab.value,
    to,
    dir,
    span,
    progress: 0,
    scroll: typeof window !== 'undefined' ? Math.max(0, window.scrollY || 0) : 0,
    blocked
  };
  savedScroll = turn.scroll;
  // 离开这一页前先把它此刻的位置存下来，之后切回来要用（主页不记，恒回顶）
  if (turn.from !== HOME_TAB) scrollMemo[turn.from] = turn.scroll;
  const live = [tab.value];
  // 跨格时把中间那块也挂上，否则动画中途会露出空白
  for (let i = 1; i < span; i++) live.push(TAB_ORDER[visual(tab.value) + dir * i]);
  if (!blocked) live.push(to);
  liveTabs.value = live.filter((v) => typeof v === 'number');
  turning.value = true;
  nextTick(() => {
    if (!turn) return;
    // 首帧先不带过渡：起手就是要跟手，不能从上一处位置滑过来
    for (const el of panels()) el.style.transition = 'none';
    paint(0);
  });
}

/** 收尾：commit=true 翻过去，false 弹回来 */
function finish(commit: boolean) {
  if (!turn) return;
  const state = turn;
  const target = commit ? state.span : 0;
  const remain = Math.abs(target - state.progress);
  const ms = Math.round(settleMs(remain) * (state.span > 1 ? 1.15 : 1));
  cancelFrame();
  if (commit) previewTab.value = state.to;
  state.progress = target;
  const animate = panels().filter((el) => liveTabs.value.includes(Number(el.dataset.tab)));
  for (const el of animate) {
    el.style.transition = `transform ${ms}ms cubic-bezier(.22,.9,.3,1)`;
    // 读一次布局，让浏览器先把「起点」记下来，否则同一帧里改两端不会补间
    void el.offsetWidth;
  }
  paint(target);

  const done = () => {
    // 收尾期间可能已经被新手势接管
    if (turn !== state) return;
    previewTab.value = null;
    // 翻过去：落到目标页该停的位置（主页恒回顶）；弹回来：回到起手页原位
    const y = commit ? restorePos(state.to) : savedScroll;
    if (commit) {
      tab.value = state.to;
      persist(state.to);
    }
    clearPanels();
    // 面板回到文档流之后页面高度才恢复，这时再校正滚动位置；
    // 玻璃的「结霜」由 land() 统一接手
    land(() => {
      if (typeof window === 'undefined') return;
      window.scrollTo({ top: y, behavior: 'auto' });
    });
  };
  whenSettled(animate, ms, done);
}

/** 底栏点击：能动画就动画，跨格也走同一套坐标，只是跨度大一点 */
function go(next: number) {
  const target = Math.min(Math.max(next, 0), experimental.value ? LAST_TAB : 0);
  if (target === tab.value) return;
  // 转场还没落地就再点一下：直接丢掉，别在半路改 tab（会把两层摆位搅乱）
  if (turn || turning.value) return;
  const instant = !experimental.value || reduceMotion() || keyboardLocked();
  if (instant) {
    // 这条路径不经过 beginTurn，离开页的位置要在这里自己记下（主页不记）
    if (typeof window !== 'undefined' && tab.value !== HOME_TAB) scrollMemo[tab.value] = Math.max(0, window.scrollY || 0);
    tab.value = target;
    persist(target);
    if (typeof window !== 'undefined') window.scrollTo({ top: restorePos(target), behavior: 'auto' });
    return;
  }
  const fromPos = visual(tab.value);
  const toPos = visual(target);
  const dir: 1 | -1 = toPos > fromPos ? 1 : -1;
  const span = Math.abs(toPos - fromPos);
  beginTurn(target, dir, span, false);
  // 点底栏也要让胶囊和页面同时起步（以前等动画落地才提交 tab，胶囊晚 280ms 才动）
  previewTab.value = target;
  const ms = Math.round(spanMs(span));
  nextTick(() => {
    if (!turn) return;
    const state = turn;
    window.requestAnimationFrame(() => {
      if (!turn || turn !== state) return;
      const animate = panels().filter((el) => liveTabs.value.includes(Number(el.dataset.tab)));
      for (const el of animate) {
        el.style.transition = `transform ${ms}ms cubic-bezier(.22,.9,.3,1)`;
        void el.offsetWidth;
      }
      state.progress = span;
      paint(span);
      whenSettled(animate, ms, () => {
        if (!turn || turn !== state) return;
        tab.value = target;
        persist(target);
        previewTab.value = null;
        clearPanels();
        land(() => window.scrollTo({ top: restorePos(target), behavior: 'auto' }));
      });
    });
  });
}

/** 关掉实验性功能时，正停在 AI / 音乐上会看到空白页，直接收回单词板块 */
watch(experimental, (on) => {
  if (on) return;
  /* 正在转场时 go() 会直接丢弃（它不允许半路改 tab）。但这两块面板马上
     被 v-if 卸载，tab 却还停在 1 / 2，整屏就空白了 —— 所以先把转场拆干净。 */
  if (turn || turning.value) {
    stopSettle();
    clearPanels();
    turn = null;
    turning.value = false;
    liveTabs.value = [];
    previewTab.value = null;
  }
  endThaw();
  go(0);
});

/** 离开 AI 板块（tab 1）时清掉"停在二级对话页"的标记：
 *  面板是 CSS 切换、不会 unmount，若用户横滑走时还停在二级对话页，
 *  标记会残留，导致在别的板块按系统返回键被误拦截。 */
watch(tab, (now) => {
  if (now !== 1) setChatActive(false);
});

onShow(() => {
  lab.init();
});

/* ── 左右滑动：这次是真的跟手 ──
   方向跟底栏一致：AI 在最左、单词在中、音乐在最右，
   手指往右移露出来的是左边那块，往左移才是右边那块。
   起手先锁一次轴向，锁成横向就一路认到底，不再看纵向漂移 ——
   AI 面板内容长，斜着滑很容易被判成"在竖着滚"，音乐就永远到不了。 */
const EDGE_GUARD = 36;
const AXIS_LOCK = 10;
const SWIPE_SLOP = 160;
const SWIPE_MIN = 44;
let startX = 0;
let startY = 0;
let startAt = 0;
let axis: '' | 'x' | 'y' = '';
/** 已经进入转场并跟手拖过 */
let dragging = false;
let samples: { x: number; t: number }[] = [];

function onTouchStart(event: TouchEvent) {
  axis = '';
  dragging = false;
  samples = [];
  /* 实验性功能关着时只有单词板块一屏，横向手势什么都不该做。
     这里是唯一的闸口：startAt 留 0，后面的 move / end 第一行就会返回，
     纵向滚动完全不受影响。
     必须在起手拦，不能只靠 onTouchEnd 的 step() —— 拖动那条路走的是
     beginTurn(TAB_ORDER[targetPos])，不经过 go() 的 clamp，会把 tab 改成
     1 / 2，而这两块面板是 v-if 渲染的，结果就是滑到一片空白。 */
  if (!experimental.value) {
    startAt = 0;
    return;
  }
  if (turn) {
    // 上一段收尾还没走完，这一下手势不接
    startAt = 0;
    return;
  }
  const touch = event.touches?.[0];
  if (!touch) return;
  // uni 会把 event.target 转成普通对象，不能靠它调用 closest()。
  // 直接按真实触点找 DOM，保证表格、代码块和进度条都能独占本趟手势。
  const target = typeof document !== 'undefined'
    ? document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
    : null;
  // 输入框挪光标、AI 宽表格/代码块横向阅读、音乐进度拖动，都独占本趟手势。
  // 必须在 touchstart 就退出；等 move 再判断时，页面转场和浏览器滚动已经可能开始。
  if (target && typeof target.closest === 'function'
    && target.closest('input, textarea, [data-horizontal-scroll], .md-table, .md-pre, .player-slider')) {
    startAt = 0;
    return;
  }
  // 贴着屏幕左右边缘起手的是系统返回手势，别和它抢
  const width = window.innerWidth || 0;
  if (touch.clientX < EDGE_GUARD || touch.clientX > width - EDGE_GUARD) {
    startAt = 0;
    return;
  }
  startX = touch.clientX;
  startY = touch.clientY;
  startAt = Date.now();
  samples.push({ x: touch.clientX, t: startAt });
}

function trackSample(x: number) {
  const now = Date.now();
  samples.push({ x, t: now });
  if (samples.length > 6) samples.shift();
}

/** 最近一小段的横向速度（px/ms，正数表示往右） */
function swipeSpeed() {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const first = samples[0];
  // 松手前手指已经停了：那就是"放下去"，不是"甩出去"
  if (Date.now() - last.t > 90) return 0;
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return (last.x - first.x) / dt;
}

function onTouchMove(event: TouchEvent) {
  if (!startAt || axis === 'y') return;
  const touch = event.touches?.[0];
  if (!touch) return;
  const dx = touch.clientX - startX;
  const dy = touch.clientY - startY;
  if (!axis) {
    if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
    // 横向要明确压过纵向，才算是想翻板块
    axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    if (axis === 'y') {
      startAt = 0;
      return;
    }
  }
  trackSample(touch.clientX);
  if (reduceMotion() || keyboardLocked()) return;

  const width = window.innerWidth || 1;
  const dir: 1 | -1 = dx > 0 ? -1 : 1;
  const pos = visual(tab.value);
  const targetPos = pos + dir;
  const blocked = targetPos < 0 || targetPos >= TAB_ORDER.length;

  if (!dragging) {
    if (Math.abs(dx) < 4) return;
    dragging = true;
    beginTurn(blocked ? tab.value : TAB_ORDER[targetPos], dir, blocked ? 0 : 1, blocked);
  }
  if (!turn) return;
  const signed = turn.dir === 1 ? -dx : dx;
  const progress = turn.blocked
    ? dampBeyond(signed) / width
    : Math.min(spanOf(turn), Math.max(0, signed / width));
  turn.progress = progress;
  schedule(progress);
}

function spanOf(state: TurnState) {
  return state.blocked ? 1 : state.span;
}

function onTouchEnd(event: TouchEvent) {
  if (!startAt) return;
  const touch = event.changedTouches?.[0];
  const elapsed = Date.now() - startAt;
  const locked = axis;
  const wasDragging = dragging;
  const state = turn;
  startAt = 0;
  axis = '';
  dragging = false;
  // 部分 WebView 的 touchend 不带 changedTouches，退回到最后一个移动点
  const endX = touch ? touch.clientX : samples.length ? samples[samples.length - 1].x : startX;
  const endY = touch ? touch.clientY : startY;
  const dx = endX - startX;
  const dy = endY - startY;
  const speed = swipeSpeed();

  if (wasDragging && state) {
    // 只有沿着「切到目标」方向甩才算数，反着甩是要回去。
    // 不卡总时长：跟手拖动时用户可能慢慢比划半天才松手，那也该认。
    const along = state.dir === 1 ? -speed : speed;
    const commit = !state.blocked && shouldCommit(state.progress, Math.max(0, along));
    finish(commit);
    return;
  }

  if (elapsed > 900) return;
  if (locked !== 'x') return;
  if (Math.abs(dx) < SWIPE_MIN) return;
  // 锁成横向之后又一路往下拉，多半是想滚页面
  if (Math.abs(dy) > SWIPE_SLOP) return;
  step(dx > 0 ? -1 : 1);
}

/** 按视觉顺序挪一格：+1 往右（右邻），-1 往左（左邻） */
function step(direction: -1 | 1) {
  const at = visual(tab.value);
  const next = at + direction;
  if (at < 0 || next < 0 || next >= TAB_ORDER.length) return;
  go(TAB_ORDER[next]);
}

function resetGesture() {
  if (dragging && turn && turn.from !== turn.to) finish(false);
  startAt = 0;
  axis = '';
  dragging = false;
}

onBeforeUnmount(() => {
  cancelFrame();
  stopSettle();
  endThaw();
  previewTab.value = null;
  if (turn) {
    clearPanels();
    turn = null;
  }
});
</script>

<style scoped>
/* 撑满一屏：面板内容短的时候（AI 还没接入、音乐只有空曲库），
   下面半屏是页面背景而不是 tab-track，从那儿起手滑就收不到事件。
   有底栏时扣掉底部让位的那段，免得短页面凭空多出一条滚动。 */
.tab-track {
  min-height: 100vh;
}
.page.has-nav .tab-track {
  min-height: calc(100vh - 164rpx - max(var(--inset-bottom, 0px), env(safe-area-inset-bottom, 0px)));
}
.tab-panel { display: none; }
.tab-panel.is-on { display: block; }

/* ── 旋转木马转场（v3.6.0）────────────────────────────────────
   面板脱离文档流、全部摆进同一个 3D 场景：镜头固定在屏幕中心，
   当前页正对，邻页绕屏幕中轴转到侧后方。摆位由 tabMotion.ts 算，
   这里只负责把「一屏、可裁剪、不留滚动」的舞台搭好。
   注意：.page 此时必须锁成一屏并去掉上下 padding，让面板的 0 点
   正好落在视口顶边 —— AI 顶栏是 fixed，差 28rpx 就会跳一下。 */
.page.is-turning {
  height: 100vh;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
.page.is-turning .tab-track {
  position: relative;
  height: 100vh;
  min-height: 0;
  /* .page 的 padding 已经归零，舞台天然铺满视口宽，不要再补负 margin，
     否则每个面板会宽出 28rpx，两页交界处对不齐 */
  perspective: 850px;
  perspective-origin: 50% 50%;
}
.tab-panel.is-live {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100vh;
  padding: var(--pad-t, 0px) var(--pad-x, 28rpx) 0;
  overflow: hidden;
  backface-visibility: hidden;
  transform-origin: 50% 50%;
  will-change: transform;
}
/* 转场期间无条件关掉面板里的毛玻璃：perspective + rotateY 下 backdrop-filter
   每帧都要在 3D 空间重采样背景，还会把另一块正在转的面板采进去 —— 这是采样
   逻辑问题，不是算力问题（天玑 9400+ 一样闪）。v3.6.4 曾把它做成设置开关，
   v3.7.1 起**永久移除**：默认就是关，不再提供「转场保留实时模糊」的路径。
   底栏不在面板里，不受这条影响，不会突然变清晰。 */
.page.is-turning :deep(.tab-panel *) {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
/* 落地结霜：转场结束时如果让上面的 none 直接失效，卡片会在同一帧从「全透明」
   跳到「磨砂」，用户感知到的卡顿就是这一帧。这里先把玻璃按到 blur(0)（视觉上
   等价于 none），下一帧再放开过渡，补间到元素自己那份 backdrop-filter ——
   雾玻璃 / 液态玻璃的模糊半径、饱和、亮度全都来自 CSS 变量，所以不用按档位分叉，
   用户调成什么样，落地就结霜成什么样。 */
.page.is-thaw :deep(.tab-panel .glass-card) {
  -webkit-backdrop-filter: blur(0px) saturate(100%) brightness(100%) !important;
  backdrop-filter: blur(0px) saturate(100%) brightness(100%) !important;
}
.page.is-thawing :deep(.tab-panel .glass-card) {
  /* 800ms 与 TS 里的 THAW_MS 保持一致 */
  transition: -webkit-backdrop-filter 800ms cubic-bezier(.25,.7,.3,1), backdrop-filter 800ms cubic-bezier(.25,.7,.3,1);
}
/* 起手时页面滚到哪，转场层就从哪开始铺：内容整体上移同样的距离 */
.tab-panel.is-live > :first-child {
  margin-top: calc(-1 * var(--tab-shift, 0px));
}
/* 底栏压住内容时多留一段，最后一项不会被挡住 */
.page.has-nav { padding-bottom: calc(164rpx + max(var(--inset-bottom, 0px), env(safe-area-inset-bottom, 0px))); }
.page.has-nav.is-turning { padding-bottom: 0; }
</style>
