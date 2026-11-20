<template>
  <view
    v-if="visible"
    ref="orbEl"
    class="music-orb"
    :class="{ 'is-playing': state.playing, 'is-touching': touching, 'is-dragging': dragging }"
    :style="orbStyle"
    role="button"
    aria-label="音乐悬浮球：按住拖动，单击播放暂停，双击下一曲"
    @tap="onTap"
  >
    <!-- 音频律动来自真实 PCM；卫星另有环境慢转。装饰层不接收触摸。 -->
    <view class="orb-aura" aria-hidden="true"></view>
    <view class="orb-shadow" aria-hidden="true"></view>
    <view class="orb-wave wave-a" aria-hidden="true"></view>
    <view class="orb-wave wave-b" aria-hidden="true"></view>
    <view class="orb-ring" aria-hidden="true"></view>
    <view class="orb-orbit orb-orbit-a" aria-hidden="true">
      <view class="orb-satellite"></view>
    </view>
    <view class="orb-orbit orb-orbit-b" aria-hidden="true">
      <view class="orb-satellite"></view>
    </view>
    <view class="orb-core" aria-hidden="true">
      <view class="orb-fluid"></view>
      <view class="orb-nucleus"></view>
      <view class="orb-sheen"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  emptyPlayerState,
  getPlayerState,
  nativePlayerAvailable,
  nextTrack,
  onAudioLevel,
  onPlayerState,
  pausePlayback,
  readH5AudioLevel,
  resumePlayback,
  type AudioLevelSample,
  type PlayerState
} from '@/utils/musicPlayer';
import {
  advanceOrbPhase,
  clampOrbPosition,
  EMPTY_ORB_PULSE,
  nextOrbPulse,
  type OrbAudioSample,
  type OrbPhase,
  type OrbPoint,
  type OrbPulse
} from '@/utils/musicOrbMotion';

/** 浮球自己订阅播放状态，不依赖音乐板块是否挂载——三个板块都能用 */
const state = reactive<PlayerState>({ ...emptyPlayerState });
const visible = computed(() => state.index >= 0);
const orbEl = ref<HTMLElement | null>(null);
/** uni-app 的 <view> 在 H5 可能返回组件实例而非 DOM，统一取真实元素。 */
function orbElement(): HTMLElement | null {
  const raw = orbEl.value as unknown as { $el?: unknown } | null;
  if (raw instanceof HTMLElement) return raw;
  if (raw?.$el instanceof HTMLElement) return raw.$el;
  return typeof document !== 'undefined'
    ? document.querySelector('.music-orb') as HTMLElement | null
    : null;
}
const position = ref<OrbPoint | null>(null);
const touching = ref(false);
const dragging = ref(false);
const orbStyle = computed<Record<string, string>>(() => {
  if (!position.value) return {} as Record<string, string>;
  return {
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
    right: 'auto'
  };
});

let unsubState: (() => void) | null = null;
let unsubAudio: (() => void) | null = null;

/* ── 单击 / 双击判定 ────────────────────────────────────────────── */
const DOUBLE_TAP_MS = 260;
let tapTimer: number | null = null;
let ignoreTapUntil = 0;

function cancelPendingTap() {
  if (tapTimer !== null) window.clearTimeout(tapTimer);
  tapTimer = null;
}

function registerTap() {
  if (tapTimer !== null) {
    cancelPendingTap();
    void onDouble();
  } else {
    tapTimer = window.setTimeout(() => {
      tapTimer = null;
      void onSingle();
    }, DOUBLE_TAP_MS);
  }
}

function onTap() {
  // 触摸已在 touchend 中主动判定；这里只保留鼠标与无障碍点击入口。
  if (Date.now() < ignoreTapUntil) {
    ignoreTapUntil = 0;
    return;
  }
  registerTap();
}

async function onSingle() {
  try {
    if (state.playing) Object.assign(state, await pausePlayback());
    else Object.assign(state, await resumePlayback());
  } catch {
    // 播放器暂时不可用：忽略，状态由原生事件兜底刷新
  }
}

async function onDouble() {
  try {
    Object.assign(state, await nextTrack());
  } catch {
    // 同上
  }
}

/* ── 独占触摸、拖动与位置记忆 ─────────────────────────────────────
   不用模板 touch 修饰符：在真实 DOM 上以 capture + passive:false 监听，
   从 touchstart 第一帧就 preventDefault，避免 WebView 先接管成页面滚动。 */
const POSITION_KEY = 'ky_v1_music_orb_position';
const DRAG_SLOP_PX = 7;
let activeTouchId: number | null = null;
let touchStartX = 0;
let touchStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;
let dragMoved = false;
let boundOrb: HTMLElement | null = null;
const TOUCH_LISTENER: AddEventListenerOptions = { passive: false, capture: true };

function clampPosition(point: OrbPoint): OrbPoint {
  const el = orbElement();
  const width = el?.getBoundingClientRect().width || 58;
  const height = el?.getBoundingClientRect().height || 58;
  return clampOrbPosition(point, window.innerWidth, window.innerHeight, width, height);
}

function restorePosition() {
  if (!orbElement() || position.value) return;
  try {
    const saved = uni.getStorageSync(POSITION_KEY) as OrbPoint | '';
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      position.value = clampPosition(saved);
    }
  } catch {
    // 存储不可用时仅本次会话记住位置
  }
}

function persistPosition() {
  if (!position.value) return;
  try {
    uni.setStorageSync(POSITION_KEY, position.value);
  } catch {
    // 不影响拖动与播放
  }
}

function ownTouch(event: TouchEvent) {
  event.stopPropagation();
  if (event.cancelable) event.preventDefault();
}

function touchById(event: TouchEvent): Touch | null {
  if (activeTouchId === null) return null;
  const lists = [event.touches, event.changedTouches];
  for (const list of lists) {
    for (let index = 0; index < list.length; index++) {
      if (list[index].identifier === activeTouchId) return list[index];
    }
  }
  return null;
}

function onDragStart(event: TouchEvent) {
  ownTouch(event);
  if (activeTouchId !== null) return;
  const touch = event.touches[0] || event.changedTouches[0];
  const el = orbElement();
  if (!touch || !el) return;
  ignoreTapUntil = 0;
  const rect = el.getBoundingClientRect();
  position.value = { x: rect.left, y: rect.top };
  activeTouchId = touch.identifier;
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  dragOriginX = rect.left;
  dragOriginY = rect.top;
  dragMoved = false;
  touching.value = true;
}

function onDragMove(event: TouchEvent) {
  ownTouch(event);
  const touch = touchById(event);
  if (!touch) return;
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  if (!dragMoved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
  if (!dragMoved) {
    dragMoved = true;
    dragging.value = true;
    cancelPendingTap();
  }
  position.value = clampPosition({ x: dragOriginX + dx, y: dragOriginY + dy });
}

function onDragEnd(event: TouchEvent) {
  ownTouch(event);
  finishTouch(event, false);
}

function onDragCancel(event: TouchEvent) {
  ownTouch(event);
  finishTouch(event, true);
}

function finishTouch(event: TouchEvent, cancelled: boolean) {
  if (activeTouchId === null || !touchById(event)) return;
  const wasDrag = dragMoved;
  if (wasDrag) persistPosition();
  activeTouchId = null;
  dragMoved = false;
  touching.value = false;
  dragging.value = false;
  // 本趟触摸已经在这里判定，拦截随后可能补发的合成 click/tap。
  ignoreTapUntil = Date.now() + 500;
  if (!wasDrag && !cancelled) registerTap();
}

function unbindTouchLayer() {
  if (!boundOrb) return;
  boundOrb.removeEventListener('touchstart', onDragStart, true);
  boundOrb.removeEventListener('touchmove', onDragMove, true);
  boundOrb.removeEventListener('touchend', onDragEnd, true);
  boundOrb.removeEventListener('touchcancel', onDragCancel, true);
  boundOrb = null;
}

function bindTouchLayer() {
  const el = orbElement();
  if (!el || el === boundOrb) return;
  unbindTouchLayer();
  boundOrb = el;
  el.addEventListener('touchstart', onDragStart, TOUCH_LISTENER);
  el.addEventListener('touchmove', onDragMove, TOUCH_LISTENER);
  el.addEventListener('touchend', onDragEnd, TOUCH_LISTENER);
  el.addEventListener('touchcancel', onDragCancel, TOUCH_LISTENER);
}

function onViewportResize() {
  if (position.value) position.value = clampPosition(position.value);
}

/* ── 真实音频多层律动 ─────────────────────────────────────────────
   Android：原生插件从 ExoPlayer 输出 PCM 计算音量、低频和节拍，50ms 推送一次。
   H5：Web Audio AnalyserNode 在每个动画帧读取真实输出。
   光晕、冲击波、虚线环、核心缩放和液态形变分别吃不同频段；双卫星保留环境慢转。 */
let rafId = 0;
let displayed: OrbPulse = { ...EMPTY_ORB_PULSE };
let nativeSample: OrbAudioSample = { level: 0, bass: 0, beat: false };
let lastNativeSampleAt = 0;
let orbitPhase = -28;
let orbitPhaseB = 112;
/** 断续环与内层液态体各存自己的角度，液态体不能由环角度换算，否则每圈会复位一次。 */
let phase: OrbPhase = { ring: 0, blob: 0 };
let lastFrameAt = 0;

function setStyleVar(el: HTMLElement, name: string, value: number | string) {
  el.style.setProperty(name, typeof value === 'number' ? value.toFixed(3) : value);
}

function writeMotion(value: OrbPulse) {
  const el = orbElement();
  if (!el?.style) return;
  const pulse = Math.min(1, value.level * 0.72 + value.bass * 0.28);
  const beat = value.beat;
  const waveProgress = 1 - beat;
  const delayedBeat = Math.max(0, (beat - 0.22) / 0.78);
  setStyleVar(el, '--pulse', pulse);
  setStyleVar(el, '--bass', value.bass);
  setStyleVar(el, '--core-scale', 1 + pulse * 0.085 + beat * 0.045);
  setStyleVar(el, '--aura-scale', 1 + pulse * 0.52 + beat * 0.18);
  setStyleVar(el, '--aura-opacity', 0.22 + pulse * 0.58);
  setStyleVar(el, '--shadow-scale', 0.86 + pulse * 0.22);
  setStyleVar(el, '--wave-scale', 0.88 + waveProgress * 0.92);
  setStyleVar(el, '--wave-opacity', beat * 0.58);
  setStyleVar(el, '--wave2-scale', 0.94 + (1 - delayedBeat) * 1.22);
  setStyleVar(el, '--wave2-opacity', delayedBeat * 0.30);
  setStyleVar(el, '--ring-angle', `${phase.ring.toFixed(2)}deg`);
  setStyleVar(el, '--ring-scale', 1 + value.bass * 0.10);
  setStyleVar(el, '--orbit-angle', `${orbitPhase.toFixed(2)}deg`);
  setStyleVar(el, '--orbit-angle-b', `${orbitPhaseB.toFixed(2)}deg`);
  setStyleVar(el, '--satellite-scale', 0.72 + pulse * 0.55 + beat * 0.28);
  setStyleVar(el, '--nucleus-scale', 0.88 + value.bass * 0.24 + beat * 0.12);
  setStyleVar(el, '--nucleus-opacity', 0.20 + value.bass * 0.48);
  setStyleVar(el, '--sheen-shift', `${(-12 + value.level * 24).toFixed(2)}%`);
  setStyleVar(el, '--sheen-opacity', 0.38 + pulse * 0.42);
  const a = 46 + value.bass * 13;
  const b = 54 - value.bass * 10;
  const c = 48 + value.level * 12;
  const d = 52 - value.level * 9;
  setStyleVar(el, '--blob-angle', `${phase.blob.toFixed(2)}deg`);
  setStyleVar(el, '--blob-radius', `${a}% ${100 - a}% ${b}% ${100 - b}% / ${c}% ${d}% ${100 - c}% ${100 - d}%`);
}

function tick(now: number) {
  let sample: AudioLevelSample = { level: 0, bass: 0, beat: false };
  if (state.playing) {
    if (nativePlayerAvailable()) {
      // 原生事件意外中断时回到静止，绝不切换成假波形。
      sample = Date.now() - lastNativeSampleAt > 240
        ? { level: 0, bass: 0, beat: false }
        : nativeSample;
    } else {
      sample = readH5AudioLevel();
    }
  }
  const frameScale = lastFrameAt ? Math.min(2, Math.max(0.5, (now - lastFrameAt) / 16.667)) : 1;
  lastFrameAt = now;
  // 暂停当帧直接清零，不等指数衰减；这样只有双卫星继续环境旋转。
  displayed = state.playing ? nextOrbPulse(displayed, sample) : { ...EMPTY_ORB_PULSE };
  const pulse = Math.min(1, displayed.level * 0.72 + displayed.bass * 0.28);
  // 两条卫星轨道保留独立的环境慢转，暂停时也转动；真实音量只负责加速。
  // 冲击波、断续环、核心和液态层仍完全由音频驱动，暂停后归零。
  orbitPhase = (orbitPhase + (0.34 + pulse * 4.4) * frameScale) % 360;
  orbitPhaseB = (orbitPhaseB - (0.26 + pulse * 3.2) * frameScale + 360) % 360;
  // 两个相位各自累积：环跨圈归零看不出来，液态体必须连续，否则每圈弹回起点。
  phase = advanceOrbPhase(phase, displayed.bass, frameScale);
  writeMotion(displayed);
  rafId = window.requestAnimationFrame(tick);
}

function startPulse() {
  if (rafId) return;
  lastNativeSampleAt = Date.now();
  lastFrameAt = 0;
  rafId = window.requestAnimationFrame(tick);
}

function stopPulse() {
  if (rafId) window.cancelAnimationFrame(rafId);
  rafId = 0;
  nativeSample = { level: 0, bass: 0, beat: false };
  displayed = { ...EMPTY_ORB_PULSE };
  lastFrameAt = 0;
  writeMotion(displayed);
}

watch(() => state.playing, (playing) => {
  if (!playing) {
    nativeSample = { level: 0, bass: 0, beat: false };
    displayed = { ...EMPTY_ORB_PULSE };
  }
  // 暂停只停止音频律动，不停止两条卫星的环境慢转。
  if (visible.value) startPulse();
}, { flush: 'sync' });

watch(visible, async (show) => {
  if (!show) {
    stopPulse();
    unbindTouchLayer();
    return;
  }
  await nextTick();
  restorePosition();
  bindTouchLayer();
  onViewportResize();
  startPulse();
}, { flush: 'post' });

onMounted(async () => {
  try {
    Object.assign(state, await getPlayerState());
  } catch {
    // 拿不到状态就先不显示，等原生事件推送
  }
  try {
    unsubState = await onPlayerState((next) => Object.assign(state, next));
    unsubAudio = await onAudioLevel((sample) => {
      nativeSample = sample;
      lastNativeSampleAt = Date.now();
    });
  } catch {
    // 动画订阅失败不影响播放与拖动
  }
  window.addEventListener('resize', onViewportResize);
  await nextTick();
  restorePosition();
  bindTouchLayer();
  if (visible.value) startPulse();
});

onBeforeUnmount(() => {
  cancelPendingTap();
  stopPulse();
  unbindTouchLayer();
  unsubState?.();
  unsubAudio?.();
  window.removeEventListener('resize', onViewportResize);
  activeTouchId = null;
  touching.value = false;
  dragging.value = false;
});
</script>

<style scoped>
.music-orb {
  position: fixed;
  right: 22rpx;
  top: 44%;
  width: 116rpx;
  height: 116rpx;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  touch-action: none !important;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
  --pulse: 0;
  --bass: 0;
  --drag-scale: 1;
  --core-scale: 1;
  --aura-scale: 1;
  --aura-opacity: 0.22;
  --shadow-scale: 0.86;
  --wave-scale: 1;
  --wave-opacity: 0;
  --wave2-scale: 1;
  --wave2-opacity: 0;
  --ring-angle: 0deg;
  --ring-scale: 1;
  --orbit-angle: -28deg;
  --orbit-angle-b: 112deg;
  --satellite-scale: 0.72;
  --nucleus-scale: 0.88;
  --nucleus-opacity: 0.20;
  --sheen-shift: -12%;
  --sheen-opacity: 0.38;
  --blob-angle: 0deg;
  --blob-radius: 46% 54% 54% 46% / 48% 52% 52% 48%;
}
.music-orb.is-touching { z-index: 120; cursor: grabbing; }
.music-orb.is-dragging { --drag-scale: 0.94; }
.music-orb > view { pointer-events: none; }

.orb-aura,
.orb-shadow,
.orb-wave,
.orb-ring,
.orb-orbit {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  will-change: transform, opacity;
}
.orb-aura {
  width: 168rpx;
  height: 168rpx;
  margin: -84rpx 0 0 -84rpx;
  background:
    radial-gradient(circle at 36% 32%, rgba(var(--accent-2-rgb), .48), transparent 48%),
    radial-gradient(circle at 64% 68%, rgba(var(--accent-3-rgb), .36), transparent 62%);
  filter: blur(18rpx);
  opacity: var(--aura-opacity);
  transform: scale(var(--aura-scale));
  transition: opacity 90ms linear;
}
.orb-shadow {
  width: 76rpx;
  height: 22rpx;
  margin: 50rpx 0 0 -38rpx;
  background: rgba(var(--accent-rgb), .24);
  filter: blur(12rpx);
  opacity: .42;
  transform: scale(var(--shadow-scale));
}

/* 两层冲击波错开衰减：实线亮环 + 更轻的外圈，不做固定时间循环。 */
.orb-wave {
  width: 116rpx;
  height: 116rpx;
  margin: -58rpx 0 0 -58rpx;
  opacity: 0;
  border: 2rpx solid rgba(var(--accent-rgb), .72);
  box-shadow: 0 0 18rpx rgba(var(--accent-rgb), .22), inset 0 0 14rpx rgba(var(--accent-2-rgb), .14);
}
.music-orb.is-playing .wave-a { opacity: var(--wave-opacity); transform: scale(var(--wave-scale)); }
.music-orb.is-playing .wave-b {
  opacity: var(--wave2-opacity);
  transform: scale(var(--wave2-scale));
  border-width: 1rpx;
  border-color: rgba(var(--accent-2-rgb), .68);
}

/* 低频驱动反向旋转的断续环，和冲击波的径向扩散不是同一种运动。 */
.orb-ring {
  width: 134rpx;
  height: 134rpx;
  margin: -67rpx 0 0 -67rpx;
  border: 2rpx dashed rgba(var(--accent-2-rgb), .54);
  opacity: .28;
  transform: rotate(var(--ring-angle)) scale(var(--ring-scale));
  box-shadow: inset 0 0 20rpx rgba(var(--accent-rgb), .08);
}
.music-orb.is-playing .orb-ring { opacity: .68; }

/* 双倾斜卫星轨道：暂停也缓慢反向旋转，播放时真实音量会额外加速。 */
.orb-orbit {
  border: 1rpx solid rgba(var(--accent-2-rgb), .42);
  opacity: .38;
  box-shadow: 0 0 10rpx rgba(var(--accent-rgb), .08);
}
.orb-orbit-a {
  width: 154rpx;
  height: 82rpx;
  margin: -41rpx 0 0 -77rpx;
  transform: rotate(var(--orbit-angle));
}
.orb-orbit-b {
  width: 168rpx;
  height: 66rpx;
  margin: -33rpx 0 0 -84rpx;
  border-color: rgba(var(--accent-3-rgb), .34);
  opacity: .30;
  transform: rotate(var(--orbit-angle-b));
}
.music-orb.is-playing .orb-orbit { opacity: .78; }
.music-orb.is-playing .orb-orbit-b { opacity: .62; }
.orb-satellite {
  position: absolute;
  right: 7rpx;
  top: 5rpx;
  width: 13rpx;
  height: 13rpx;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #fff 0 18%, var(--accent-2) 48%, var(--accent) 100%);
  box-shadow: 0 0 12rpx rgba(var(--accent-2-rgb), .72);
  transform: scale(var(--satellite-scale));
}
.orb-orbit-b .orb-satellite {
  left: 12rpx;
  right: auto;
  top: auto;
  bottom: 3rpx;
  width: 10rpx;
  height: 10rpx;
  background: radial-gradient(circle at 32% 28%, #fff 0 18%, var(--accent-3) 52%, var(--accent-2) 100%);
  box-shadow: 0 0 10rpx rgba(var(--accent-3-rgb), .68);
}

.orb-core {
  position: relative;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  overflow: hidden;
  background:
    radial-gradient(circle at 27% 19%, rgba(255, 255, 255, .86), transparent 30%),
    radial-gradient(circle at 74% 82%, rgba(var(--accent-2-rgb), .66), transparent 58%),
    var(--accent-gradient);
  border: 1rpx solid rgba(255, 255, 255, .62);
  box-shadow:
    0 14rpx 32rpx rgba(var(--accent-rgb), .26),
    0 3rpx 8rpx rgba(19, 27, 48, .16),
    inset 0 2rpx 4rpx rgba(255, 255, 255, .54),
    inset 0 -5rpx 10rpx rgba(20, 24, 54, .18);
  transform: scale(var(--core-scale)) scale(var(--drag-scale));
  transition: box-shadow 140ms ease, filter 140ms ease;
  will-change: transform;
}
.music-orb.is-dragging .orb-core {
  filter: saturate(1.12) brightness(1.06);
  box-shadow:
    0 22rpx 42rpx rgba(var(--accent-rgb), .30),
    0 5rpx 12rpx rgba(19, 27, 48, .18),
    inset 0 2rpx 4rpx rgba(255, 255, 255, .60),
    inset 0 -5rpx 10rpx rgba(20, 24, 54, .16);
}

/* 内部液态体：低频改变圆角，音量改变转动速度，和球体缩放叠在一起。 */
.orb-fluid {
  position: absolute;
  inset: 10rpx;
  border-radius: var(--blob-radius);
  background:
    radial-gradient(circle at 30% 24%, rgba(255, 255, 255, .38), transparent 38%),
    linear-gradient(145deg, rgba(var(--accent-3-rgb), .28), rgba(var(--accent-2-rgb), .16));
  border: 1rpx solid rgba(255, 255, 255, .20);
  box-shadow: inset 0 0 18rpx rgba(255, 255, 255, .16);
  transform: rotate(var(--blob-angle));
  will-change: transform, border-radius;
}
.orb-nucleus {
  position: absolute;
  inset: 26rpx;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 30%, rgba(255, 255, 255, .56), rgba(var(--accent-3-rgb), .20) 48%, rgba(var(--accent-rgb), .12));
  border: 1rpx solid rgba(255, 255, 255, .22);
  box-shadow: 0 0 18rpx rgba(var(--accent-3-rgb), .22);
  opacity: var(--nucleus-opacity);
  transform: scale(var(--nucleus-scale));
}
.orb-sheen {
  position: absolute;
  left: 18rpx;
  top: 12rpx;
  width: 32rpx;
  height: 14rpx;
  border-radius: 50%;
  background: linear-gradient(90deg, rgba(255, 255, 255, .78), rgba(255, 255, 255, 0));
  filter: blur(2rpx);
  opacity: var(--sheen-opacity);
  transform: translateX(var(--sheen-shift)) rotate(-24deg);
}

@media (prefers-reduced-motion: reduce) {
  .orb-wave,
  .orb-ring,
  .orb-orbit { display: none; }
  .orb-aura,
  .orb-shadow,
  .orb-core,
  .orb-fluid,
  .orb-nucleus,
  .orb-sheen {
    transform: none;
    transition: none;
  }
}
</style>
