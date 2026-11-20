<template>
  <view class="music-page">
    <view class="page-content">
      <view class="top-bar">
        <view>
          <view class="top-title">音乐</view>
          <view class="top-subtitle">{{ lab.hasLibrary ? `${lab.stats.count} 首 · ${formatBytes(lab.stats.bytes)}` : '还没建曲库' }}</view>
        </view>
        <view class="top-actions">
          <button class="icon-button" aria-label="设置" @click="openSettings">
            <AppIcon name="gear" :size="22" />
          </button>
        </view>
      </view>

      <view class="glass-card shelf fade-up">
        <!-- 本地曲库与我的歌单是同一卡片的两个平级标签，不再把歌单藏进右上角按钮。 -->
        <view class="shelf-tabs" role="tablist" aria-label="音乐列表">
          <button
            class="shelf-tab"
            :class="{ 'is-active': shelfTab === 'library' }"
            role="tab"
            :aria-selected="shelfTab === 'library' ? 'true' : 'false'"
            @click="selectShelfTab('library')"
          >
            <AppIcon name="music" :size="18" />
            <text>本地曲库</text>
            <text class="shelf-tab-count">{{ lab.stats.count }}</text>
          </button>
          <button
            class="shelf-tab"
            :class="{ 'is-active': shelfTab === 'playlists' }"
            role="tab"
            :aria-selected="shelfTab === 'playlists' ? 'true' : 'false'"
            @click="selectShelfTab('playlists')"
          >
            <AppIcon name="playlist" :size="18" />
            <text>我的歌单</text>
            <text class="shelf-tab-count">{{ lab.playlists.length }}</text>
          </button>
        </view>

        <view class="shelf-context">
          <view class="shelf-sub">
            {{ shelfTab === 'library' ? '自动扫描手机里的歌，只记名字和位置' : '新建、整理并播放自己的歌曲合集' }}
          </view>
          <view class="shelf-chip" :class="{ 'is-ready': shelfTab === 'library' ? lab.hasLibrary : lab.playlists.length > 0 }">
            {{ shelfTab === 'library' ? (lab.hasLibrary ? `${lab.stats.count} 首` : '未扫描') : (lab.playlists.length ? `${lab.playlists.length} 个` : '未创建') }}
          </view>
        </view>

        <template v-if="shelfTab === 'library'">
          <view class="scan-row">
            <button class="primary-button scan-btn" :disabled="lab.scanning" @click="startScan('full')">
              <AppIcon name="scan" :size="18" />
              <text>{{ lab.scanning ? (scanningLabel) : '全量扫描' }}</text>
            </button>
            <!-- 首次不显示：库里还是空的，增量扫不出任何东西 -->
            <button
              v-if="lab.incrementalAvailable"
              class="secondary-button scan-btn"
              :disabled="lab.scanning"
              @click="startScan('incremental')"
            >
              <AppIcon name="download" :size="18" />
              <text>增量扫描</text>
            </button>
          </view>

          <view class="stat-row">
            <view class="stat-cell">
              <text class="stat-num">{{ lab.stats.count }}</text>
              <text class="stat-key">首曲目</text>
            </view>
            <view class="stat-cell">
              <text class="stat-num">{{ formatBytes(lab.stats.bytes) }}</text>
              <text class="stat-key">合计大小</text>
            </view>
            <view class="stat-cell">
              <text class="stat-num is-small">{{ formatScanAt(lab.music.lastScanAt) }}</text>
              <text class="stat-key">上次扫描</text>
            </view>
          </view>

          <view v-if="lab.hasLibrary" class="track-list">
            <view
              v-for="(track, idx) in visibleTracks"
              :key="track.id"
              class="track"
              :class="{ 'is-playing': isCurrentTrack(idx) && player.playing }"
              @click="tapTrack(track, idx)"
            >
              <view class="track-dot">{{ isCurrentTrack(idx) && player.playing ? '♪' : '' }}</view>
              <text class="track-name">{{ track.name }}</text>
              <text class="track-size">{{ formatDuration(track.duration) || formatBytes(track.size) }}</text>
              <button class="track-add" aria-label="加入歌单" @click.stop="askAddToPlaylist(track)">
                <AppIcon name="plus" :size="18" />
              </button>
              <button class="track-remove" aria-label="从曲库移除" @click.stop="askRemoveTrack(track)">
                <AppIcon name="trash" :size="17" />
              </button>
            </view>
          </view>
          <view v-else class="shelf-empty">还没有曲库。点「全量扫描」，自动把手机里的歌列出来。</view>

          <view class="hint">首次扫描会问一次「读取音乐」权限，只查系统音乐库的清单；歌不复制、不上传，只在本机记名字和位置。</view>
        </template>

        <template v-else>
          <view class="new-playlist-row">
            <input
              v-model="newPlaylistName"
              class="new-playlist-input"
              type="text"
              maxlength="24"
              placeholder="新歌单名字"
              placeholder-class="input-placeholder"
              @confirm="onAddPlaylist"
            />
            <button class="new-playlist-btn" @click="onAddPlaylist">新建</button>
          </view>

          <view v-if="!lab.playlists.length" class="playlist-empty">
            还没有歌单。上面起个名字点「新建」，再切到「本地曲库」点曲目右边的 ＋ 把歌放进来。
          </view>
          <view v-else class="playlist-list">
            <view v-for="list in lab.playlists" :key="list.id" class="pl-item">
              <view class="pl-head">
                <button class="pl-expand" :aria-label="expandedPlaylist === list.id ? '收起歌单' : '展开歌单'" @click="toggleExpand(list.id)">
                  <text class="pl-caret">{{ expandedPlaylist === list.id ? '▾' : '▸' }}</text>
                </button>
                <input
                  v-if="renamingId === list.id"
                  v-model="renameText"
                  class="pl-rename-input"
                  maxlength="24"
                  @confirm="onConfirmRename"
                  @blur="onConfirmRename"
                />
                <text v-else class="pl-name" @click="startRename(list)">{{ list.name }}</text>
                <text class="pl-count">{{ playlistCount(list) }} 首</text>
                <button class="pl-play" :disabled="playlistCount(list) === 0" @click.stop="onPlayPlaylist(list)">
                  <view class="pl-play-tri"></view>
                  <text>播放</text>
                </button>
                <button class="pl-del" aria-label="删除歌单" @click="askDeletePlaylist(list)">
                  <AppIcon name="trash" :size="17" />
                </button>
              </view>
              <view v-if="expandedPlaylist === list.id" class="pl-tracks">
                <view v-if="!playlistCount(list)" class="pl-track-empty">空的，去「本地曲库」点 ＋ 添加</view>
                <view v-for="track in playlistTracks(list)" :key="track.id" class="pl-track">
                  <text class="pl-track-name">{{ track.name }}</text>
                  <button class="pl-track-remove" aria-label="从歌单移除" @click="onRemoveFromPlaylist(list, track)">
                    <AppIcon name="close" :size="15" />
                  </button>
                </view>
              </view>
            </view>
          </view>
          <view class="hint">点歌单名可以重命名，点左侧箭头展开曲目；删除歌单不会删掉曲库里的歌。</view>
        </template>
      </view>

      <!-- 给底部悬浮播放卡留出空间：列表能滚到它上方，最后一首不被挡住 -->
      <view class="player-spacer" aria-hidden="true"></view>
    </view>

    <!-- 悬浮播放卡：钉在底栏上方，滑列表时也能随时操控（v4.8.0） -->
    <view class="glass-card player-card">
      <view class="player-head">
        <view class="player-art"><AppIcon name="music" :size="24" /></view>
        <view class="player-copy">
          <view class="player-title">{{ player.title || '还没有播放' }}</view>
          <view class="player-sub">{{ playerSubtitle }}</view>
        </view>
        <view class="player-badge" :class="{ 'is-live': player.playing }">
          {{ player.playing ? '播放中' : (player.index >= 0 ? '已暂停' : '待播放') }}
        </view>
      </view>

      <view class="player-progress">
        <text class="time">{{ formatPlayerTime(displayPosition) }}</text>
        <view
          ref="progressSliderRef"
          class="player-slider"
          :class="{ 'is-disabled': player.index < 0 || sliderDuration <= 0, 'is-dragging': sliderPreview !== null }"
          data-horizontal-scroll
          role="slider"
          aria-label="播放进度"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="Math.round(progressPercent)"
          :aria-valuetext="`${formatPlayerTime(displayPosition)} / ${formatPlayerTime(sliderDuration)}`"
          :aria-disabled="player.index < 0 || sliderDuration <= 0 ? 'true' : 'false'"
          tabindex="0"
          @keydown="onProgressKeydown"
        >
          <view class="player-slider-rail">
            <view class="player-slider-fill" :style="{ width: `${progressPercent}%` }"></view>
            <view class="player-slider-thumb" :style="{ left: `${progressPercent}%` }"></view>
          </view>
        </view>
        <text class="time">{{ formatPlayerTime(sliderDuration) }}</text>
      </view>

      <view class="player-controls">
        <button class="ctrl-btn" aria-label="上一首" :disabled="player.index < 0" @click="onPrevious">
          <view class="icon-prev"><view class="skip-bar"></view><view class="skip-tri skip-tri-left"></view></view>
        </button>
        <button class="ctrl-btn play-btn" :aria-label="player.playing ? '暂停' : '播放'" @click="onTogglePlay">
          <view v-if="player.playing" class="icon-pause"><view class="pause-bar"></view><view class="pause-bar"></view></view>
          <view v-else class="icon-play"></view>
        </button>
        <button class="ctrl-btn" aria-label="下一首" :disabled="player.index < 0" @click="onNext">
          <view class="icon-next"><view class="skip-tri skip-tri-right"></view><view class="skip-bar"></view></view>
        </button>
        <!-- 三种播放模式合成一个按钮：点一下按 顺序 → 随机 → 单曲 循环 -->
        <button
          class="mode-btn mode-trigger"
          :aria-label="`播放模式：${currentMode.label}，点击切换下一种`"
          @click="onCycleMode"
        >
          <AppIcon :name="currentMode.icon" :size="15" />
          <text>{{ currentMode.label }}</text>
        </button>
      </view>
    </view>

    <!-- 加入歌单面板：点曲目右边 ＋ 弹出，选一个歌单把歌放进去 -->
    <view v-if="addToOpen" class="sheet-mask" @click="closeAddTo">
      <view class="sheet sheet-small" @click.stop>
        <view class="sheet-head">
          <view class="sheet-title">加入歌单</view>
          <button class="sheet-close" aria-label="关闭" @click="closeAddTo">
            <AppIcon name="close" :size="20" />
          </button>
        </view>
        <view v-if="pendingAddTrack" class="add-track-name">「{{ pendingAddTrack.name }}」</view>
        <scroll-view class="sheet-scroll" scroll-y>
          <view v-if="!lab.playlists.length" class="sheet-empty">还没有歌单。可以点下面直接新建，也可以切到「我的歌单」慢慢整理。</view>
          <button
            v-for="list in lab.playlists"
            :key="list.id"
            class="add-target"
            @click="onPickPlaylist(list)"
          >
            <text class="add-target-name">{{ list.name }}</text>
            <text class="add-target-count">{{ playlistCount(list) }} 首</text>
          </button>
        </scroll-view>
        <button class="add-new-here" @click="onAddPlaylistFromAdd">＋ 新建歌单并加入</button>
      </view>
    </view>

    <!-- 全量扫描重建确认：用项目统一的玻璃卡片弹窗，不用系统白底 modal -->
    <ConfirmDialog
      v-if="fullScanConfirmOpen"
      :model-value="true"
      title="全量扫描会重建曲库"
      content="这次没扫到的曲目会从清单里移掉，手机里的文件不受影响。"
      confirm-text="继续"
      cancel-text="算了"
      @confirm="onConfirmFullScan"
      @cancel="fullScanConfirmOpen = false"
    />

    <!-- 手动删除曲目：二次确认，删除后下次扫描自动跳过，不碰手机原文件 -->
    <ConfirmDialog
      v-if="removeConfirmOpen"
      :model-value="true"
      title="从曲库移除这首歌？"
      :content="removeConfirmText"
      confirm-text="移除"
      cancel-text="取消"
      danger
      @confirm="onConfirmRemove"
      @cancel="closeRemoveConfirm"
    />

    <!-- 删除歌单：二次确认，只删歌单本身，不碰里面的歌和曲库 -->
    <ConfirmDialog
      v-if="deletePlaylistConfirmOpen"
      :model-value="true"
      title="删除这个歌单？"
      :content="deletePlaylistConfirmText"
      confirm-text="删除歌单"
      cancel-text="取消"
      danger
      @confirm="onConfirmDeletePlaylist"
      @cancel="deletePlaylistConfirmOpen = false"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { useLabStore } from '@/stores/lab';
import {
  formatBytes,
  formatScanAt,
  positionFromSlider,
  scanResultText,
  tracksOfPlaylist,
  type AudioFileLike,
  type MusicTrack,
  type Playlist
} from '@/utils/music';
import { nativeMusicAvailable, scanNativeMusic } from '@/utils/musicScanner';
import {
  emptyPlayerState,
  getPlayerState,
  nativePlayerAvailable,
  nextTrack,
  onPlayerState,
  pausePlayback,
  playTracks,
  previousTrack,
  resumePlayback,
  seekTo,
  setPlaybackMode,
  type PlayMode,
  type PlayerState
} from '@/utils/musicPlayer';
import { nextPlayMode } from '@/utils/playMode';
import { playTapFeedback } from '@/utils/feedback';

const lab = useLabStore();
// v4.2.3：曲库全部列出，不再只显示前 6 首。idx 即全局序号，高亮与播放器一致。
const visibleTracks = computed(() => lab.music.tracks);
/** 真机上是自动查媒体库，H5 才退回手动选文件，按钮文案跟着变 */
const scanningLabel = computed(() => (nativeMusicAvailable() ? '扫描中…' : '等待选择…'));

/** 播放器状态：原生事件主动推过来更新 */
const player = reactive<PlayerState>({ ...emptyPlayerState });
let unsubscribePlayer: (() => void) | null = null;

const playModes: Array<{ key: PlayMode; icon: string; label: string }> = [
  { key: 'order', icon: 'repeat', label: '顺序' },
  { key: 'shuffle', icon: 'shuffle', label: '随机' },
  { key: 'one', icon: 'repeat-one', label: '单曲' }
];
/** 合并后的模式按钮只显示当前这一种，点一下切到下一张。 */
const currentMode = computed(() => playModes.find((item) => item.key === player.mode) ?? playModes[0]);

/** 拖动 / seek 期间的预览位置。原生状态回写不会把正在拖动的滑块拉回旧位置。 */
const sliderPreview = ref<number | null>(null);
const progressSliderRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
let progressSliderEl: HTMLElement | null = null;
/**
 * seek 刚发出的一小段时间里，原生回包可能还是旧位置（部分解码器要等关键帧）。
 * 这段时间内不接受和目标差太远的位置，否则界面会瞬间弹回起点。
 */
let seekGuard: { target: number; index: number; at: number } | null = null;
const SEEK_GUARD_MS = 1600;
const SEEK_GUARD_SLACK = 1500;

/** uni 的 view ref 可能是组件实例，也可能是 DOM；两种情况都统一拿到真实元素。 */
function progressSliderElement(): HTMLElement | null {
  const value = progressSliderRef.value;
  if (typeof HTMLElement !== 'undefined') {
    if (value instanceof HTMLElement && value.isConnected) return value;
    const component = value as { $el?: HTMLElement } | null;
    if (component?.$el instanceof HTMLElement && component.$el.isConnected) return component.$el;
  }
  if (typeof document === 'undefined') return null;
  // 只认当前真正显示出来的轨道，隐藏面板里的同名元素宽度是 0，不能拿来算坐标
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('.player-slider'));
  return candidates.find((element) => element.getBoundingClientRect().width > 0) ?? null;
}

/** 未知时长时退回扫描时记下的曲目时长，保证进度条仍然可拖。 */
const sliderDuration = computed(() => {
  if (player.duration > 0) return player.duration;
  const scanned = lab.music.tracks[player.index]?.duration ?? 0;
  return scanned > 0 ? scanned : 0;
});

const displayPosition = computed(() => sliderPreview.value ?? player.position);
const progressPercent = computed(() => {
  if (sliderDuration.value <= 0) return 0;
  return Math.min(100, Math.max(0, (displayPosition.value / sliderDuration.value) * 100));
});

/** 原生状态统一从这里进：seek 生效前，旧位置不能把刚拖到的进度拉回去。 */
function applyPlayerState(state: PlayerState) {
  if (seekGuard) {
    const fresh = Date.now() - seekGuard.at < SEEK_GUARD_MS;
    if (fresh && state.index === seekGuard.index
      && Math.abs(state.position - seekGuard.target) > SEEK_GUARD_SLACK) {
      Object.assign(player, state, { position: seekGuard.target });
      return;
    }
    if (!fresh) seekGuard = null;
  }
  Object.assign(player, state);
}
const playerSubtitle = computed(() => {
  if (player.index < 0) return nativePlayerAvailable() ? '点下面的歌就能播，切到别的板块也不停' : 'H5 调试：可点歌试播';
  return `第 ${player.index + 1} / ${player.count} 首`;
});
onMounted(async () => {
  bindSliderEvents();
  try {
    Object.assign(player, await getPlayerState());
  } catch { /* 拿不到就保持空态 */ }
  try {
    unsubscribePlayer = await onPlayerState(applyPlayerState);
  } catch { /* 订阅失败不影响手动操作 */ }
});

onUnmounted(() => {
  unbindSliderEvents();
  seekRevision += 1;
  seekGuard = null;
  unsubscribePlayer?.();
  unsubscribePlayer = null;
});

/** 毫秒 → mm:ss */
function formatDuration(ms?: number): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 播放器起点要显示 0:00；曲目列表的未知时长仍走空字符串并回退到文件大小。 */
function formatPlayerTime(ms: number): string {
  return formatDuration(ms) || '0:00';
}

function isCurrentTrack(visibleIndex: number): boolean {
  return visibleIndex === player.index;
}

function openSettings() {
  uni.navigateTo({ url: '/pages/settings/settings' });
}

/** 点歌：直接从头播放整张曲库，从点的这首开始 */
async function tapTrack(track: MusicTrack, index: number) {
  void playTapFeedback();
  if (!track.uri && nativePlayerAvailable()) {
    uni.showToast({ title: '这首歌没有可读取的位置，请重新扫描曲库', icon: 'none' });
    return;
  }
  try {
    const state = await playTracks(lab.music.tracks, index);
    Object.assign(player, state);
  } catch (error) {
    uni.showToast({ title: (error as Error).message || '播放失败', icon: 'none' });
  }
}

async function onTogglePlay() {
  void playTapFeedback();
  if (player.index < 0) {
    // 还没播过：默认播第一首
    if (!lab.music.tracks.length) {
      uni.showToast({ title: '先扫描曲库', icon: 'none' });
      return;
    }
    try {
      Object.assign(player, await playTracks(lab.music.tracks, 0));
    } catch (error) {
      uni.showToast({ title: (error as Error).message || '播放失败', icon: 'none' });
    }
    return;
  }
  try {
    Object.assign(player, player.playing ? await pausePlayback() : await resumePlayback());
  } catch { /* 状态由原生事件兜底更新 */ }
}

async function onNext() {
  void playTapFeedback();
  try { Object.assign(player, await nextTrack()); } catch { }
}

async function onPrevious() {
  void playTapFeedback();
  try { Object.assign(player, await previousTrack()); } catch { }
}

/** 只把一次真正的跳转写到播放器；连续操作时，旧请求不能覆盖新位置。 */
let seekRevision = 0;
type DragMode = 'touch' | 'pointer';
let dragMode: DragMode | null = null;
let dragPointerId: number | null = null;
let dragTouchId: number | null = null;
let dragLastX = 0;

/** 松手或点轨道时提交一次真实跳转。 */
async function commitSeek(target: number) {
  const duration = sliderDuration.value;
  if (duration <= 0 || player.index < 0) {
    sliderPreview.value = null;
    return;
  }
  const position = Math.round(Math.min(duration, Math.max(0, target)));
  const revision = ++seekRevision;
  // 先写界面再等原生：松手瞬间不能弹回旧进度
  sliderPreview.value = position;
  player.position = position;
  seekGuard = { target: position, index: player.index, at: Date.now() };
  try {
    const state = await seekTo(position);
    if (revision === seekRevision) applyPlayerState(state);
  } catch (error) {
    if (revision === seekRevision) {
      seekGuard = null;
      uni.showToast({ title: (error as Error).message || '进度跳转失败，请再试一次', icon: 'none' });
    }
  } finally {
    if (revision === seekRevision) sliderPreview.value = null;
  }
}

/* ── 拖动进度条 ─────────────────────────────────────────
 * 真机 WebView 里指针事件经常只给「手柄」而拿不到整条轨道，手指稍微滑出轨道
 * 又收不到 up。这里统一改成：
 *   1. 在 document 捕获阶段识别落点，整条轨道都能起手；
 *   2. 起手后把 move / up 挂到 window，手指滑出轨道也不丢；
 *   3. 触摸走 touch 事件，鼠标 / 手写笔走 pointer 事件，互不重复。
 */

const NON_PASSIVE: AddEventListenerOptions = { passive: false, capture: true };

/** 兼容 uni 包装：用事件路径找真实轨道元素。 */
function sliderFromEvent(event: Event): HTMLElement | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (node instanceof HTMLElement && node.classList.contains('player-slider')) return node;
  }
  const target = event.target;
  if (target instanceof Element) {
    const found = target.closest('.player-slider');
    if (found instanceof HTMLElement) return found;
  }
  return null;
}

/** 手指 / 鼠标横坐标换算成目标毫秒；轨道不可见时返回 null，宁可不跳也不乱跳。 */
function positionFromClientX(clientX: number): number | null {
  const duration = sliderDuration.value;
  const element = progressSliderEl && progressSliderEl.isConnected
    ? progressSliderEl
    : progressSliderElement();
  const rect = element?.getBoundingClientRect();
  if (duration <= 0 || !rect || rect.width <= 0) return null;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return positionFromSlider(duration, ratio * 1000);
}

function beginDrag(clientX: number): boolean {
  if (player.index < 0 || dragMode !== null) return false;
  const target = positionFromClientX(clientX);
  if (target === null) return false;
  seekRevision += 1;
  seekGuard = null;
  dragLastX = clientX;
  sliderPreview.value = target;
  return true;
}

function endDrag() {
  dragMode = null;
  dragPointerId = null;
  dragTouchId = null;
  if (typeof window === 'undefined') return;
  window.removeEventListener('touchmove', onWindowTouchMove);
  window.removeEventListener('touchend', onWindowTouchEnd);
  window.removeEventListener('touchcancel', onWindowTouchCancel);
  window.removeEventListener('pointermove', onWindowPointerMove);
  window.removeEventListener('pointerup', onWindowPointerUp);
  window.removeEventListener('pointercancel', onWindowPointerCancel);
}

function findTouch(list: TouchList | undefined | null, identifier: number | null): Touch | null {
  if (!list || !list.length) return null;
  if (identifier === null) return list[0];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].identifier === identifier) return list[i];
  }
  return null;
}

function onDocumentTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1) return;
  const slider = sliderFromEvent(event);
  if (!slider) return;
  // 上一趟的 touchend 可能被系统手势 / 来电吞掉：新起手时先自愈，避免进度条永久失灵
  if (dragMode === 'touch') endDrag();
  if (dragMode !== null) return;
  progressSliderEl = slider;
  const touch = event.touches[0];
  if (!beginDrag(touch.clientX)) return;
  dragMode = 'touch';
  dragTouchId = touch.identifier;
  // 挡住原生滚动和合成点击，整趟手势只属于进度条
  if (event.cancelable) event.preventDefault();
  window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
  window.addEventListener('touchend', onWindowTouchEnd, { passive: false });
  window.addEventListener('touchcancel', onWindowTouchCancel, { passive: false });
}

function onWindowTouchMove(event: TouchEvent) {
  if (dragMode !== 'touch') return;
  const touch = findTouch(event.touches, dragTouchId);
  if (!touch) return;
  if (event.cancelable) event.preventDefault();
  dragLastX = touch.clientX;
  const target = positionFromClientX(dragLastX);
  if (target !== null) sliderPreview.value = target;
}

function onWindowTouchEnd(event: TouchEvent) {
  if (dragMode !== 'touch') return;
  const touch = findTouch(event.changedTouches, dragTouchId);
  if (touch) dragLastX = touch.clientX;
  const target = positionFromClientX(dragLastX);
  endDrag();
  if (target !== null) void commitSeek(target);
}

function onWindowTouchCancel() {
  if (dragMode !== 'touch') return;
  endDrag();
  seekRevision += 1;
  sliderPreview.value = null;
}

function onDocumentPointerDown(event: PointerEvent) {
  // 触摸交给 touch 链路：安卓 WebView 里 pointer 事件在滑出轨道后容易丢
  if (event.pointerType === 'touch') return;
  const slider = sliderFromEvent(event);
  if (!slider) return;
  if (dragMode === 'pointer') endDrag();
  if (dragMode !== null) return;
  progressSliderEl = slider;
  if (!beginDrag(event.clientX)) return;
  dragMode = 'pointer';
  dragPointerId = event.pointerId;
  if (event.cancelable) event.preventDefault();
  try { slider.focus({ preventScroll: true }); } catch { /* 不支持 focus 的容器忽略 */ }
  window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
  window.addEventListener('pointerup', onWindowPointerUp, { passive: false });
  window.addEventListener('pointercancel', onWindowPointerCancel, { passive: false });
}

function onWindowPointerMove(event: PointerEvent) {
  if (dragMode !== 'pointer' || event.pointerId !== dragPointerId) return;
  if (event.cancelable) event.preventDefault();
  dragLastX = event.clientX;
  const target = positionFromClientX(dragLastX);
  if (target !== null) sliderPreview.value = target;
}

function onWindowPointerUp(event: PointerEvent) {
  if (dragMode !== 'pointer' || event.pointerId !== dragPointerId) return;
  dragLastX = event.clientX;
  const target = positionFromClientX(dragLastX);
  endDrag();
  if (target !== null) void commitSeek(target);
}

function onWindowPointerCancel(event: PointerEvent) {
  if (dragMode !== 'pointer' || event.pointerId !== dragPointerId) return;
  endDrag();
  seekRevision += 1;
  sliderPreview.value = null;
}

function bindSliderEvents() {
  if (typeof document === 'undefined') return;
  unbindSliderEvents();
  document.addEventListener('touchstart', onDocumentTouchStart, NON_PASSIVE);
  document.addEventListener('pointerdown', onDocumentPointerDown, NON_PASSIVE);
}

function unbindSliderEvents() {
  if (typeof document === 'undefined') return;
  document.removeEventListener('touchstart', onDocumentTouchStart, true);
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  endDrag();
}

/** 键盘也能精确调整，左右键每次 5 秒，Home / End 到首尾。 */
function onProgressKeydown(event: KeyboardEvent) {
  if (sliderDuration.value <= 0 || player.index < 0) return;
  let target: number;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') target = displayPosition.value - 5000;
  else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') target = displayPosition.value + 5000;
  else if (event.key === 'Home') target = 0;
  else if (event.key === 'End') target = sliderDuration.value;
  else return;
  event.preventDefault();
  event.stopPropagation();
  void commitSeek(target);
}

/** 全量扫描重建确认弹窗开关：用统一 ConfirmDialog，不再用系统 showModal */
const fullScanConfirmOpen = ref(false);

/** 手动删除曲目的二次确认：先记下待删的歌，确认后才真正移除 */
const removeConfirmOpen = ref(false);
const pendingRemove = ref<MusicTrack | null>(null);
const removeConfirmText = computed(() => {
  const name = pendingRemove.value?.name ?? '这首歌';
  return `「${name}」会从清单里移除，下次全量扫描也会自动跳过它。手机里的原文件不会被删除。`;
});

function askRemoveTrack(track: MusicTrack) {
  pendingRemove.value = track;
  removeConfirmOpen.value = true;
}

function closeRemoveConfirm() {
  removeConfirmOpen.value = false;
  pendingRemove.value = null;
}

function onConfirmRemove() {
  const track = pendingRemove.value;
  closeRemoveConfirm();
  if (!track) return;
  lab.deleteTracks([track.id]);
  uni.showToast({ title: '已移除，下次扫描会跳过', icon: 'none' });
}

// ---------- 播放模式 ----------

async function onSwitchMode(mode: PlayMode) {
  void playTapFeedback();
  if (player.mode === mode) return;
  try {
    Object.assign(player, await setPlaybackMode(mode));
  } catch { /* 状态由原生事件兜底更新 */ }
}

/** 顺序 → 随机 → 单曲 → 顺序；一个按钮走完三种模式。 */
async function onCycleMode() {
  await onSwitchMode(nextPlayMode(player.mode));
}

// ---------- 本地曲库 / 我的歌单：同一卡片内的平级标签 ----------

type ShelfTab = 'library' | 'playlists';
const shelfTab = ref<ShelfTab>('library');
const newPlaylistName = ref('');
const expandedPlaylist = ref('');
const renamingId = ref('');
const renameText = ref('');

function selectShelfTab(next: ShelfTab) {
  void playTapFeedback();
  shelfTab.value = next;
  if (next === 'library') renamingId.value = '';
}
function playlistCount(list: Playlist): number {
  return tracksOfPlaylist(list, lab.music).length;
}
function playlistTracks(list: Playlist): MusicTrack[] {
  return tracksOfPlaylist(list, lab.music);
}
function onAddPlaylist() {
  const name = newPlaylistName.value.trim();
  if (!name) {
    uni.showToast({ title: '先写个歌单名字', icon: 'none' });
    return;
  }
  const id = lab.addPlaylist(name);
  newPlaylistName.value = '';
  if (id) expandedPlaylist.value = id;
  uni.showToast({ title: '歌单已建好', icon: 'none' });
}
function toggleExpand(id: string) {
  expandedPlaylist.value = expandedPlaylist.value === id ? '' : id;
}
function startRename(list: Playlist) {
  renamingId.value = list.id;
  renameText.value = list.name;
}
function onConfirmRename() {
  if (!renamingId.value) return;
  const name = renameText.value.trim();
  if (name) lab.renamePlaylist(renamingId.value, name);
  renamingId.value = '';
}
function onRemoveFromPlaylist(list: Playlist, track: MusicTrack) {
  lab.removeTracksFromPlaylist(list.id, [track.id]);
}
async function onPlayPlaylist(list: Playlist) {
  void playTapFeedback();
  const tracks = tracksOfPlaylist(list, lab.music);
  if (!tracks.length) {
    uni.showToast({ title: '这个歌单还没有能播的歌', icon: 'none' });
    return;
  }
  try {
    Object.assign(player, await playTracks(tracks, 0));
    uni.showToast({ title: `播放歌单「${list.name}」`, icon: 'none' });
  } catch (error) {
    uni.showToast({ title: (error as Error).message || '播放失败', icon: 'none' });
  }
}

/** 删除歌单二次确认 */
const deletePlaylistConfirmOpen = ref(false);
let pendingDeletePlaylist: Playlist | null = null;
const deletePlaylistConfirmText = computed(() => {
  return `「${pendingDeletePlaylist?.name ?? ''}」会被删除。歌单里的歌还在曲库里，不受影响。`;
});
function askDeletePlaylist(list: Playlist) {
  pendingDeletePlaylist = list;
  deletePlaylistConfirmOpen.value = true;
}
function onConfirmDeletePlaylist() {
  const list = pendingDeletePlaylist;
  deletePlaylistConfirmOpen.value = false;
  pendingDeletePlaylist = null;
  if (!list) return;
  lab.removePlaylist(list.id);
  if (expandedPlaylist.value === list.id) expandedPlaylist.value = '';
  uni.showToast({ title: '歌单已删除', icon: 'none' });
}

// ---------- 加入歌单 ----------

const addToOpen = ref(false);
const pendingAddTrack = ref<MusicTrack | null>(null);
function askAddToPlaylist(track: MusicTrack) {
  void playTapFeedback();
  pendingAddTrack.value = track;
  addToOpen.value = true;
}
function closeAddTo() {
  addToOpen.value = false;
  pendingAddTrack.value = null;
}
function onPickPlaylist(list: Playlist) {
  const track = pendingAddTrack.value;
  if (!track) return;
  const before = playlistCount(list);
  lab.addTracksToPlaylist(list.id, [track.id]);
  const after = playlistCount(list);
  closeAddTo();
  uni.showToast({ title: after > before ? `已加入「${list.name}」` : '这首歌已经在歌单里了', icon: 'none' });
}
function onAddPlaylistFromAdd() {
  const id = lab.addPlaylist('新建歌单');
  if (id) {
    uni.showToast({ title: '歌单已建好，再点一次这首歌加入', icon: 'none' });
    expandedPlaylist.value = id;
  }
  closeAddTo();
}

function startScan(mode: 'full' | 'incremental') {
  if (lab.scanning) return;
  if (mode === 'full' && lab.hasLibrary) {
    fullScanConfirmOpen.value = true;
    return;
  }
  void runScan(mode);
}

function onConfirmFullScan() {
  fullScanConfirmOpen.value = false;
  void runScan('full');
}

async function runScan(mode: 'full' | 'incremental') {
  lab.scanning = true;
  try {
    let files: AudioFileLike[];
    if (nativeMusicAvailable()) {
      // 真机：自动查系统音乐库，不需要用户手动选
      const result = await scanNativeMusic();
      if (!result.granted) {
        uni.showToast({ title: '没拿到读取音乐的权限，请在系统设置里允许后再扫', icon: 'none', duration: 2500 });
        return;
      }
      files = result.tracks;
      if (!files.length) {
        const extra = result.raw > 0 ? `（媒体库有 ${result.raw} 条，但都不是音频）` : '';
        uni.showToast({ title: `没扫到音乐文件${extra}`, icon: 'none', duration: 2500 });
        return;
      }
    } else {
      // H5 调试：没有媒体库，退回文件选择器
      files = await pickAudioFiles();
      if (!files.length) return;
    }
    const outcome = lab.scan(files, mode);
    uni.showToast({ title: scanResultText(outcome.mode, outcome), icon: 'none' });
  } catch (error) {
    uni.showToast({ title: (error as Error).message || '扫描音乐失败', icon: 'none' });
  } finally {
    lab.scanning = false;
  }
}

/**
 * H5 调试兜底：走 <input type="file"> 手动选。
 * 真机不会走这里——WebView 里的文件选择器调不起系统音乐库，改用原生插件。
 */
function pickAudioFiles(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    let settled = false;
    let timer = 0;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    // 用户点了取消没有 change 事件：页面重新获得焦点时收尾，避免按钮永远停在「等待选择」
    const onFocus = () => {
      window.setTimeout(() => finish([]), 600);
    };
    window.addEventListener('focus', onFocus, { once: true });
    timer = window.setTimeout(() => finish([]), 180000);
    try {
      document.body.appendChild(input);
      input.click();
    } catch (error) {
      finish([]);
      reject(error instanceof Error ? error : new Error('打不开文件选择器'));
    }
  });
}
</script>

<style scoped>
.music-page .top-bar .icon-button {
  width: 66rpx;
  height: 66rpx;
  margin: 0;
  border-radius: 50%;
  border-color: transparent;
  background: var(--surface-soft);
  box-shadow: none;
  color: var(--text-secondary);
}
.music-page .top-bar .icon-button::before { display: none; }
.top-actions { display: flex; margin-left: auto; }

.shelf { padding: 24rpx 26rpx 28rpx; }
.shelf-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8rpx;
  padding: 7rpx;
  border: 1rpx solid var(--line);
  border-radius: 23rpx;
  background: var(--surface-soft);
}
.shelf-tab {
  min-width: 0;
  min-height: 72rpx;
  margin: 0;
  padding: 0 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9rpx;
  border: 0;
  border-radius: 17rpx;
  background: transparent;
  color: var(--text-secondary);
  font-size: 23rpx;
  font-weight: 700;
  line-height: 1.2;
}
.shelf-tab::after { border: 0; }
.shelf-tab.is-active {
  color: var(--accent-contrast);
  background: var(--accent-gradient);
  box-shadow: 0 7rpx 18rpx var(--glow), inset 0 1rpx 0 rgba(255, 255, 255, .28);
}
.shelf-tab:active { transform: scale(.97); }
.shelf-tab-count {
  flex: none;
  min-width: 34rpx;
  padding: 3rpx 9rpx;
  border-radius: 999rpx;
  background: var(--surface-strong);
  color: var(--text-secondary);
  font-size: 17rpx;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.shelf-tab.is-active .shelf-tab-count { color: var(--accent-ink); background: rgba(255, 255, 255, .68); }
.shelf-context { display: flex; align-items: center; gap: 14rpx; margin-top: 17rpx; }
.shelf-sub { flex: 1; min-width: 0; color: var(--text-secondary); font-size: 21rpx; line-height: 1.45; }
.shelf-chip {
  flex: none;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: var(--surface-strong);
  color: var(--text-secondary);
  font-size: 19rpx;
  font-weight: 700;
}
.shelf-chip.is-ready { color: var(--accent-ink); background: rgba(var(--accent-rgb), .14); }

.scan-row { display: flex; gap: 12rpx; margin-top: 22rpx; }
.scan-btn { flex: 1; min-height: 84rpx; display: flex; align-items: center; justify-content: center; gap: 8rpx; font-size: 23rpx; }

.stat-row { display: flex; margin-top: 20rpx; padding: 16rpx 0; border-radius: 18rpx; background: var(--surface-soft); }
.stat-cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3rpx; }
.stat-cell + .stat-cell { border-left: 1rpx solid var(--line); }
.stat-num { color: var(--text); font-size: 26rpx; font-weight: 750; }
.stat-num.is-small { font-size: 21rpx; font-weight: 650; }
.stat-key { color: var(--text-secondary); font-size: 18rpx; }

.track-list { display: flex; flex-direction: column; gap: 2rpx; margin-top: 16rpx; }
.track { display: flex; align-items: center; gap: 12rpx; padding: 14rpx 6rpx; border-radius: 12rpx; }
.track:active { background: var(--surface-soft); }
.track.is-playing { background: rgba(var(--accent-rgb), .1); }
.track-dot {
  flex: none; width: 22rpx; height: 22rpx; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-strong); color: var(--accent-ink); font-size: 16rpx;
}
.track.is-playing .track-dot { background: var(--accent); color: var(--accent-contrast); }
.track.is-playing .track-name { color: var(--accent-ink); font-weight: 700; }
.track-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-size: 22rpx; }
.track-size { flex: none; color: var(--text-secondary); font-size: 19rpx; }
.track-add {
  flex: none;
  width: 52rpx; height: 52rpx; margin: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 14rpx;
  background: transparent; color: var(--accent-ink);
  opacity: .62;
}
.track-add::after { border: 0; }
.track-add:active { opacity: 1; transform: scale(.9); background: rgba(var(--accent-rgb), .14); }
.track-remove {
  flex: none;
  width: 52rpx; height: 52rpx; margin: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 14rpx;
  background: transparent; color: var(--text-secondary);
  opacity: .62;
}
.track-remove::after { border: 0; }
.track-remove:active { opacity: 1; transform: scale(.9); color: #d9556d; background: rgba(217, 85, 109, .12); }
.shelf-empty { margin-top: 18rpx; padding: 26rpx 20rpx; border-radius: 18rpx; border: 1rpx dashed var(--line); color: var(--text-secondary); font-size: 21rpx; text-align: center; }

/* 底部悬浮播放卡：钉在底栏上方，滑列表也能随时操控（v4.8.0）。
   left/right:0 + margin auto 让它和内容区（max-width 760px）对齐；
   bottom 让开底栏（.page.has-nav 的 164rpx）+ 安全区，再留一点缝。 */
.player-spacer { height: 320rpx; }
.player-card {
  position: fixed;
  z-index: 70;
  left: 0; right: 0;
  bottom: calc(178rpx + max(var(--inset-bottom, 0px), env(safe-area-inset-bottom, 0px)));
  width: calc(100% - 56rpx);
  max-width: 760px;
  margin: 0 auto;
  padding: 14rpx 22rpx 16rpx;
  border-radius: 28rpx;
  box-shadow: 0 16rpx 44rpx -12rpx var(--shadow-dark), inset 0 1rpx 0 var(--line);
}
html.is-tablet .player-card { width: calc(100% - 80rpx); max-width: 1080px; }
html.is-tablet.is-wide .player-card { max-width: 1180px; }

/* 平板：曲库和歌单都改成双列，一屏能看到两倍曲目；歌单展开仍留在各自卡片里。 */
html.is-wide .shelf { padding: 28rpx 32rpx 32rpx; }
html.is-wide .track-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 26rpx;
}
html.is-wide .playlist-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  align-items: start;
}
html.is-wide .pl-item { min-width: 0; }
html.is-wide .player-card { padding: 18rpx 26rpx 20rpx; }
/* 横屏平板：播放卡改成左信息 / 右控制的两栏，少占约 80px 高度，曲库能多露出一行 */
html.is-tablet.is-landscape .player-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "head controls"
    "progress controls";
  align-items: center;
  column-gap: 30rpx;
}
html.is-tablet.is-landscape .player-head { grid-area: head; }
html.is-tablet.is-landscape .player-progress { grid-area: progress; margin-top: 10rpx; }
html.is-tablet.is-landscape .player-controls { grid-area: controls; margin-top: 0; min-width: 540rpx; }
html.is-tablet.is-landscape .player-spacer { height: 300rpx; }
.player-head { display: flex; align-items: center; gap: 14rpx; }
.player-art {
  flex: none;
  width: 66rpx;
  height: 66rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18rpx;
  background: linear-gradient(140deg, var(--surface-strong), var(--surface-soft));
  color: var(--text-secondary);
}
.player-copy { flex: 1; min-width: 0; }
.player-title { color: var(--text); font-size: 26rpx; font-weight: 720; }
.player-sub { margin-top: 4rpx; color: var(--text-secondary); font-size: 20rpx; }
.player-badge {
  flex: none;
  padding: 5rpx 14rpx;
  border-radius: 999rpx;
  border: 1rpx dashed var(--line);
  color: var(--text-secondary);
  font-size: 18rpx;
  font-weight: 700;
}
.player-badge.is-live { border-style: solid; border-color: transparent; color: var(--accent-contrast); background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
.player-progress { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx; }
.time { flex: none; width: 66rpx; color: var(--text-secondary); font-size: 18rpx; font-variant-numeric: tabular-nums; text-align: center; }
.player-slider {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 72rpx;
  margin: 0;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}
.player-slider-rail {
  position: relative;
  width: 100%;
  height: 10rpx;
  border-radius: 999rpx;
  background: var(--surface-strong);
  box-shadow: inset 0 1rpx 3rpx var(--shadow-dark);
}
.player-slider-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: inherit;
  background: var(--accent-gradient);
  pointer-events: none;
}
.player-slider-thumb {
  position: absolute;
  top: 50%;
  width: 30rpx;
  height: 30rpx;
  border: 5rpx solid var(--accent);
  border-radius: 50%;
  background: var(--surface-strong);
  box-shadow: 0 4rpx 12rpx var(--glow);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.player-slider.is-dragging .player-slider-thumb { transform: translate(-50%, -50%) scale(1.18); }
.player-slider:focus-visible .player-slider-rail { box-shadow: 0 0 0 5rpx rgba(var(--accent-rgb), .2); }
.player-slider.is-disabled { opacity: .45; cursor: default; }
.player-controls { position: relative; display: flex; align-items: center; justify-content: center; gap: 40rpx; margin-top: 8rpx; }
/* 三种播放模式合并成一个按钮：贴在控制行右侧，点一次循环切换。 */
.mode-btn {
  flex: none;
  min-width: 0;
  height: 56rpx; margin: 0; padding: 0 16rpx;
  display: flex; align-items: center; justify-content: center; gap: 8rpx;
  border: 1rpx solid rgba(var(--accent-rgb), .34); border-radius: 999rpx;
  background: var(--surface-soft); color: var(--accent-ink);
  font-size: 20rpx; line-height: 1;
}
.mode-btn::after { border: 0; }
.mode-btn:active { transform: scale(.95); }
.mode-trigger {
  position: absolute; right: 0; top: 50%;
  transform: translateY(-50%);
}
.mode-trigger:active { transform: translateY(-50%) scale(.94); }
@media (max-width: 380px) {
  .player-controls { gap: 24rpx; }
  .mode-trigger { padding: 0 12rpx; }
}
.ctrl-btn {
  width: 76rpx; height: 76rpx; margin: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 50%; background: var(--surface-soft); color: var(--text);
}
.ctrl-btn::after { border: 0; }
.ctrl-btn:disabled { opacity: .4; }
.ctrl-btn:active { transform: scale(.93); }
.ctrl-btn.play-btn {
  width: 96rpx; height: 96rpx;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: var(--accent-contrast); box-shadow: 8rpx 12rpx 24rpx var(--glow);
}
/* 播放/暂停/切歌图标：纯 CSS 画，不用 emoji 字符（emoji 在紫色按钮上会被系统渲染成黄色小方块） */
.icon-pause { display: flex; align-items: center; justify-content: center; gap: 9rpx; height: 40rpx; }
.pause-bar { display: block; width: 9rpx; height: 38rpx; border-radius: 3rpx; background: #fff; }
.icon-play { width: 0; height: 0; border-left: 36rpx solid #fff; border-top: 21rpx solid transparent; border-bottom: 21rpx solid transparent; margin-left: 9rpx; }
.icon-prev, .icon-next { display: flex; align-items: center; justify-content: center; }
.skip-bar { display: block; width: 5rpx; height: 30rpx; border-radius: 2rpx; background: currentColor; }
.skip-tri { width: 0; height: 0; border-top: 15rpx solid transparent; border-bottom: 15rpx solid transparent; }
.skip-tri-left { border-right: 24rpx solid currentColor; margin-left: 3rpx; }
.skip-tri-right { border-left: 24rpx solid currentColor; margin-right: 3rpx; }
.player-foot { margin-top: 16rpx; color: var(--text-secondary); font-size: 19rpx; line-height: 1.65; text-align: center; }
.hint { margin-top: 16rpx; color: var(--text-secondary); font-size: 19rpx; line-height: 1.6; opacity: .82; }

/* ---------- 歌单面板（底部抽屉式） ---------- */
.sheet-mask {
  position: fixed; z-index: 950; inset: 0;
  display: flex; align-items: flex-end;
  background: var(--dialog-mask);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  animation: mask-in 180ms ease both;
}
.sheet {
  width: 100%;
  max-height: 78vh;
  padding: 32rpx 30rpx calc(30rpx + env(safe-area-inset-bottom));
  border-radius: 34rpx 34rpx 0 0;
  border: 1rpx solid var(--line);
  border-bottom: 0;
  background: linear-gradient(158deg, var(--surface-strong), var(--surface) 72%);
  box-shadow: 0 -20rpx 60rpx -30rpx var(--shadow-dark);
  display: flex; flex-direction: column;
  animation: sheet-in 240ms cubic-bezier(.22, 1, .32, 1) both;
}
.sheet-small { max-height: 70vh; }
@keyframes sheet-in { from { transform: translateY(100%); } to { transform: translateY(0); } }
.sheet-head { display: flex; align-items: center; justify-content: space-between; }
.sheet-title { color: var(--text); font-size: 30rpx; font-weight: 750; }
.sheet-close {
  width: 56rpx; height: 56rpx; margin: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 50%; background: var(--surface-soft); color: var(--text-secondary);
}
.sheet-close::after { border: 0; }
.sheet-close:active { transform: scale(.92); }

.new-playlist-row { display: flex; gap: 12rpx; margin-top: 24rpx; }
.new-playlist-input, .pl-rename-input {
  flex: 1; min-width: 0; height: 76rpx; padding: 0 22rpx;
  border: 1rpx solid var(--line); border-radius: 18rpx;
  background: var(--surface-soft); color: var(--text); font-size: 23rpx;
}
.input-placeholder { color: var(--text-secondary); opacity: .7; }
.new-playlist-btn {
  flex: none; min-width: 130rpx; height: 76rpx; margin: 0; padding: 0 24rpx;
  display: flex; align-items: center; justify-content: center; line-height: 1;
  border: 0; border-radius: 18rpx; color: var(--accent-contrast); font-size: 23rpx; font-weight: 700;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.new-playlist-btn::after { border: 0; }
.new-playlist-btn:active { transform: scale(.96); }
.sheet-scroll { margin-top: 20rpx; max-height: 52vh; }
.sheet-empty {
  padding: 40rpx 24rpx; border-radius: 18rpx; border: 1rpx dashed var(--line);
  color: var(--text-secondary); font-size: 21rpx; line-height: 1.7; text-align: center;
}
.playlist-list { margin-top: 20rpx; }
.playlist-empty {
  margin-top: 20rpx;
  padding: 34rpx 24rpx;
  border: 1rpx dashed var(--line);
  border-radius: 18rpx;
  color: var(--text-secondary);
  font-size: 21rpx;
  line-height: 1.7;
  text-align: center;
}

.pl-item { margin-bottom: 14rpx; border-radius: 20rpx; background: var(--surface-soft); overflow: hidden; }
.pl-head { display: flex; align-items: center; gap: 10rpx; padding: 16rpx 14rpx; }
.pl-expand {
  flex: none; width: 46rpx; height: 46rpx; margin: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; background: transparent; color: var(--text-secondary);
}
.pl-expand::after { border: 0; }
.pl-caret { font-size: 22rpx; }
.pl-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-size: 23rpx; font-weight: 680; }
.pl-rename-input { flex: 1; height: 60rpx; padding: 0 14rpx; font-size: 22rpx; }
.pl-count { flex: none; color: var(--text-secondary); font-size: 18rpx; }
/* 播放歌单：改成醒目的紫色胶囊「▶ 播放」，不再是不起眼的小音符 */
.pl-play {
  flex: none; min-width: 132rpx; height: 58rpx; margin: 0; padding: 0 18rpx;
  display: flex; align-items: center; justify-content: center; gap: 9rpx; line-height: 1;
  border: 0; border-radius: 999rpx;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: var(--accent-contrast); font-size: 21rpx; font-weight: 700;
  box-shadow: 0 6rpx 16rpx var(--glow);
}
.pl-play::after { border: 0; }
.pl-play:active { transform: scale(.94); }
.pl-play:disabled { opacity: .4; box-shadow: none; }
.pl-play-tri {
  flex: none; width: 0; height: 0;
  border-left: 17rpx solid currentColor;
  border-top: 11rpx solid transparent;
  border-bottom: 11rpx solid transparent;
  margin-left: 2rpx;
}
.pl-del {
  flex: none; width: 52rpx; height: 52rpx; margin: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 14rpx; background: transparent;
  color: #d9556d; opacity: .7;
}
.pl-del::after { border: 0; }
.pl-del:active { background: rgba(217, 85, 109, .12); opacity: 1; transform: scale(.92); }
.pl-tracks { padding: 4rpx 16rpx 16rpx 60rpx; }
.pl-track-empty { padding: 18rpx 0; color: var(--text-secondary); font-size: 19rpx; }
.pl-track { display: flex; align-items: center; gap: 10rpx; padding: 12rpx 0; }
.pl-track + .pl-track { border-top: 1rpx solid var(--line); }
.pl-track-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-size: 21rpx; }
.pl-track-remove {
  flex: none; width: 44rpx; height: 44rpx; margin: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 12rpx; background: transparent; color: var(--text-secondary);
}
.pl-track-remove::after { border: 0; }
.pl-track-remove:active { color: #d9556d; background: rgba(217, 85, 109, .12); }

.add-track-name { margin-top: 16rpx; color: var(--text); font-size: 23rpx; font-weight: 650; }
.add-target {
  width: 100%; min-height: 96rpx; margin: 0 0 12rpx; padding: 18rpx 24rpx;
  display: flex; align-items: center; justify-content: space-between;
  border: 1rpx solid var(--line); border-radius: 18rpx;
  background: var(--surface-soft); color: var(--text);
}
.add-target::after { border: 0; }
.add-target:active { transform: scale(.98); background: rgba(var(--accent-rgb), .1); }
.add-target-name { font-size: 24rpx; font-weight: 650; }
.add-target-count { color: var(--text-secondary); font-size: 19rpx; }
.add-new-here {
  width: 100%; min-height: 84rpx; margin: 18rpx 0 0; padding: 16rpx;
  border: 1rpx dashed var(--line); border-radius: 18rpx;
  background: transparent; color: var(--accent-ink); font-size: 22rpx; font-weight: 650;
}
.add-new-here::after { border: 0; }
.add-new-here:active { background: rgba(var(--accent-rgb), .1); }
</style>
