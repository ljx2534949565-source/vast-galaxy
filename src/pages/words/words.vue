<template>
  <view class="page">
    <view class="page-content">
      <view class="top-bar">
        <button class="icon-button" aria-label="返回" @click="goBack"><AppIcon name="back" :size="25" /></button>
        <view class="words-heading">
          <view class="top-title">看单词</view>
          <view class="top-subtitle">{{ view === 'scope' ? '先选一课，再逐词查看' : `Lesson ${lesson} · ${pool.length} 词 · 只看不考` }}</view>
        </view>
        <button
          v-if="view === 'list'"
          class="shuffle-button"
          :class="{ on: shuffled }"
          :aria-label="shuffled ? '切回按顺序排列' : '随机打乱顺序'"
          @click="toggleShuffle"
        >
          <AppIcon name="shuffle" :size="19" />
          <text>{{ shuffled ? '随机中' : '乱序' }}</text>
        </button>
      </view>

      <!-- 从首页进入先选范围；只保留 Lesson 粒度，一次查看一课 -->
      <view v-if="view === 'scope'" class="scope-card glass-card fade-up">
        <view class="scope-head">
          <view>
            <view class="scope-title">选择要看的课文</view>
            <view class="scope-copy">选择一课查看词义和发音，不写进背诵进度。</view>
          </view>
        </view>

        <view class="scope-actions">
          <text class="scope-picked">当前 Lesson {{ lesson }} · {{ pool.length }} 词</text>
        </view>

        <view class="scope-grid">
          <view v-for="unit in units" :key="unit" class="scope-row">
            <text class="scope-unit">U{{ unit }}</text>
            <view class="scope-lessons">
              <button
                v-for="item in lessonsOf(unit)"
                :key="item"
                class="scope-chip"
                :class="{ on: item === lesson, done: store.lessonStatus(item).left === 0 }"
                :aria-pressed="item === lesson"
                @click="selectLesson(item)"
              >
                <text class="chip-name">L{{ item }}</text>
                <text class="chip-sub">{{ store.lessonStatus(item).total }} 词</text>
              </button>
            </view>
          </view>
        </view>

        <button class="primary-button scope-next" @click="openWords">开始看单词 · {{ pool.length }} 词</button>
        <view class="hint">每次从首页进入都会先选范围；看单词不记录成绩，也不改动掌握状态。</view>
      </view>

      <view v-else class="word-browser">
        <scroll-view scroll-x class="unit-scroll" :show-scrollbar="false">
          <view class="unit-list">
            <button v-for="unit in units" :key="unit" class="unit-chip" :class="{ active: unit === activeUnit }" @click="selectUnit(unit)">Unit {{ unit }}</button>
          </view>
        </scroll-view>

        <scroll-view scroll-x class="unit-scroll lesson-scroll" :show-scrollbar="false">
          <view class="unit-list">
            <button
              v-for="item in lessons"
              :key="item"
              class="unit-chip lesson-chip"
              :class="{ active: item === lesson, done: !!store.scopeTimes[`lesson:${item}`] }"
              @click="selectLesson(item)"
            >
              Lesson {{ item }}
              <text class="chip-left">{{ store.lessonStatus(item).left }}</text>
            </button>
          </view>
        </scroll-view>

        <view class="words-summary glass-card fade-up">
          <view class="summary-copy-wrap">
            <view class="summary-title">先看一遍，再去做题</view>
            <view class="summary-copy">
              这 {{ pool.length }} 个词按{{ shuffled ? '随机' : '词库' }}顺序排好；点右侧小喇叭听发音。看单词不记录成绩，也不改动掌握状态。
            </view>
          </view>
          <view class="summary-order" :class="{ on: shuffled }">{{ shuffled ? '乱序' : '顺序' }}</view>
        </view>

        <view class="word-sheet fade-up">
          <view v-for="(word, index) in list" :key="word.id" class="word-row">
            <text class="row-no serif">{{ index + 1 }}</text>
            <view class="row-copy">
              <view class="row-head">
                <text class="row-word serif">{{ word.word }}</text>
                <text v-if="word.phonetic" class="row-phonetic serif">{{ word.phonetic }}</text>
              </view>
              <view class="row-meaning"><text v-if="word.pos" class="row-pos">{{ word.pos }}</text>{{ word.meaning }}</view>
            </view>
            <button class="row-sound" aria-label="播放发音" @click.stop="playWord(word.word)">
              <AppIcon name="volume" :size="20" />
            </button>
          </view>
          <view v-if="!list.length" class="row-empty">这一课还没有词。</view>
        </view>

        <view class="footer-note fade-up">点右上角「乱序」随机排一遍；退出再进来会回到顺序</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onBackPress, onLoad, onUnload } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import wordsData from '@/data/wordsData';
import { useProgressStore } from '@/stores/progress';
import { useTTS } from '@/composables/useTTS';
import { shuffle, type WordItem } from '@/utils/quiz';
import { LESSONS_PER_UNIT, UNIT_COUNT } from '@/utils/scopes';

const store = useProgressStore();
const { speak, stop } = useTTS();
// 直接从 H5 深链进入时，应用启动初始化可能还没执行到这里
if (!store.loaded) store.init();

const units = Array.from({ length: UNIT_COUNT }, (_, index) => index + 1);
const view = ref<'scope' | 'list'>('scope');
const lesson = ref(1);
const shuffled = ref(false);
/** 乱序只在按下按钮时算一次，滚动、点喇叭都不会把顺序打乱 */
const shuffledPool = ref<WordItem[]>([]);

const activeUnit = computed(() => Math.ceil(lesson.value / LESSONS_PER_UNIT));
const lessons = computed(() => lessonsOf(activeUnit.value));
const pool = computed(() => wordsData.filter((word) => word.lesson === lesson.value));
const list = computed(() => (shuffled.value ? shuffledPool.value : pool.value));

function lessonsOf(unit: number) {
  return Array.from({ length: LESSONS_PER_UNIT }, (_, offset) => (unit - 1) * LESSONS_PER_UNIT + offset + 1);
}

function selectUnit(unit: number) {
  selectLesson((unit - 1) * LESSONS_PER_UNIT + 1);
}

function selectLesson(next: number) {
  lesson.value = next;
  if (shuffled.value) shuffledPool.value = shuffle(pool.value);
}

function openWords() {
  // 每次从范围卡进入词表都恢复词库顺序；乱序只属于当前这次浏览
  shuffled.value = false;
  shuffledPool.value = [];
  view.value = 'list';
}

function backToScope() {
  stop();
  shuffled.value = false;
  shuffledPool.value = [];
  view.value = 'scope';
}

function toggleShuffle() {
  if (shuffled.value) {
    shuffled.value = false;
    shuffledPool.value = [];
    return;
  }
  shuffledPool.value = shuffle(pool.value);
  shuffled.value = true;
}

function playWord(word: string) {
  speak(word).catch(() => undefined);
}

function goBack() {
  if (view.value === 'list') {
    backToScope();
    return;
  }
  uni.navigateBack();
}

onLoad((query) => {
  const wanted = Number(query?.lesson);
  const hasLesson = Number.isFinite(wanted) && wanted >= 1 && wanted <= UNIT_COUNT * LESSONS_PER_UNIT;
  const fallback = store.nextLessonToStudy();
  lesson.value = hasLesson ? wanted : fallback || 1;
  // 首页不带 lesson 参数，因此一定先出现范围卡；显式深链仍可直接打开指定一课
  view.value = hasLesson ? 'list' : 'scope';
  shuffled.value = false;
  shuffledPool.value = [];
});

onBackPress(() => {
  if (view.value !== 'list') return false;
  backToScope();
  return true;
});

onUnload(() => stop());
</script>

<style scoped>
.words-heading { flex: 1; min-width: 0; margin-left: 22rpx; }
.words-heading .top-title { font-size: 30rpx; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 范围选择：与快速测验同一套排版，但这里是单选，一课对应一张词表 */
.scope-card { padding: 28rpx 24rpx 24rpx; }
.scope-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.scope-title { font-size: 33rpx; font-weight: 750; }
.scope-copy { margin-top: 8rpx; color: var(--text-secondary); font-size: 21rpx; line-height: 1.55; }
.scope-actions { display: flex; align-items: center; margin-top: 22rpx; }
.scope-picked { margin-left: auto; color: var(--accent-ink); font-size: 20rpx; font-weight: 650; }
.scope-grid { display: flex; flex-direction: column; gap: 12rpx; margin-top: 18rpx; }
.scope-row { display: flex; align-items: center; gap: 10rpx; }
.scope-unit { flex: 0 0 46rpx; color: var(--text-secondary); font-size: 19rpx; font-weight: 750; letter-spacing: .5rpx; }
.scope-lessons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10rpx; flex: 1; min-width: 0; }
.scope-chip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2rpx; height: 76rpx; margin: 0; padding: 0; border-radius: 16rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--text-secondary); transition: transform 120ms ease, border-color 160ms ease, background 160ms ease; }
.scope-chip:active { transform: scale(.95); }
.scope-chip::after { border: 0; }
.scope-chip.on { border-color: var(--accent-ink); background: var(--accent-gradient-soft); color: var(--accent-ink); box-shadow: 0 0 0 2rpx var(--glow); }
.scope-chip.done:not(.on) { opacity: .55; }
.chip-name { font-size: 22rpx; font-weight: 750; }
.chip-sub { font-size: 15rpx; font-variant-numeric: tabular-nums; opacity: .78; }
.scope-next { width: 100%; margin-top: 24rpx; }
.hint { margin-top: 16rpx; color: var(--text-secondary); font-size: 20rpx; line-height: 1.6; }

/* 右上角那颗乱序按钮：没开时是素的，开了之后用主色渐变，一眼能看出当前是乱序 */
.shuffle-button {
  display: flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 6rpx;
  height: 56rpx; margin: 0; padding: 0 18rpx; border-radius: 18rpx;
  border: 1rpx solid var(--line); background: var(--surface-soft);
  color: var(--text-secondary); font-size: 21rpx; line-height: 56rpx;
  transition: background 180ms ease, color 180ms ease, transform 120ms ease;
}
.shuffle-button:active { transform: scale(.96); }
.shuffle-button.on {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent; color: var(--accent-contrast); box-shadow: 5rpx 7rpx 18rpx var(--glow);
}

.unit-scroll { width: 100%; margin-bottom: 20rpx; white-space: nowrap; }
.unit-list { display: inline-flex; gap: 14rpx; padding: 3rpx 3rpx 12rpx; }
.unit-chip { min-width: 126rpx; height: 62rpx; line-height: 62rpx; padding: 0 18rpx; border-radius: 20rpx; background: var(--surface); color: var(--text-secondary); font-size: 23rpx; border: 1rpx solid var(--line); }
.unit-chip.active { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); box-shadow: 5rpx 7rpx 18rpx var(--glow); }
.lesson-scroll { margin-top: -10rpx; }
.lesson-scroll .unit-list { gap: 10rpx; }
.lesson-chip { display: inline-flex; align-items: center; justify-content: center; gap: 6rpx; min-width: 156rpx; height: 56rpx; line-height: 56rpx; padding: 0 10rpx; font-size: 21rpx; }
.lesson-chip.done:not(.active) { opacity: .58; }
.chip-left { min-width: 30rpx; padding: 0 6rpx; border-radius: 12rpx; background: rgba(127, 127, 150, .18); color: inherit; font-size: 18rpx; line-height: 30rpx; text-align: center; }
.lesson-chip.active .chip-left { background: rgba(18, 22, 34, .28); }

.words-summary { display: flex; align-items: center; gap: 18rpx; margin-bottom: 20rpx; padding: 24rpx 26rpx; }
.summary-copy-wrap { flex: 1; min-width: 0; }
.summary-title { font-size: 26rpx; font-weight: 720; }
.summary-copy { margin-top: 6rpx; color: var(--text-secondary); font-size: 21rpx; line-height: 1.5; }
.summary-order { flex: 0 0 auto; padding: 8rpx 16rpx; border-radius: 14rpx; background: var(--surface-soft); color: var(--text-secondary); font-size: 20rpx; font-weight: 700; }
.summary-order.on { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); }

/* 整张词表放在一块底板上，不做毛玻璃：70 多个词的高度远超屏幕，
   这么大的区域再上 backdrop-filter，滚动会明显掉帧。 */
.word-sheet {
  border: 1rpx solid var(--line);
  border-radius: 24rpx;
  background-color: var(--surface-strong);
  background-image: linear-gradient(var(--sheet-wash), var(--sheet-wash));
  box-shadow: 10rpx 14rpx 34rpx var(--shadow-dark), inset 0 1rpx 0 var(--line);
  overflow: hidden;
}
.word-row { display: flex; align-items: center; gap: 18rpx; padding: 20rpx 24rpx; border-top: 1rpx solid var(--sheet-line); }
.word-row:first-child { border-top: 0; }
.row-no { flex: 0 0 48rpx; color: var(--text-secondary); font-size: 20rpx; opacity: .7; text-align: right; }
.row-copy { flex: 1; min-width: 0; }
.row-head { display: flex; align-items: baseline; gap: 12rpx; flex-wrap: wrap; }
.row-word { font-size: 34rpx; font-weight: 640; }
.row-phonetic { color: var(--text-secondary); font-size: 21rpx; }
.row-meaning { margin-top: 6rpx; color: var(--text-secondary); font-size: 23rpx; line-height: 1.45; word-break: break-word; }
.row-pos { margin-right: 6rpx; color: var(--accent-ink); font-size: 20rpx; font-weight: 700; }
.row-sound { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; width: 60rpx; height: 60rpx; margin: 0; padding: 0; border-radius: 18rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--text-secondary); }
.row-sound:active { transform: scale(.94); }
.row-empty { padding: 40rpx; color: var(--text-secondary); font-size: 23rpx; text-align: center; }

.footer-note { margin-top: 24rpx; color: var(--text-secondary); font-size: 20rpx; text-align: center; }

html.is-wide .words-heading { margin-left: 28rpx; }
html.is-wide .words-heading .top-title { font-size: 38rpx; }
/* 平板：词表放宽到 1080，行内能同时看到单词、音标和完整释义；
   每个 Unit 只有 4 课，范围选择改成两个 Unit 并排，避免右侧留一条空列 */
html.is-wide .scope-card,
html.is-wide .word-sheet { max-width: 1080px; }
html.is-wide .scope-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx 28rpx;
}
html.is-wide .scope-row { min-width: 0; }
/* 平板：词表排成两列，一屏能看两倍的词；分隔线改成行内横线 + 中间竖线 */
html.is-wide .word-sheet {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
html.is-wide .word-row { min-width: 0; padding: 18rpx 26rpx; }
html.is-wide .word-row:nth-child(-n+2) { border-top: 0; }
html.is-wide .word-row:nth-child(even) { border-left: 1rpx solid var(--sheet-line); }
html.is-wide .row-empty { grid-column: 1 / -1; }
html.is-wide .row-word { font-size: 36rpx; }
html.is-wide .row-meaning { font-size: 24rpx; }
</style>
