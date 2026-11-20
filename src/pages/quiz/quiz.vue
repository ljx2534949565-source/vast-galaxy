<template>
  <view class="page">
    <view v-if="feedback" :key="feedbackKey" class="screen-feedback" :class="feedback" aria-hidden="true" />
    <view class="page-content">
      <view class="top-bar">
        <button class="icon-button" aria-label="返回" @click="goBack"><AppIcon name="back" :size="25" /></button>
        <view class="quiz-heading">
          <view class="top-title">{{ heading }}</view>
          <view class="top-subtitle">{{ subtitle }}</view>
        </view>
      </view>

      <view v-if="state !== 'scope'" class="quiz-toolbar">
        <text class="toolbar-label">背诵方向</text>
        <view class="dir-switch" :class="`is-${directionMode}`" role="group" aria-label="背诵方向">
          <view class="dir-thumb" />
          <button
            v-for="item in DIRECTION_OPTIONS"
            :key="item.key"
            class="dir-label"
            :class="{ on: directionMode === item.key }"
            :aria-pressed="directionMode === item.key"
            :aria-label="item.full"
            @click="setDirection(item.key)"
          >{{ item.label }}</button>
        </view>
        <text v-if="randomTag" class="dir-tag">{{ randomTag }}</text>
        <view v-if="state === 'running'" class="session-count serif">{{ index + 1 }}/{{ questions.length }}</view>
      </view>

      <!-- ① 每次进来都要走的范围选择：记住上次勾的课，默认全选 -->
      <view v-if="state === 'scope'" class="scope-card glass-card fade-up">
        <view class="scope-head">
          <view>
            <view class="scope-title">请选择抽查范围</view>
            <view class="scope-copy">只会从勾选的 Lesson 里随机出题，不写进背诵进度。</view>
          </view>
          <view class="scope-icon"><AppIcon name="quiz" :size="24" /></view>
        </view>

        <view class="scope-actions">
          <button class="mini-button" @click="selectAll">全选</button>
          <button class="mini-button" @click="clearAll">清空</button>
          <text class="scope-picked">已选 {{ selected.length }}/{{ lessons.length }} 课 · {{ pool.length }} 词</text>
        </view>

        <view class="scope-grid">
          <view v-for="unit in units" :key="unit" class="scope-row">
            <text class="scope-unit">U{{ unit }}</text>
            <view class="scope-lessons">
              <button
                v-for="lesson in lessonsOf(unit)"
                :key="lesson"
                class="scope-chip"
                :class="{ on: selected.includes(lesson), done: store.lessonStatus(lesson).left === 0 }"
                :aria-pressed="selected.includes(lesson)"
                @click="toggleLesson(lesson)"
              >
                <text class="chip-name">L{{ lesson }}</text>
                <text class="chip-sub">{{ store.lessonStatus(lesson).total - store.lessonStatus(lesson).left }}/{{ store.lessonStatus(lesson).total }}</text>
              </button>
            </view>
          </view>
        </view>

        <button class="primary-button scope-next" :disabled="!selected.length" @click="goSetup">下一步 · 选题量</button>
        <view class="hint">勾选状态会记住，下次进来还是这几课；不选任何课时按钮不可用。</view>
      </view>

      <!-- ② 题量 -->
      <view v-else-if="state === 'setup'" class="setup glass-card fade-up">
        <view class="setup-symbol"><AppIcon name="quiz" :size="42" /></view>
        <view class="setup-title serif">这次做几题</view>
        <view class="setup-copy">从已勾选的 {{ selected.length }} 个 Lesson（{{ pool.length }} 词）里随机抽题，每题 4 个释义。</view>
        <view class="count-options">
          <button
            v-for="count in counts"
            :key="count"
            class="count-option"
            :class="{ active: selectedCount === count, 'is-short': pool.length < count }"
            @click="selectedCount = count"
          >
            <text class="serif">{{ count }}</text><small>题</small>
          </button>
        </view>
        <button class="primary-button start-button" @click="startQuiz">开始测验</button>
        <button class="secondary-button back-button" @click="state = 'scope'">重新选范围</button>
      </view>

      <!-- ③ 答题 -->
      <view v-else-if="state === 'running' && question" class="running">
        <view class="stage-progress"><view :style="{ width: `${(index / questions.length) * 100}%` }" /></view>
        <!-- 和学新词同一套结构：左列题卡、右列选项；手机上自动按 order 排成上下 -->
        <view class="quiz-cols">
          <view class="quiz-col quiz-col-prompt">
            <view :key="`prompt-${questionKey}`" class="question-card glass-card" :class="[feedback, { 'is-zh2en': isZh2En }]">
              <view class="question-meta">{{ stageMeta }}</view>
              <view class="question-word serif" :class="wordClass">{{ promptText }}</view>
              <button v-if="!isZh2En" class="sound-button" @click="speak(question.word.word).catch(() => undefined)">
                <AppIcon name="volume" :size="21" /><text class="serif">{{ question.word.phonetic || '听发音' }}</text>
              </button>
              <view v-else-if="locked" class="reveal-row" @click="speak(question.word.word).catch(() => undefined)">
                <AppIcon name="volume" :size="16" />
                <text class="reveal-word serif">{{ question.word.word }}</text>
              </view>
              <view class="question-prompt">{{ hintText }}</view>
            </view>

            <!-- 和学习页同一张统计卡：题号在上、数字在下，答满 3 题才出现 -->
            <view v-if="showPace" class="pace-card">
              <view class="pace-cell">
                <text class="pace-label">已学习</text>
                <text class="pace-value">{{ elapsedLabel }}</text>
              </view>
              <view class="pace-divider" />
              <view class="pace-cell">
                <text class="pace-label">答对均速</text>
                <view class="pace-value-line">
                  <text class="pace-value">{{ averageLabel }}</text>
                  <text v-if="score > 0" class="pace-unit">s</text>
                </view>
              </view>
              <view v-if="pace" class="pace-rank" :style="{ background: pace.bg, color: pace.fg }">{{ pace.title }}</view>
            </view>
          </view>

          <view class="quiz-col quiz-col-answer">
            <view :key="`options-${questionKey}`" class="option-list" :class="{ 'is-locked': locked, 'is-powdered': powder }">
              <button
                v-for="(option, position) in question.options"
                :key="option.id"
                class="choice-button"
                :class="[optionClass(option.id), { 'is-en': isZh2En }]"
                :style="{ '--fly-delay': `${90 + position * 55}ms` }"
                :aria-disabled="locked"
                @click="answer(option.id)"
              >
                <text class="option-letter">{{ letters[position] }}</text>
                <text class="option-meaning">{{ optionText(option) }}</text>
                <AppIcon v-if="locked && option.id === question.word.id" name="check" :size="20" />
                <AppIcon v-else-if="locked && option.id === pickedId" name="close" :size="20" />
              </button>
            </view>

            <view class="answer-note" :class="noteTone ? `note-${noteTone}` : ''">{{ note }}</view>

            <view v-if="autoPending" class="auto-next" @click="cancelAutoNext">
              <view class="auto-next-track"><view class="auto-next-fill" /></view>
              <text class="auto-next-copy">即将进入下一题 · 点击暂停</text>
            </view>
            <button v-else-if="locked" class="next-button" @click="nextQuestion">
              {{ index === questions.length - 1 ? '查看结果' : '下一题' }}
            </button>
          </view>
        </view>
      </view>

      <!-- ④ 结果 -->
      <view v-else class="result glass-card fade-up" :class="{ 'is-perfect': isPerfect }">
        <view v-if="isPerfect" class="perfect-badge"><AppIcon name="sparkles" :size="15" /><text>PERFECT</text></view>
        <view class="result-label">本轮正确率</view>
        <view class="result-score serif">{{ accuracy }}%</view>
        <view class="result-detail">答对 {{ score }} 题 · 答错 {{ questions.length - score }} 题</view>
        <view class="result-stats">
          <view class="result-stat">
            <text class="result-stat-value">{{ averageLabel }}<text v-if="averageLabel !== '—'" class="result-stat-unit">s</text></text>
            <text class="result-stat-label">答对均速</text>
          </view>
          <view class="result-stat">
            <text class="result-stat-value">{{ elapsedLabel }}</text>
            <text class="result-stat-label">用时</text>
          </view>
          <view class="result-stat">
            <text class="result-stat-value">{{ questions.length }}</text>
            <text class="result-stat-label">题量</text>
          </view>
        </view>
        <view v-if="pace" class="pace-rank result-rank" :style="{ background: pace.bg, color: pace.fg }">{{ pace.title }}</view>
        <view v-if="isPerfect" class="result-praise">{{ praise }}</view>
        <view class="result-note">{{ resultNote }}</view>
        <button class="primary-button result-button" @click="startQuiz">同样范围 · 再来一轮</button>
        <button v-if="mistakeCount > 0" class="secondary-button result-button mistake-button" @click="goMistakes">
          <AppIcon name="target" :size="18" />
          <text>错题本（{{ mistakeCount }}）</text>
        </button>
        <button class="secondary-button result-button" @click="state = 'scope'">换一个范围</button>
        <button class="secondary-button result-button" @click="goBack">返回首页</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onUnload } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import words from '@/data/wordsData';
import { createQuizFrom, type QuizQuestion, type WordItem } from '@/utils/quiz';
import { getQuizLessons, saveQuizLessons } from '@/utils/storage';
import { useProgressStore } from '@/stores/progress';
import { useSettingsStore } from '@/stores/settings';
import { useTTS } from '@/composables/useTTS';
import { playCorrectFeedback, playCorrectSound, playTapFeedback, playWrongFeedback, playWrongSound } from '@/utils/feedback';
import { RANK_MIN_ANSWERS, RANK_MIN_ACCURACY, paceForRound } from '@/utils/pace';
import {
  DIRECTION_OPTIONS,
  answerOf,
  directionTag,
  hintOf,
  planDirections,
  promptOf,
  resolveDirection,
  type DirectionMode,
  type QuizDirection
} from '@/utils/direction';
import { LESSONS_PER_UNIT, UNIT_COUNT } from '@/utils/scopes';
import { scrollPageTop } from '@/utils/scroll';

const store = useProgressStore();
const settings = useSettingsStore();
const { speak, stop } = useTTS();
// 直接从 H5 深链进来时 onLaunch 可能还没跑完，这里补一次
if (!store.loaded) store.init();
const counts = [10, 20, 30];
const letters = ['A', 'B', 'C', 'D', 'E'];
const units = Array.from({ length: UNIT_COUNT }, (_, position) => position + 1);
const lessons = Array.from({ length: UNIT_COUNT * LESSONS_PER_UNIT }, (_, position) => position + 1);
const PRAISES = [
  '全对。这一轮的状态，值得记下来。',
  '没有一道题绊住你，保持这个手感。',
  '又快又准，你已经把这些词拿稳了。'
];

const state = ref<'scope' | 'setup' | 'running' | 'result'>('scope');
/** 每次进来都弹范围选择，但勾选状态沿用上次 */
const selected = ref<number[]>(getQuizLessons());
const selectedCount = ref(10);
const questions = ref<QuizQuestion[]>([]);
const index = ref(0);
const pickedId = ref<number | null>(null);
const locked = ref(false);
const score = ref(0);
const feedback = ref('');
const feedbackKey = ref(0);
const questionKey = ref(0);
const powder = ref(false);
const autoPending = ref(false);
const activeDirection = ref<QuizDirection>('en2zh');
const directionPlan = ref<QuizDirection[]>([]);
const correctMs = ref(0);
const elapsedMs = ref(0);
const AUTO_NEXT_MS = 300;
/** 单题计时上限：走神回来的一次不算进均速 */
const QUESTION_CAP_MS = 120000;
let questionStartedAt = 0;
let autoNextTimer: ReturnType<typeof setTimeout> | null = null;
let collapseTimer: ReturnType<typeof setTimeout> | null = null;
const praise = ref('');
const note = ref('');
const noteTone = ref<'' | 'correct' | 'wrong'>('');
/** 已答题数：答完还没翻页时也算进去，统计卡才不会慢半拍 */
const answeredCount = computed(() => (state.value === 'running' ? index.value + (locked.value ? 1 : 0) : questions.value.length));
const showPace = computed(() => state.value === 'running' && answeredCount.value >= 3);
/** 错题本现有条数：结算页只在有错题时给入口 */
const mistakeCount = computed(() => store.mistakes.length);
/** 每秒跳一次，只为了「已学习」这个数字在答题时也在走 */
const clock = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

const pool = computed(() => {
  const picked = new Set(selected.value);
  return (words as WordItem[]).filter((word) => picked.has(word.lesson ?? 0));
});
const question = computed(() => questions.value[index.value]);
const directionMode = computed(() => settings.direction);
const isZh2En = computed(() => activeDirection.value === 'zh2en');
const randomTag = computed(() => directionTag(directionMode.value, activeDirection.value));
const promptText = computed(() => (question.value ? promptOf(question.value.word, activeDirection.value) : ''));
const hintText = computed(() => hintOf(activeDirection.value));
const optionText = (option: WordItem) => answerOf(option, activeDirection.value);
const wordClass = computed(() => {
  if (isZh2En.value) return 'is-cn';
  const length = question.value?.word.word.length ?? 0;
  if (length >= 14) return 'is-xlong';
  if (length >= 10) return 'is-long';
  return '';
});
const stageMeta = computed(() => {
  const word = question.value?.word;
  if (!word) return '';
  const unit = Math.ceil((word.lesson ?? 1) / LESSONS_PER_UNIT);
  return `UNIT ${String(unit).padStart(2, '0')} · LESSON ${String(word.lesson ?? 1).padStart(2, '0')} · ${word.pos}`;
});
const accuracy = computed(() => (questions.value.length ? Math.round((score.value / questions.value.length) * 100) : 0));
const averageSeconds = computed(() => (score.value ? correctMs.value / score.value / 1000 : 0));
const averageLabel = computed(() => (score.value ? averageSeconds.value.toFixed(3) : '—'));
const elapsedLabel = computed(() => {
  const running = questionStartedAt && !locked.value ? Math.max(0, clock.value - questionStartedAt) : 0;
  return formatClock(elapsedMs.value + Math.min(running, QUESTION_CAP_MS));
});
// 分母用「已答」而不是总题量：答题中途也能算出这一轮当下的称号，和学习页同口径
const roundPace = computed(() => paceForRound(averageSeconds.value, answeredCount.value, score.value));
const pace = computed(() => roundPace.value.rank);
const isPerfect = computed(() => state.value === 'result' && questions.value.length > 0 && score.value === questions.value.length);
const resultNote = computed(() => {
  if (roundPace.value.note === 'few') return `本轮 ${questions.value.length} 题，不到 ${RANK_MIN_ANSWERS} 题不计称号`;
  if (roundPace.value.note === 'accuracy') return `正确率 ${accuracy.value}%，未达 ${Math.round(RANK_MIN_ACCURACY * 100)}%，称号封顶「顶级」`;
  return '答错的词已进入错题本；快速测验不会改动背诵进度。';
});
const heading = computed(() => (state.value === 'scope' ? '快速测验' : state.value === 'setup' ? '快速测验' : state.value === 'running' ? '快速测验' : '本轮结果'));
const subtitle = computed(() => {
  if (state.value === 'scope') return '选择这次要抽查的 Lesson';
  if (state.value === 'setup') return `已选 ${selected.value.length} 课 · ${pool.value.length} 词`;
  if (state.value === 'running') {
    if (!locked.value) return hintText.value;
    return pickedId.value === question.value?.word.id ? '回答正确，继续保持' : '这题已加入错题本';
  }
  return '不写进度，只测手感';
});

function lessonsOf(unit: number) {
  return [0, 1, 2, 3].map((offset) => (unit - 1) * 4 + offset + 1);
}
function toggleLesson(lesson: number) {
  const next = selected.value.includes(lesson)
    ? selected.value.filter((item) => item !== lesson)
    : [...selected.value, lesson].sort((left, right) => left - right);
  selected.value = next;
  void playTapFeedback();
}
/** 勾选即记：下次进来还是这几课，不用重新点一遍 */
watch(selected, (value) => {
  if (value.length) saveQuizLessons(value);
});
function selectAll() {
  selected.value = [...lessons];
  void playTapFeedback();
}
function clearAll() {
  selected.value = [];
  void playTapFeedback();
}
function goSetup() {
  if (!selected.value.length) {
    uni.showToast({ title: '至少勾选一个 Lesson', icon: 'none' });
    return;
  }
  // 词太少的范围不必强撑 30 题，直接把题量选项压到上限
  if (pool.value.length < selectedCount.value) selectedCount.value = counts.find((count) => count <= pool.value.length) ?? 10;
  state.value = 'setup';
  scrollPageTop(200);
  void playTapFeedback();
}
function formatClock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}
function setDirection(mode: DirectionMode) {
  if (directionMode.value === mode) return;
  settings.setDirection(mode);
  directionPlan.value = planDirections(mode, questions.value.length);
  if (question.value && state.value === 'running') {
    activeDirection.value = directionPlan.value[index.value] ?? resolveDirection(mode);
  }
  void playTapFeedback();
}
function startQuiz() {
  if (!store.loaded) store.init();
  const size = Math.min(selectedCount.value, pool.value.length);
  questions.value = createQuizFrom(pool.value, size);
  directionPlan.value = planDirections(directionMode.value, questions.value.length);
  index.value = 0;
  pickedId.value = null;
  locked.value = false;
  powder.value = false;
  score.value = 0;
  correctMs.value = 0;
  elapsedMs.value = 0;
  feedback.value = '';
  praise.value = PRAISES[Math.floor(Math.random() * PRAISES.length)];
  state.value = questions.value.length ? 'running' : 'setup';
  startClock();
  setupQuestion();
  scrollPageTop(200);
}
function setupQuestion() {
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
  questionKey.value += 1;
  activeDirection.value = directionPlan.value[index.value] ?? resolveDirection(directionMode.value);
  questionStartedAt = question.value ? Date.now() : 0;
  pickedId.value = null;
  locked.value = false;
  powder.value = false;
  feedback.value = '';
  note.value = '';
  noteTone.value = '';
  cancelAutoNext();
}
function answer(id: number) {
  const current = question.value;
  if (!current || locked.value) return;
  locked.value = true;
  let spent = 0;
  if (questionStartedAt) {
    spent = Math.min(Date.now() - questionStartedAt, QUESTION_CAP_MS);
    elapsedMs.value += spent;
    questionStartedAt = 0;
  }
  pickedId.value = id;
  const correct = id === current.word.id;
  note.value = correct ? '掌握 +1' : `正确答案是「${answerOf(current.word, activeDirection.value)}」`;
  noteTone.value = correct ? 'correct' : 'wrong';
  if (correct) {
    score.value += 1;
    correctMs.value += spent;
    feedback.value = 'feedback-correct';
    // 触感先发：错开一点就会和碎屑动画对不上
    void playCorrectFeedback();
    // 音效（默认关，设置里开了才响；与震动独立）
    void playCorrectSound();
    powder.value = true;
    if (collapseTimer) clearTimeout(collapseTimer);
    // 位置和正确项都先抓在闭包里：760ms 后用户可能已经翻到下一题，
    // 用 index.value 去查会把新题的选项一起吃掉
    const collapsedAt = index.value;
    const keptId = current.word.id;
    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      questions.value = questions.value.map((item, position) =>
        position === collapsedAt ? { ...item, options: item.options.filter((option) => option.id === keptId) } : item
      );
    }, 760);
    if (settings.autoNext && index.value < questions.value.length - 1) {
      autoPending.value = true;
      autoNextTimer = setTimeout(() => {
        autoNextTimer = null;
        autoPending.value = false;
        nextQuestion();
      }, AUTO_NEXT_MS);
    }
  } else {
    // 只进错题本，不碰背诵进度：快速测验是"抽查"，不该把没学的课标成学过
    store.recordMistake(current.word.id, 'quiz');
    feedback.value = 'feedback-wrong';
    void playWrongFeedback();
    void playWrongSound();
  }
  feedbackKey.value += 1;
}
function optionClass(id: number) {
  const current = question.value;
  if (!locked.value || !current) return '';
  if (id === current.word.id) return 'is-correct';
  if (powder.value) return 'is-powder';
  if (id === pickedId.value) return 'is-wrong';
  return 'is-dim';
}
function cancelAutoNext() {
  if (autoNextTimer) clearTimeout(autoNextTimer);
  autoNextTimer = null;
  autoPending.value = false;
}
function nextQuestion() {
  if (!locked.value) return;
  cancelAutoNext();
  if (index.value >= questions.value.length - 1) {
    state.value = 'result';
    stopClock();
    scrollPageTop(220);
    return;
  }
  index.value += 1;
  setupQuestion();
  // H5 里点屏幕外的按钮会让 .page 自己 scrollTop 一下，不归零下一题会顶出屏幕
  scrollPageTop(160);
}
function goBack() {
  uni.navigateBack({ delta: 1, fail: () => uni.reLaunch({ url: '/pages/index/index' }) });
}
/** 结算页直接去错题本专练 */
function goMistakes() {
  uni.navigateTo({ url: '/pages/study/study?mode=mistakes' });
}
function startClock() {
  stopClock();
  clock.value = Date.now();
  tickTimer = setInterval(() => {
    if (!locked.value) clock.value = Date.now();
  }, 1000);
}
function stopClock() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
onUnload(() => {
  cancelAutoNext();
  if (collapseTimer) clearTimeout(collapseTimer);
  stopClock();
  stop();
});
</script>

<style scoped>
.quiz-heading { flex: 1; min-width: 0; margin-left: 22rpx; }
.quiz-heading .top-title { font-size: 30rpx; white-space: nowrap; }
.quiz-count { min-width: 90rpx; text-align: right; color: var(--accent-ink); font-size: 27rpx; font-variant-numeric: tabular-nums; }

/* 正误反馈推到整个屏幕四边，和答题页保持一致 */
.screen-feedback { position: fixed; inset: 0; z-index: 60; pointer-events: none; border: 6rpx solid transparent; opacity: 0; }
.screen-feedback.feedback-correct { border-color: rgba(67, 210, 157, .74); box-shadow: inset 0 0 76rpx 22rpx rgba(48, 196, 139, .42); background: radial-gradient(ellipse at center, transparent 52%, rgba(48, 196, 139, .18) 100%); animation: screen-correct-flash 360ms ease-out both; }
.screen-feedback.feedback-wrong { border-color: rgba(255, 100, 128, .76); box-shadow: inset 0 0 82rpx 24rpx rgba(239, 83, 111, .44); background: radial-gradient(ellipse at center, transparent 50%, rgba(239, 83, 111, .20) 100%); animation: screen-wrong-flash 480ms ease-out both; }
@keyframes screen-correct-flash { 0% { opacity: 0; } 22% { opacity: 1; } 58% { opacity: .56; } 100% { opacity: 0; } }
@keyframes screen-wrong-flash { 0% { opacity: 0; } 14% { opacity: 1; } 30% { opacity: .34; } 46% { opacity: .9; } 100% { opacity: 0; } }

/* 方向三档 */
.quiz-toolbar { display: flex; align-items: center; gap: 14rpx; margin: -6rpx 0 20rpx; }
.toolbar-label { color: var(--text-secondary); font-size: 21rpx; font-weight: 600; letter-spacing: 1rpx; white-space: nowrap; }
.dir-switch { position: relative; display: flex; flex: 0 0 auto; align-items: center; width: 300rpx; height: 54rpx; margin: 0; padding: 4rpx; border: 1rpx solid var(--line); border-radius: 999rpx; background: var(--surface-soft); box-shadow: inset 0 2rpx 6rpx var(--shadow-dark); }
.dir-thumb { position: absolute; top: 4rpx; bottom: 4rpx; left: 4rpx; width: calc((100% - 8rpx) / 3); border-radius: 999rpx; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 4rpx 5rpx 12rpx var(--glow); transition: transform 240ms cubic-bezier(.32, 1.16, .36, 1); }
.dir-switch.is-zh2en .dir-thumb { transform: translateX(100%); }
.dir-switch.is-random .dir-thumb { transform: translateX(200%); }
.dir-label { position: relative; z-index: 1; flex: 1 1 0; min-width: 0; height: 46rpx; margin: 0; padding: 0; border: 0; border-radius: 999rpx; background: transparent; color: var(--text-secondary); text-align: center; font-size: 19rpx; font-weight: 700; line-height: 46rpx; }
.dir-label::after { border: 0; }
.dir-label.on { color: var(--accent-contrast); text-shadow: 0 1rpx 2rpx rgba(10, 16, 30, .22); }
.dir-tag { flex: 0 0 auto; padding: 5rpx 12rpx; border-radius: 12rpx; background: var(--surface-soft); color: var(--accent-ink); font-size: 18rpx; font-weight: 650; white-space: nowrap; }
.session-count { margin-left: auto; padding: 6rpx 16rpx; border-radius: 14rpx; background: var(--surface-soft); color: var(--text-secondary); font-size: 24rpx; font-variant-numeric: tabular-nums; }

/* 范围选择 */
.scope-card { padding: 28rpx 24rpx 24rpx; }
.scope-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.scope-title { font-size: 33rpx; font-weight: 750; }
.scope-copy { margin-top: 8rpx; color: var(--text-secondary); font-size: 21rpx; line-height: 1.55; }
.scope-icon { width: 62rpx; height: 62rpx; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 20rpx; background: var(--surface-soft); color: var(--accent-ink); }
.scope-actions { display: flex; align-items: center; gap: 12rpx; margin-top: 22rpx; }
.mini-button { height: 50rpx; margin: 0; padding: 0 20rpx; border-radius: 14rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--text-secondary); font-size: 21rpx; line-height: 50rpx; }
.mini-button::after { border: 0; }
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

/* 题量 */
/* 题量卡整体压到下半屏：10 / 20 / 30 三个按钮落在拇指区 */
.setup { margin-top: 18vh; padding: 44rpx 34rpx; text-align: center; }
.setup-symbol { width: 104rpx; height: 104rpx; display: flex; align-items: center; justify-content: center; margin: 0 auto 22rpx; border-radius: 32rpx; color: var(--accent-ink); background: var(--surface-soft); }
.setup-title { font-size: 42rpx; font-weight: 700; }
.setup-copy { margin: 18rpx auto 32rpx; max-width: 90%; color: var(--text-secondary); font-size: 23rpx; line-height: 1.65; }
.count-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14rpx; }
/* uni 的 button 在 H5 是块级：只给 height 的话两行内容会贴着上沿排，
   看起来就是"10 和 题"整体偏上。显式做纵向居中。 */
.count-option { height: 124rpx; margin: 0; border-radius: 22rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--text); line-height: 1.2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4rpx; }
.count-option::after { border: 0; }
.count-option text { display: block; font-size: 44rpx; font-weight: 700; }
.count-option small { color: var(--text-secondary); font-size: 19rpx; }
.count-option.active { color: var(--accent-ink); border-color: var(--accent-ink); box-shadow: 0 0 0 4rpx var(--glow); }
.count-option.is-short { opacity: .45; }
.start-button { width: 100%; margin-top: 26rpx; }
.back-button { width: 100%; margin-top: 14rpx; }

/* 答题：与学新词共用一套两列骨架。手机上 display:contents 按 order 排成
   题卡 → 选项 → 提示 → 下一题，宽屏才真正分成左右两栏。 */
.quiz-cols { display: flex; flex-direction: column; flex: 1; }
.quiz-col { display: contents; }
.quiz-col-prompt .question-card { order: 1; }
.quiz-col-answer .option-list { order: 2; }
.quiz-col-answer .answer-note { order: 3; }
.quiz-col-answer .auto-next,
.quiz-col-answer .next-button { order: 4; }
.quiz-col-prompt .pace-card { order: 5; }
.stage-progress { height: 7rpx; margin: 0 6rpx 22rpx; border-radius: 8rpx; background: var(--surface-soft); overflow: hidden; }
.stage-progress view { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); transition: width 300ms ease; }
.question-card {
  position: relative; overflow: hidden; isolation: isolate;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 46rpx 30rpx 40rpx; text-align: center;
  border: 1rpx solid transparent;
  background:
    linear-gradient(158deg, var(--glass-tint) 0%, var(--glass-tint-2) 48%, var(--glass-tint) 100%) padding-box,
    linear-gradient(142deg, var(--glass-sheen), rgba(255, 255, 255, .08) 38%, var(--glass-refract) 72%, var(--glass-sheen)) border-box;
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  box-shadow: 0 30rpx 58rpx -26rpx var(--shadow-dark), inset 0 2rpx 0 var(--glass-sheen);
  animation: prompt-fly-in 420ms cubic-bezier(.2, .86, .28, 1) both;
}
@keyframes prompt-fly-in {
  0% { opacity: 0; transform: translate3d(0, 38rpx, 0) scale(.972); }
  65% { opacity: 1; transform: translate3d(0, -4rpx, 0) scale(1.004); }
  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
.question-card.feedback-correct { box-shadow: 0 0 0 2rpx rgba(67, 182, 141, .55), 0 14rpx 34rpx rgba(67, 182, 141, .18); }
.question-card.feedback-wrong { box-shadow: 0 0 0 2rpx rgba(220, 113, 135, .55), 0 14rpx 34rpx rgba(220, 113, 135, .16); }
.question-meta { color: var(--text-secondary); font-size: 20rpx; font-weight: 700; letter-spacing: 3rpx; }
.question-word { max-width: 100%; margin-top: 12rpx; overflow-wrap: anywhere; font-size: 70rpx; font-weight: 700; letter-spacing: -2rpx; }
.question-word.is-cn { font-size: 46rpx; line-height: 1.45; font-weight: 720; letter-spacing: 0; }
.question-word.is-long { font-size: 56rpx; letter-spacing: -1rpx; }
.question-word.is-xlong { font-size: 44rpx; letter-spacing: -1rpx; }
.question-card.is-zh2en { min-height: 300rpx; }
.sound-button { display: inline-flex; align-items: center; gap: 12rpx; margin-top: 24rpx; padding: 13rpx 26rpx; border-radius: 30rpx; background: var(--surface-soft); color: var(--accent-ink); font-size: 25rpx; border: 1rpx solid var(--line); }
.sound-button::after { border: 0; }
.reveal-row { display: inline-flex; align-items: center; gap: 8rpx; margin-top: 16rpx; padding: 8rpx 18rpx; border-radius: 999rpx; border: 1rpx dashed var(--line); background: var(--surface-soft); color: var(--accent-ink); }
.reveal-word { font-size: 26rpx; font-weight: 700; }
.question-prompt { margin-top: 26rpx; color: var(--text-secondary); font-size: 21rpx; letter-spacing: 1rpx; }

.option-list { display: flex; flex-direction: column; gap: 22rpx; margin-top: 28rpx; transition: gap 300ms ease 380ms; }
.option-list.is-powdered { gap: 0; }
.option-list.is-locked .choice-button { pointer-events: none; }
.choice-button {
  position: relative; overflow: hidden; isolation: isolate;
  width: 100%; min-height: 134rpx; display: flex; align-items: center;
  margin: 0; padding: 22rpx 28rpx 22rpx 22rpx; border-radius: 24rpx; border: 1rpx solid transparent;
  background:
    linear-gradient(160deg, var(--glass-tint) 0%, var(--glass-tint-2) 58%, var(--glass-tint) 100%) padding-box,
    linear-gradient(135deg, var(--glass-sheen), rgba(255, 255, 255, .06) 42%, var(--glass-refract) 78%) border-box;
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  box-shadow: 0 16rpx 34rpx -22rpx var(--shadow-dark), inset 0 2rpx 0 var(--glass-sheen);
  color: var(--text); text-align: left;
  transition: transform 120ms ease, box-shadow 240ms ease, background 240ms ease, opacity 240ms ease;
  animation: option-fly-in 380ms cubic-bezier(.2, .82, .26, 1) both;
  animation-delay: var(--fly-delay, 80ms);
}
.choice-button::after { border: 0; }
@keyframes option-fly-in {
  0% { opacity: 0; transform: translate3d(34rpx, 22rpx, 0) scale(.975); }
  70% { opacity: 1; transform: translate3d(-3rpx, 0, 0) scale(1.002); }
  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
.option-letter { flex: 0 0 auto; width: 50rpx; height: 50rpx; margin-right: 20rpx; border-radius: 16rpx; background: var(--surface-strong); box-shadow: 1rpx 2rpx 5rpx var(--shadow-dark); color: var(--text-secondary); text-align: center; line-height: 50rpx; font-size: 23rpx; font-weight: 800; }
.option-meaning { flex: 1; font-size: 28rpx; line-height: 1.45; }
.choice-button.is-en .option-meaning { font-size: 32rpx; font-weight: 640; letter-spacing: .4rpx; }
.choice-button.is-correct { background: linear-gradient(135deg, rgba(67, 182, 141, .34), rgba(67, 182, 141, .16)); border-color: rgba(67, 182, 141, .9); box-shadow: 0 0 0 1rpx rgba(67, 182, 141, .48), 0 12rpx 30rpx rgba(67, 182, 141, .28); animation: correct-pop 400ms cubic-bezier(.2, 1.2, .35, 1); animation-delay: 0ms; }
.choice-button.is-correct .option-letter { color: var(--success); }
.choice-button.is-wrong { background: linear-gradient(135deg, rgba(220, 113, 135, .22), rgba(220, 113, 135, .10)); border-color: rgba(220, 113, 135, .78); box-shadow: 0 0 0 1rpx rgba(220, 113, 135, .40); animation: option-shake 320ms ease; animation-delay: 0ms; }
.choice-button.is-dim { opacity: .48; animation-delay: 0ms; }
@keyframes correct-pop { 0% { transform: scale(1); } 30% { transform: scale(1.03); } 100% { transform: scale(1); } }
/* 答对后干扰项碎裂：只动位移和透明度，不叠第二层模糊 */
.choice-button.is-powder {
  pointer-events: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  will-change: transform, opacity;
  animation: powder-burst 520ms cubic-bezier(.22, .72, .3, 1) forwards, powder-collapse 300ms cubic-bezier(.4, 0, .2, 1) 380ms forwards;
  animation-delay: 0ms, 380ms;
}
.choice-button.is-powder::before {
  content: ''; position: absolute; left: 50%; top: 50%; z-index: 2;
  width: 8rpx; height: 8rpx; border-radius: 50%; background: currentColor; opacity: 0; pointer-events: none;
  box-shadow:
    -120rpx -12rpx 0 -2rpx currentColor, -70rpx -26rpx 0 0 currentColor, -30rpx -18rpx 0 -1rpx currentColor,
    16rpx -28rpx 0 0 currentColor, 60rpx -20rpx 0 -2rpx currentColor, 110rpx -6rpx 0 0 currentColor,
    124rpx 14rpx 0 -1rpx currentColor, 78rpx 20rpx 0 0 currentColor, 28rpx 22rpx 0 -2rpx currentColor,
    -20rpx 16rpx 0 0 currentColor, -68rpx 22rpx 0 -1rpx currentColor, -112rpx 12rpx 0 0 currentColor;
  animation: dust-fly 620ms cubic-bezier(.2, .7, .4, 1) forwards;
}
@keyframes powder-burst {
  0% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
  12% { transform: translate3d(-3rpx, 0, 0) scale(1.008); }
  24% { transform: translate3d(3rpx, 0, 0) scale(1.014); }
  38% { opacity: .9; transform: translate3d(-1rpx, 0, 0) scale(1.018); }
  68% { opacity: .38; transform: translate3d(0, 2rpx, 0) scale(1.025); }
  100% { opacity: 0; transform: translate3d(0, 12rpx, 0) scale(.94); }
}
@keyframes powder-collapse {
  0% { max-height: 260rpx; min-height: 134rpx; padding-top: 22rpx; padding-bottom: 22rpx; }
  100% { max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; border-width: 0; }
}
@keyframes dust-fly {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(.12); }
  14% { opacity: 1; }
  55% { opacity: .9; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(2.1); }
}
@keyframes option-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-9rpx); }
  60% { transform: translateX(8rpx); }
  85% { transform: translateX(-4rpx); }
}
.auto-next { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10rpx; min-height: 86rpx; margin-top: 8rpx; }
.auto-next-track { width: 100%; height: 4rpx; border-radius: 999rpx; background: var(--line); overflow: hidden; }
.auto-next-fill { height: 100%; border-radius: 999rpx; background: linear-gradient(90deg, var(--accent), var(--accent-2)); animation: auto-next-fill 300ms linear forwards; }
.auto-next-copy { color: var(--text-secondary); font-size: 19rpx; letter-spacing: 1rpx; }
@keyframes auto-next-fill { from { width: 0; } to { width: 100%; } }
.next-button { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 88rpx; margin-top: 14rpx; padding: 0 24rpx; border: 0; border-radius: 22rpx; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); font-size: 27rpx; font-weight: 700; box-shadow: 8rpx 12rpx 24rpx var(--glow); }
.next-button:active { transform: scale(.98); }
.answer-note { min-height: 52rpx; padding: 16rpx 6rpx 0; text-align: center; color: var(--text-secondary); font-size: 23rpx; opacity: 0; transition: opacity 200ms ease; }
.answer-note.note-correct { color: var(--success); opacity: 1; }
.answer-note.note-wrong { color: var(--danger); opacity: 1; }
/* 统计卡与学习页逐项对齐：同样的分栏、同样的字号、同样的称号胶囊 */
.pace-card { display: flex; align-items: center; gap: 22rpx; margin-top: 26rpx; padding: 22rpx 24rpx 20rpx; border-radius: 24rpx; border: 1rpx solid var(--line); background: var(--surface-strong); box-shadow: 0 10rpx 26rpx var(--shadow-dark); }
.pace-cell { display: flex; flex-direction: column; gap: 6rpx; min-width: 0; }
.pace-label { color: var(--text-secondary); font-size: 20rpx; font-weight: 600; letter-spacing: 1.5rpx; }
.pace-value { color: var(--text); font-variant-numeric: tabular-nums; font-size: 38rpx; font-weight: 760; line-height: 1.05; letter-spacing: -.5rpx; white-space: nowrap; }
.pace-value-line { display: flex; align-items: baseline; }
.pace-unit { margin-left: 2rpx; color: var(--text-secondary); font-size: 21rpx; font-weight: 650; }
.pace-divider { align-self: stretch; width: 1rpx; margin: 4rpx 6rpx; background: var(--line); }

/* 结果 */
/* 结果卡也是：三个操作按钮落在屏幕下半部分 */
.result { margin-top: 13vh; padding: 42rpx 30rpx 32rpx; text-align: center; }
.result.is-perfect { border-color: rgba(255, 190, 92, .40); box-shadow: 0 24rpx 60rpx -30rpx var(--shadow-dark), 0 0 0 1rpx rgba(255, 190, 92, .20); }
.perfect-badge { display: inline-flex; align-items: center; gap: 8rpx; margin-bottom: 14rpx; padding: 7rpx 18rpx; border-radius: 999rpx; background: linear-gradient(135deg, rgba(255, 175, 64, .92), rgba(255, 118, 148, .92)); color: #3A1200; font-size: 17rpx; font-weight: 800; letter-spacing: 3rpx; }
.result-label { color: var(--text-secondary); font-size: 22rpx; }
.result-score { margin-top: 6rpx; color: var(--accent-ink); font-size: 96rpx; font-weight: 700; line-height: 1.05; }
.result-detail { font-size: 25rpx; font-weight: 650; }
.result-stats { display: flex; align-items: stretch; margin-top: 24rpx; }
.result-stat { position: relative; flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 5rpx; }
.result-stat + .result-stat::before { content: ''; position: absolute; left: 0; top: 8rpx; bottom: 8rpx; width: 1rpx; background: var(--line); }
.result-stat-value { font-size: 28rpx; font-weight: 750; font-variant-numeric: tabular-nums; }
.result-stat-unit { margin-left: 2rpx; color: var(--text-secondary); font-size: 18rpx; }
.result-stat-label { color: var(--text-secondary); font-size: 18rpx; }
.pace-rank { display: inline-block; margin-top: 22rpx; padding: 9rpx 20rpx; border-radius: 999rpx; font-size: 23rpx; font-weight: 760; letter-spacing: .5rpx; box-shadow: 0 6rpx 16rpx rgba(12, 18, 32, .18), inset 0 1rpx 0 rgba(255, 255, 255, .28); }
.result-rank { display: inline-block; }
.result-praise { margin: 18rpx auto 0; max-width: 90%; color: var(--text); font-size: 24rpx; font-weight: 650; line-height: 1.6; }
.result-note { margin: 16rpx 0 26rpx; color: var(--text-secondary); font-size: 21rpx; line-height: 1.6; }
.result-button { width: 100%; margin-top: 12rpx; }
.mistake-button { display: flex; align-items: center; justify-content: center; gap: 10rpx; color: var(--danger); border-color: rgba(220, 113, 135, .42); }
/* ── 手机：题卡上半屏、选项沉到下半屏，和学习页同一套手感 ── */
@media (max-width: 719px) {
  .running { display: flex; flex-direction: column; min-height: calc(100vh - 418rpx); }
  .question-card { margin-bottom: auto; }
}

@media (max-width: 719px) and (max-height: 760px) {
  .running { min-height: calc(100vh - 372rpx); }
  .question-card { padding: 32rpx 26rpx 28rpx; }
  .question-card.is-zh2en { min-height: 230rpx; }
  .question-word { font-size: 58rpx; }
  .question-word.is-cn { font-size: 40rpx; }
  .question-word.is-long { font-size: 48rpx; }
  .question-word.is-xlong { font-size: 38rpx; }
  .sound-button { margin-top: 16rpx; padding: 10rpx 22rpx; font-size: 22rpx; }
  .question-prompt { margin-top: 16rpx; }
  .option-list { gap: 14rpx; margin-top: 18rpx; }
  .choice-button { min-height: 106rpx; padding: 16rpx 24rpx 16rpx 18rpx; border-radius: 20rpx; }
  .option-letter { width: 44rpx; height: 44rpx; margin-right: 16rpx; line-height: 44rpx; font-size: 21rpx; }
  .option-meaning { font-size: 26rpx; }
  .choice-button.is-en .option-meaning { font-size: 29rpx; }
  .pace-card { margin-top: 18rpx; padding: 16rpx 20rpx 14rpx; }
  .pace-value { font-size: 32rpx; }
}

/* 平板：范围选择两个 Unit 并排；答题照搬学新词的左右两栏——左侧题卡撑满整列，
   右侧四个选项纵向排开。选项不再做 2×2：两栏后每栏只有半屏宽，再拆两格会挤成窄条。 */
html.is-wide .scope-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx 28rpx;
}
html.is-wide .scope-row { min-width: 0; }
html.is-wide .running {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 320rpx);
}
html.is-wide .quiz-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.04fr);
  gap: 34rpx;
  align-items: stretch;
  flex: 0 0 auto;
  margin: auto 0;
}
html.is-wide .quiz-col { display: flex; flex-direction: column; min-width: 0; }
html.is-wide .quiz-col-prompt .question-card { flex: 1; }
html.is-wide .quiz-col-answer .option-list { margin-top: 0; gap: 24rpx; }
html.is-wide .choice-button { min-height: 134rpx; padding: 22rpx 30rpx 22rpx 24rpx; }
html.is-wide .option-meaning { font-size: 32rpx; }
html.is-wide .choice-button.is-en .option-meaning { font-size: 36rpx; }
html.is-wide .question-card { padding: 54rpx 48rpx 46rpx; }
html.is-wide .question-word { font-size: 84rpx; }
html.is-wide .question-word.is-cn { font-size: 52rpx; }
html.is-wide .question-word.is-long { font-size: 66rpx; }
html.is-wide .question-word.is-xlong { font-size: 48rpx; }
html.is-wide .answer-note { padding: 14rpx 6rpx 0; text-align: left; }
html.is-wide .setup { margin-top: 10vh; }
html.is-wide .count-options { max-width: 760px; margin-left: auto; margin-right: auto; }
html.is-wide .start-button,
html.is-wide .back-button { max-width: 760px; margin-left: auto; margin-right: auto; }
/* 窄高度横屏（平板横放 / 手机横屏）：和学新词用同一套压缩参数。
   quiz 原来没有这一段，选项保持 134rpx、题卡保持 84rpx 字号，
   看起来就比学新词大一圈，底部的统计卡还会被挤出屏幕。 */
@media (max-height: 820px) {
  html.is-wide .running { min-height: calc(100vh - 300rpx); }
  html.is-wide .question-card { padding: 44rpx 32rpx 38rpx; }
  html.is-wide .question-word { font-size: 68rpx; }
  html.is-wide .question-word.is-cn { font-size: 46rpx; }
  html.is-wide .question-word.is-long { font-size: 62rpx; }
  html.is-wide .question-word.is-xlong { font-size: 44rpx; }
  html.is-wide .choice-button { min-height: 100rpx; }
  html.is-wide .option-list { gap: 16rpx; }
}

@media (prefers-reduced-motion: reduce) {
  .screen-feedback { display: none; }
  .question-card, .choice-button { animation: none; }
  .choice-button.is-powder { opacity: 0; }
}
</style>
