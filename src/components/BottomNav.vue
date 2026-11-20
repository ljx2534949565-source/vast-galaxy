<template>
  <view class="nav-layer">
    <view
      ref="navRef"
      class="nav glass-card"
      :class="{ 'is-dragging': dragging }"
      role="tablist"
      aria-label="功能切换"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <!-- Q 弹液态玻璃胶囊：拖动时跟着手指走，松手弹回最近一档 -->
      <view
        class="nav-pill"
        :class="{ 'is-ready': ready, 'is-sync': sync }"
        :style="pillStyle"
        aria-hidden="true"
      />
      <button
        v-for="(item, i) in ITEMS"
        :key="item.index"
        class="nav-item"
        :class="{ 'is-active': current === item.index }"
        role="tab"
        :aria-selected="current === item.index"
        :aria-label="item.label"
        @click="onItemClick(i)"
      >
        <view class="nav-icon"><AppIcon :name="item.icon" :size="22" /></view>
        <text class="nav-label">{{ item.label }}</text>
        <view class="nav-glint" />
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { TAB_ITEMS } from '@/config/tabs';
import { playTapFeedback } from '@/utils/feedback';

/** preview：转场已经决定要去哪，但 tab 还没提交。胶囊提前滑过去，和翻页同步 */
const props = defineProps<{ current: number; preview?: number | null; sync?: boolean }>();
const emit = defineEmits<{ pick: [number] }>();

const ITEMS = TAB_ITEMS;
const navRef = ref<HTMLElement | null>(null);
const ready = ref(false);
const dragging = ref(false);
const pillX = ref(0);
const pillWidth = ref(0);
const pillScaleX = ref(1);
const pillScaleY = ref(1);
/** 每个标签中心相对底栏左边的位置（px），横竖屏/平板变了就重新量 */
const centers = ref<number[]>([]);

const activeIndex = computed(() => {
  const wanted = props.preview ?? props.current;
  const at = ITEMS.findIndex((item) => item.index === wanted);
  return at < 0 ? 0 : at;
});

const pillStyle = computed(() => ({
  width: `${pillWidth.value}px`,
  transform: `translate3d(${pillX.value}px, 0, 0) scale(${pillScaleX.value}, ${pillScaleY.value})`
}));

function targetX(index: number) {
  return (centers.value[index] ?? 0) - pillWidth.value / 2;
}

/** uni-app 的 <view> 在 H5 下可能是组件实例而不是裸 DOM，ref 拿不到就直接查 DOM */
function navEl(): HTMLElement | null {
  const fromRef = navRef.value as unknown as HTMLElement | null;
  if (fromRef && typeof fromRef.getBoundingClientRect === 'function') return fromRef;
  if (typeof document === 'undefined') return null;
  return document.querySelector('.nav') as HTMLElement | null;
}

function measure() {
  const nav = navEl();
  if (!nav || typeof nav.getBoundingClientRect !== 'function') return;
  const navRect = nav.getBoundingClientRect();
  const items = Array.from(nav.querySelectorAll('.nav-item')) as HTMLElement[];
  if (items.length !== ITEMS.length) return;
  const first = items[0].getBoundingClientRect();
  if (!first.width) return;
  // 比标签本身窄一点，玻璃片边缘能露出一条底栏底色
  pillWidth.value = Math.max(first.width - 8, 24);
  centers.value = items.map((el) => {
    const rect = el.getBoundingClientRect();
    return rect.left - navRect.left + rect.width / 2;
  });
  if (!ready.value) ready.value = true;
  if (!dragging.value) pillX.value = targetX(activeIndex.value);
}

function syncToActive() {
  if (!centers.value.length) measure();
  pillX.value = targetX(activeIndex.value);
  pillScaleX.value = 1;
  pillScaleY.value = 1;
}

/** 内容区手势换了板块，底栏胶囊也弹过去，两边始终是同一档 */
watch([() => props.current, () => props.preview], () => {
  if (!dragging.value) void nextTick(syncToActive);
});

onMounted(() => {
  void nextTick(() => {
    measure();
    // 首页有淡入动画，首帧尺寸可能还没定；补两拍，胶囊不会停在 0 位
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => measure());
      window.setTimeout(measure, 320);
    }
  });
  if (typeof window !== 'undefined') window.addEventListener('resize', measure);
});
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
});

/* ── 底栏拖动 ──
   胶囊直接跟着手指走：往哪边拖就落在哪一档（跟 iOS 的分段控件一样）。
   内容区那套「往左滑翻到右边」是翻页手势，两者语义不同，互不干扰。
   轴向先锁一次：竖着滚页面时不抢手势；锁成横向后一路认到底。 */
const AXIS_LOCK = 6;
const FLICK_SPEED = 0.5; // px/ms
let startX = 0;
let startY = 0;
let startPillX = 0;
let startAt = 0;
let axis: '' | 'x' | 'y' = '';
let moved = false;
let lastDx = 0;
let lastAt = 0;
let velocity = 0;
let suppressClick = false;

function onTouchStart(event: TouchEvent) {
  const touch = event.touches?.[0];
  if (!touch) return;
  measure();
  startX = touch.clientX;
  startY = touch.clientY;
  startPillX = targetX(activeIndex.value);
  pillX.value = startPillX;
  startAt = Date.now();
  lastAt = startAt;
  lastDx = 0;
  velocity = 0;
  axis = '';
  moved = false;
}

function onTouchMove(event: TouchEvent) {
  if (!startAt) return;
  const touch = event.touches?.[0];
  if (!touch) return;
  const dx = touch.clientX - startX;
  const dy = touch.clientY - startY;
  if (!axis) {
    if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
    axis = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y';
    if (axis === 'y') {
      startAt = 0;
      return;
    }
    dragging.value = true;
  }
  if (axis !== 'x') return;
  moved = true;
  const now = Date.now();
  if (now > lastAt) velocity = (dx - lastDx) / (now - lastAt);
  lastDx = dx;
  lastAt = now;
  let next = startPillX + dx;
  // 到头之后的橡皮筋：还能拖，但位移被压到三成，松手弹回来
  const min = targetX(0);
  const max = targetX(ITEMS.length - 1);
  if (next < min) next = min + (next - min) * 0.3;
  if (next > max) next = max + (next - max) * 0.3;
  pillX.value = next;
  // 拖得越快，玻璃片沿运动方向拉得越长、纵向略扁，像一块有弹性的果冻
  const stretch = Math.min(Math.abs(velocity) * 0.22, 0.18);
  pillScaleX.value = 1 + stretch;
  pillScaleY.value = 1 - stretch * 0.5;
}

function onTouchEnd(event: TouchEvent) {
  if (!startAt) return;
  const touch = event.changedTouches?.[0];
  const dx = touch ? touch.clientX - startX : 0;
  const wasDragging = moved && axis === 'x';
  startAt = 0;
  axis = '';
  // 恢复 transition：从跟手位置 Q 弹到目标档
  dragging.value = false;
  pillScaleX.value = 1;
  pillScaleY.value = 1;
  if (!wasDragging) {
    syncToActive();
    return;
  }

  // 吸附到胶囊中心最近的那一档；快速轻扫再顺着方向多送一格
  let target = 0;
  let best = Infinity;
  const center = pillX.value + pillWidth.value / 2;
  centers.value.forEach((value, index) => {
    const distance = Math.abs(value - center);
    if (distance < best) {
      best = distance;
      target = index;
    }
  });
  if (Math.abs(velocity) > FLICK_SPEED) {
    target = Math.min(ITEMS.length - 1, Math.max(0, target + (velocity < 0 ? -1 : 1)));
  }
  pillX.value = targetX(target);
  // 拖完手指抬起还会补一次 click，别把刚选好的档又点回去
  suppressClick = true;
  if (typeof window !== 'undefined') window.setTimeout(() => { suppressClick = false; }, 320);
  const nextTab = ITEMS[target].index;
  if (nextTab !== props.current) {
    emit('pick', nextTab);
    void playTapFeedback();
  }
}

function onItemClick(index: number) {
  if (suppressClick) return;
  const nextTab = ITEMS[index].index;
  if (nextTab !== props.current) {
    emit('pick', nextTab);
    void playTapFeedback();
  }
  syncToActive();
}
</script>

<style scoped>
/* 底栏浮在内容之上，不参与布局：页面靠 .page.has-nav 的 padding 让位 */
.nav-layer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  justify-content: center;
  padding: 0 24rpx calc(18rpx + max(var(--inset-bottom, 0px), env(safe-area-inset-bottom, 0px)));
  pointer-events: none;
}
/* 不再叠一条从上到下变白的渐隐带：玻璃栏自己会模糊身后的内容，
   那条白渐变反而把内容和栏硬切成两截（深色壁纸上尤其明显） */
.nav {
  position: relative;
  pointer-events: auto;
  display: flex;
  align-items: stretch;
  gap: 6rpx;
  width: 100%;
  max-width: 620px;
  padding: 10rpx;
  border-radius: 30rpx;
  overflow: hidden;
  background: var(--surface-strong);
  border: 1rpx solid var(--glass-edge);
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  box-shadow:
    0 18rpx 44rpx -16rpx var(--shadow-dark),
    inset 0 1rpx 0 var(--glass-sheen);
  /* 横向手势交给 JS，纵向仍然正常滚页面 */
  touch-action: pan-y;
}
/* 注意：液态玻璃 / 暗色的覆盖样式统一放在 App.vue 全局样式里。
   这里曾经写 :global(html.xxx) .nav-pill，但 scoped 编译会把 .nav-pill 丢掉，
   变成直接给 html 根元素刷背景，把根背景壁纸整个盖掉（v3.5.3 修） */

/* 跟着手指走的液态玻璃胶囊 */
.nav-pill {
  position: absolute;
  z-index: 0;
  top: 10rpx;
  bottom: 10rpx;
  left: 0;
  border-radius: 24rpx;
  /* 带一点主题色的玻璃片：纯白底栏上也要看得出这是一块独立的液态玻璃 */
  background: linear-gradient(135deg, rgba(var(--accent-rgb), .30), rgba(255, 255, 255, .16) 46%, rgba(var(--accent-3-rgb), .22));
  border: 1rpx solid rgba(255, 255, 255, .72);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  box-shadow:
    inset 0 1rpx 0 rgba(255, 255, 255, .92),
    inset 0 -1rpx 0 rgba(90, 100, 160, .18),
    0 10rpx 24rpx -10rpx var(--shadow-dark),
    0 2rpx 8rpx -2rpx rgba(80, 90, 150, .22);
  opacity: 0;
  transform-origin: center center;
  transition: transform 460ms cubic-bezier(.2, 1.45, .35, 1), opacity 180ms ease, box-shadow 200ms ease;
  will-change: transform;
  pointer-events: none;
}
/* 斜着划过玻璃片的一道折射高光 */
/* 翻页期间：胶囊的时长必须和页面转场对齐（一格 280ms、跨格 320ms），
   曲线也换成和页面同一条，不然页面已经落位、胶囊还在弹，看着是两段动画。
   松手回弹仍用上面的 460ms 弹性曲线，那段是「液态玻璃」的手感来源。 */
.nav-pill.is-sync {
  transition: transform 300ms cubic-bezier(.22, .9, .3, 1), opacity 180ms ease, box-shadow 200ms ease;
}

.nav-pill::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(115deg, transparent 18%, rgba(255, 255, 255, .38) 34%, transparent 52%);
  pointer-events: none;
}
.nav-pill.is-ready { opacity: 1; }
/* 拖动时关掉过渡才跟手；松手开回来就是那一下 Q 弹 */
.nav.is-dragging .nav-pill { transition: none; }

.nav-item {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  min-height: 94rpx;
  margin: 0;
  padding: 8rpx 0 6rpx;
  border: 0;
  border-radius: 22rpx;
  background: transparent;
  color: var(--text-secondary);
  line-height: 1.1;
  transition: color 180ms ease, transform 120ms ease;
}
.nav-item::after { border: 0; }
.nav-item:active { transform: scale(.96); }
.nav-icon { display: flex; align-items: center; justify-content: center; opacity: .82; transition: opacity 180ms ease, transform 180ms ease; }
.nav-label { font-size: 20rpx; font-weight: 700; letter-spacing: 1rpx; }

/* 选中态交给胶囊，标签本身只提亮文字，不再叠一层浅紫实底 */
.nav-item.is-active { color: var(--text); }
.nav-item.is-active .nav-icon { color: var(--accent-ink); opacity: 1; transform: translateY(-1rpx); }
.nav-item.is-active .nav-label { color: var(--text); }

/* 胶囊顶上那一小段渐变：玻璃片里的一根发光条 */
.nav-glint {
  position: absolute;
  top: 5rpx;
  left: 50%;
  width: 34rpx;
  height: 4rpx;
  margin-left: -17rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  opacity: 0;
  transform: scaleX(.4);
  transition: opacity 200ms ease, transform 200ms ease;
}
.nav-item.is-active .nav-glint { opacity: 1; transform: scaleX(1); }

@media (min-width: 768px) {
  .nav-layer { padding-bottom: calc(22rpx + max(var(--inset-bottom, 0px), env(safe-area-inset-bottom, 0px))); }
  .nav { max-width: 700px; }
  .nav-item { min-height: 100rpx; }
}
</style>
