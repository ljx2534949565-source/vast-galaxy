<template>
  <view class="page">
    <view v-if="feedback" :key="feedbackKey" class="screen-feedback" :class="feedback" aria-hidden="true" />
    <view class="page-content">
      <view class="top-bar">
        <button class="icon-button" aria-label="返回" @click="goBack"><AppIcon name="back" :size="25" /></button>
        <view class="study-heading">
          <view class="top-title">{{ title }}</view>
          <view class="top-subtitle">{{ subtitle }}</view>
        </view>
        <view v-if="mode === 'new'" class="head-actions">
          <button v-if="scopeStarted && canSwitchScope" class="swap-button" @click="askSwitchScope">{{ switchLabel }}</button>
          <button v-if="scopeStarted" class="swap-button reset-button" @click="askResetScope">
            <AppIcon name="reset" :size="17" />
            <text>重置</text>
          </button>
        </view>
      </view>

      <view class="study-toolbar">
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
        <view v-if="queue.length" class="session-count serif">{{ Math.min(index + 1, queue.length) }}/{{ queue.length }}</view>
      </view>

      <scroll-view v-if="showPicker && currentScope && currentScope.mode === 'lesson'" scroll-x class="unit-scroll" :show-scrollbar="false">
        <view class="unit-list">
          <button v-for="unit in units" :key="unit" class="unit-chip" :class="{ active: selectedUnit === unit }" @click="selectUnit(unit)">Unit {{ unit }}</button>
        </view>
      </scroll-view>

      <scroll-view v-if="showPicker && currentScope && currentScope.mode === 'lesson'" scroll-x class="unit-scroll lesson-scroll" :show-scrollbar="false">
        <view class="unit-list">
          <button
            v-for="lesson in lessons"
            :key="lesson"
            class="unit-chip lesson-chip"
            :class="{ active: selectedLesson === lesson, done: !!store.scopeTimes[`lesson:${lesson}`] }"
            @click="selectLesson(lesson)"
          >
            Lesson {{ lesson - (selectedUnit - 1) * 4 }}
            <text class="chip-left">{{ store.lessonStatus(lesson).left }}</text>
          </button>
        </view>
      </scroll-view>

      <scroll-view v-if="showPicker && currentScope && currentScope.mode !== 'lesson'" scroll-x class="unit-scroll" :show-scrollbar="false">
        <view class="unit-list">
          <button
            v-for="item in siblings"
            :key="item.key"
            class="unit-chip lesson-chip"
            :class="{ active: currentScope.id === item.id, done: !!store.scopeTimes[item.key] }"
            @click="selectScope(item)"
          >
            {{ item.label }}
            <text v-if="item.mode !== 'astra'" class="chip-left">{{ siblingStats.get(item.key) }}</text>
          </button>
        </view>
      </scroll-view>

      <view v-if="current" class="study-stage">
        <view class="stage-progress"><view :style="{ width: `${(index / queue.length) * 100}%` }" /></view>

        <view class="stage-cols">
          <view class="stage-col stage-col-prompt">
            <view :key="`prompt-${questionKey}`" class="prompt glass-card" :class="[feedback, { 'is-zh2en': isZh2En }]">
              <view class="unit-label">{{ stageMeta }}</view>
              <view class="word serif" :class="wordClass">{{ promptText }}</view>
              <button v-if="!isZh2En" class="sound-button" aria-label="播放单词发音" @click.stop="playWord">
                <AppIcon name="volume" :size="22" />
                <text>听发音</text>
              </button>
              <view v-else-if="locked" class="reveal-row" @click.stop="playWord">
                <AppIcon name="volume" :size="17" />
                <text class="reveal-word serif">{{ current.word }}</text>
                <text v-if="current.phonetic" class="reveal-phonetic">{{ current.phonetic }}</text>
              </view>
              <view class="prompt-hint">{{ hintText }}</view>
            </view>

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
                  <text v-if="correctCount > 0" class="pace-unit">s</text>
                </view>
              </view>
              <view v-if="pace" class="pace-rank" :style="{ background: pace.bg, color: pace.fg }">{{ pace.title }}</view>
            </view>
          </view>

          <view class="stage-col stage-col-answer">
            <view :key="`options-${questionKey}`" class="option-list" :class="{ 'is-locked': locked, 'is-powdered': powder }">
              <button
                v-for="(option, position) in options"
                :key="option.id"
                class="option"
                :class="[optionClass(option), { 'is-en': isZh2En }]"
                :style="{ '--fly-delay': `${90 + position * 55}ms` }"
                :aria-disabled="locked"
                @click="answer(option)"
              >
                <text class="option-index">{{ letters[position] }}</text>
                <text class="option-text">{{ optionText(option) }}</text>
                <AppIcon v-if="locked && option.id === current.id" class="option-mark" name="check" :size="20" />
                <AppIcon v-else-if="locked && option.id === pickedId" class="option-mark" name="close" :size="20" />
              </button>
            </view>

            <view class="answer-note" :class="noteTone ? `note-${noteTone}` : ''">{{ note }}</view>

            <view v-if="autoPending" class="auto-next" @click="cancelAutoNext">
              <view class="auto-next-track"><view class="auto-next-fill" /></view>
              <text class="auto-next-copy">即将进入下一题 · 点击暂停</text>
            </view>

            <view v-else-if="locked && settled" class="action-row">
              <button v-if="canGuess" class="guess-button" @click="markGuess">我蒙的</button>
              <button class="next-button" @click="nextQuestion">{{ isLast ? '完成本课' : '下一题' }}</button>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="empty-state glass-card fade-up" :class="{ 'is-celebrating': celebrated }">
        <view v-if="celebrated" class="celebrate-layer" aria-hidden="true">
          <view v-for="piece in confetti" :key="piece.id" class="confetti" :style="piece.style" />
        </view>
        <view v-if="celebrated" class="celebrate-badge">
          <AppIcon name="sparkles" :size="15" />
          <text>PERFECT RUN</text>
        </view>
        <view v-if="celebrated" class="celebrate-title serif">{{ celebrateHeadline }}</view>
        <view v-if="celebrated" class="celebrate-copy">{{ praise }}</view>
        <view v-if="!celebrated" class="empty-icon"><AppIcon name="sparkles" :size="42" /></view>
        <view v-if="!celebrated" class="empty-title">{{ emptyTitle }}</view>
        <view v-if="!celebrated" class="empty-copy">{{ emptyCopy }}</view>
        <view v-if="answeredCount > 0" class="result-score serif">{{ correctCount }}<text class="result-total">/{{ answeredCount }}</text></view>
        <view v-if="answeredCount > 0 || historicBest !== null" class="result-stats">
          <view class="result-stat">
            <text class="result-stat-value is-key">{{ accuracyLabel }}</text>
            <text class="result-stat-label">正确率</text>
          </view>
          <view class="result-stat">
            <text class="result-stat-value">{{ resultAverage }}<text v-if="resultHasPace" class="result-stat-unit">s</text></text>
            <text class="result-stat-label">答对均速</text>
          </view>
          <view class="result-stat">
            <text class="result-stat-value">{{ resultElapsed }}</text>
            <text class="result-stat-label">用时</text>
          </view>
        </view>
        <view v-if="pace" class="pace-rank empty-rank" :style="{ background: pace.bg, color: pace.fg }">{{ pace.title }}</view>
        <view v-if="(answeredCount > 0 || historicBest !== null) && rankNote" class="rank-note">{{ rankNote }}</view>
        <button v-if="mode === 'new' && nextScopeData" class="primary-button empty-action" @click="goNextScope">{{ nextScopeLabel }}</button>
        <!-- 有错题才出现：没做错的这一轮不该多一个得先想「要不要点」的按钮 -->
        <button v-if="mistakeCount > 0" class="secondary-button empty-action mistake-action" @click="goMistakes">
          <AppIcon name="target" :size="18" />
          <text>错题本（{{ mistakeCount }}）</text>
        </button>
        <button v-if="mode === 'new' && scopeStarted" class="secondary-button empty-action" @click="askResetScope">
          重学这个 {{ scopeLabel }}（只清本 {{ scopeLabel }} 记录）
        </button>
        <button v-if="mode === 'new' && canSwitchScope" class="secondary-button empty-action" @click="openScopePicker">
          换一个 {{ scopeLabel }}
        </button>
        <button class="secondary-button empty-action" @click="goBack">返回首页</button>
      </view>
    </view>

    <ConfirmDialog
      v-if="dialog"
      :model-value="true"
      :title="dialog.title"
      :content="dialog.content"
      :confirm-text="dialog.confirmText"
      :cancel-text="dialog.cancelText"
      :danger="dialog.danger"
      @confirm="confirmDialog"
      @cancel="dialog = null"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { useProgressStore } from '@/stores/progress';
import { useSettingsStore } from '@/stores/settings';
import { useTTS } from '@/composables/useTTS';
import { distractors, shuffle, type WordItem } from '@/utils/quiz';
import { playCelebrateFeedback, playCorrectFeedback, playCorrectSound, playTapFeedback, playWrongFeedback, playWrongSound } from '@/utils/feedback';
import { RANK_MIN_ANSWERS, RANK_MIN_ACCURACY, isCelebrationRank, paceForRound } from '@/utils/pace';
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
import { scrollPageTop } from '@/utils/scroll';
import { ASTRA_ROUND, CHUNK_SIZE, EPIC_UNITS, LESSONS_PER_UNIT, SCOPE_MODES, parseScopeKey, scopeOf, scopesOf, type ScopeDef } from '@/utils/scopes';

const store = useProgressStore();
const settings = useSettingsStore();
const { speak, stop } = useTTS();
const letters = ['A', 'B', 'C', 'D', 'E'];
const mode = ref<'review' | 'new' | 'mistakes'>('review');
const selectedUnit = ref(1);
const selectedLesson = ref(1);
/** 当前背诵块：课 / Unit / Chunk / Epic / Astra 统一用它描述 */
const currentScope = ref<ScopeDef | null>(null);
const units = Array.from({ length: 10 }, (_, position) => position + 1);
const lessons = computed(() => store.lessonsOfUnit(selectedUnit.value));
const queue = ref<WordItem[]>([]);
const options = ref<WordItem[]>([]);
const index = ref(0);
const pickedId = ref<number | null>(null);
const locked = ref(false);
const feedback = ref('');
/** 每次作答都重建边缘光层；连续答对时不会因为 class 没变而少播一次 */
const feedbackKey = ref(0);
/** 每换一题重建题卡与选项，让逐层飞入从头播放 */
const questionKey = ref(0);
const note = ref('');
const noteTone = ref<'' | 'correct' | 'wrong'>('');
const guessUsed = ref(false);
const pickerLocked = ref(false);
const powder = ref(false);
const settled = ref(false);
const dialog = ref<null | { kind: 'switch' | 'reset'; title: string; content: string; confirmText: string; cancelText: string; danger: boolean }>(null);
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let collapseTimer: ReturnType<typeof setTimeout> | null = null;
const answeredCount = ref(0);
const correctCount = ref(0);
/** 只累计答对题的用时：答错的那次不计入均速，也不刷新显示的数值 */
const correctMs = ref(0);
/** 单题计时上限：走神或锁屏回来的那一次，不让它把整轮平均带偏 */
const QUESTION_CAP_MS = 180000;
const elapsedMs = ref(0);
/** 再次打开已学完的课时，用上一次的成绩还原结算卡；没有明细时至少给出历史最快均速 */
const historicBest = ref<number | null>(null);
const clock = ref(0);
/** 答对后 0.3 秒自动翻页；最后一题仍停下等用户确认 */
const AUTO_NEXT_MS = 300;
const autoPending = ref(false);
let autoNextTimer: ReturnType<typeof setTimeout> | null = null;
let questionStartedAt = 0;
let hiddenAt = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
const pickerOpen = ref(false);
const current = computed(() => queue.value[index.value] as WordItem | undefined);
const isLast = computed(() => index.value >= queue.value.length - 1);
const canGuess = computed(() => locked.value && !guessUsed.value && !!current.value && pickedId.value === current.value.id);
/** 错题本里现有多少条：结算页只在有错题时给入口 */
const mistakeCount = computed(() => store.mistakes.length);
/** 这块有没有学过一部分：决定是否收起选择器、是否显示「换块 / 重置」 */
const scopeStarted = computed(() => {
  if (mode.value !== 'new' || !currentScope.value) return false;
  return currentScope.value.words.some((word) => !!store.progress[String(word.id)]);
});
const showPicker = computed(() => mode.value === 'new' && !pickerLocked.value && (!scopeStarted.value || pickerOpen.value));
/** 同粒度的其他块，用来横滑切换（Chunk 1 → Chunk 2 这种） */
const siblings = computed(() => (currentScope.value ? scopesOf(currentScope.value.mode) : []));
const siblingStats = computed(() => {
  const map = new Map<string, number>();
  for (const scope of siblings.value) {
    map.set(scope.key, scope.words.filter((word) => !store.progress[String(word.id)]).length);
  }
  return map;
});
/** 已学习和平均用时都在答满 3 题之后才出现：前两题样本太小，数字跳得没意义 */
const showPace = computed(() => answeredCount.value >= 3);
const liveElapsedMs = computed(() => {
  const running = questionStartedAt && !locked.value ? Math.max(0, clock.value - questionStartedAt) : 0;
  return elapsedMs.value + Math.min(running, QUESTION_CAP_MS);
});
const averageSeconds = computed(() => (correctCount.value ? correctMs.value / correctCount.value / 1000 : 0));
const elapsedLabel = computed(() => formatClock(liveElapsedMs.value));
/** 精确到毫秒——差 0.05 秒就换一个称号，只留一位小数会看不出区别 */
const averageLabel = computed(() => (correctCount.value ? averageSeconds.value.toFixed(3) : '—'));
/** 称号要过两道闸：题量够 6 题、正确率够 80%，见 paceForRound() */
const roundPace = computed(() => paceForRound(averageSeconds.value, answeredCount.value, correctCount.value));
/** null 表示这一轮不给称号，模板里 v-if="pace" 直接不渲染胶囊 */
const pace = computed(() => roundPace.value.rank);
/** 正确率：答对数 / 本轮题数。答错的也算进分母，所以它比「均速」更能说明这一块稳不稳 */
const accuracyLabel = computed(() =>
  answeredCount.value ? `${Math.round((correctCount.value / answeredCount.value) * 100)}%` : '—'
);
/** 结算页那句小字：说清为什么没有称号、为什么被压档，别让人以为是坏了 */
const rankNote = computed(() => {
  if (!answeredCount.value) {
    // 老版本只存了最快均速，没有正确率和用时；如实说明，不编数字
    if (historicBest.value !== null) {
      return `只留下历史最快 ${historicBest.value.toFixed(3)}s/题；下一轮会记录正确率与用时`;
    }
    return '';
  }
  if (roundPace.value.note === 'few') return `本轮 ${answeredCount.value} 题，不到 ${RANK_MIN_ANSWERS} 题不计称号`;
  if (roundPace.value.note === 'accuracy') {
    return `正确率 ${accuracyLabel.value}，未达 ${Math.round(RANK_MIN_ACCURACY * 100)}%，称号封顶「顶级」`;
  }
  return '';
});
/** 结算三项数字：没有本轮明细时，均速退回历史最快，另两项显示「—」 */
const resultAverage = computed(() => {
  if (correctCount.value) return averageLabel.value;
  if (historicBest.value !== null) return historicBest.value.toFixed(3);
  return '—';
});
const resultHasPace = computed(() => correctCount.value > 0 || historicBest.value !== null);
const resultElapsed = computed(() => (answeredCount.value ? elapsedLabel.value : '—'));
/** 设置里的三档：英→中 / 中→英 / 随机；改的就是它，下次进来还是上次那档 */
const directionMode = computed(() => settings.direction);
/** 这一题实际用哪个方向：随机档在出题时定死，切到下一题才重掷 */
const activeDirection = ref<QuizDirection>('en2zh');
/** 整轮的方向计划：随机档先对半铺好再打乱，不会连着十题一个方向 */
const directionPlan = ref<QuizDirection[]>([]);
const isZh2En = computed(() => activeDirection.value === 'zh2en');
const randomTag = computed(() => directionTag(directionMode.value, activeDirection.value));
/** 题目卡大字：英→中看单词，中→英看释义 */
const promptText = computed(() => (current.value ? promptOf(current.value, activeDirection.value) : ''));
const hintText = computed(() => hintOf(activeDirection.value));
/** 长单词会撑破卡片：按字母数降字号，比让它从中间断行好看 */
const wordClass = computed(() => {
  if (isZh2En.value) return 'is-cn';
  const length = current.value?.word.length ?? 0;
  if (length >= 14) return 'is-xlong';
  if (length >= 10) return 'is-long';
  return '';
});
/** 选项文字与「正确答案是…」共用一套口径，避免两处对不上 */
const optionText = (option: WordItem) => answerOf(option, activeDirection.value);
/**
 * 切方向：只换「这一题按哪个方向出」。
 * 题面和选项文字都是 activeDirection 算出来的，改完自动重渲染——
 * 不需要重抽选项，也不会把已经答完的那一题重新播一次飞入动画。
 */
function setDirection(mode: DirectionMode) {
  if (directionMode.value === mode) return;
  settings.setDirection(mode);
  directionPlan.value = planDirections(mode, queue.value.length);
  if (current.value) activeDirection.value = directionPlan.value[index.value] ?? resolveDirection(mode);
  void playTapFeedback();
}
/** 当前粒度的称呼：Lesson / Unit / Chunk / Epic / Astra，所有结算文案都用它 */
const scopeLabel = computed(() => {
  const scope = currentScope.value;
  if (!scope) return 'Lesson';
  return SCOPE_MODES.find((item) => item.key === scope.mode)?.label ?? 'Lesson';
});
const switchLabel = computed(() => `换 ${scopeLabel.value}`);
/** Astra 只有一块，没有「换一个」可选；其余粒度都能在横向列表里换 */
const canSwitchScope = computed(() => {
  const scope = currentScope.value;
  return !!scope && scope.mode !== 'astra' && scopesOf(scope.mode).length > 1;
});
/** 题目卡左上角那行小字，随粒度变 */
const stageLabel = computed(() => {
  const scope = currentScope.value;
  if (!scope) return '';
  if (scope.mode === 'lesson') {
    const unit = Math.ceil(scope.id / 4);
    return `UNIT ${String(unit).padStart(2, '0')} · LESSON ${String(scope.id).padStart(2, '0')}`;
  }
  if (scope.mode === 'unit') return `UNIT ${String(scope.id).padStart(2, '0')} · ${LESSONS_PER_UNIT} 课`;
  if (scope.mode === 'epic') {
    const from = (scope.id - 1) * EPIC_UNITS + 1;
    const to = from + EPIC_UNITS - 1;
    return `EPIC ${scope.id} · UNIT ${String(from).padStart(2, '0')}–${String(to).padStart(2, '0')}`;
  }
  if (scope.mode === 'chunk') {
    const start = (scope.id - 1) * CHUNK_SIZE + 1;
    const end = start + scope.words.length - 1;
    return `CHUNK ${scope.id} · 第 ${start}–${end} 词`;
  }
  return 'ASTRA · 全词乱序';
});
/** 复习 / 错题本没有块标签，只剩词性时别留一个孤零零的「·」 */
const stageMeta = computed(() => {
  const pos = current.value?.pos ?? '';
  const label = stageLabel.value;
  if (label && pos) return `${label} · ${pos}`;
  return label || pos;
});
const nextScopeData = computed(() => {
  const scope = currentScope.value;
  if (!scope) return null;
  // Astra 只有一块，学完就是再来一轮
  if (scope.mode === 'astra') return { scope, left: ASTRA_ROUND };
  const list = scopesOf(scope.mode);
  const position = list.findIndex((item) => item.id === scope.id);
  const ordered = [...list.slice(position + 1), ...list.slice(0, position)];
  for (const item of ordered) {
    const left = item.words.filter((word) => !store.progress[String(word.id)]).length;
    // 没按整块学过就值得去学：哪怕词都被别的粒度学过了，也还有「整块刷一轮」可做
    if (left > 0 || !store.scopeTimes[item.key]) return { scope: item, left, total: item.words.length };
  }
  return null;
});
const nextScopeLabel = computed(() => {
  const target = nextScopeData.value;
  if (!target) return '全部学完';
  if (target.scope.mode === 'astra') return `再来一轮 · ${ASTRA_ROUND} 题`;
  const noun = SCOPE_MODES.find((item) => item.key === target.scope.mode)?.label ?? 'Lesson';
  // 词都学过、只是没按整块走过：说清楚是「整块」而不是「0 词」
  const amount = target.left > 0 ? `${target.left} 词` : `${target.total} 词 · 整块`;
  return `下一个 ${noun} · ${target.scope.label}（${amount}）`;
});
const title = computed(() => {
  if (mode.value === 'new') return currentScope.value?.name ?? '学新词';
  return { review: '今日复习', new: '', mistakes: '错题本专练' }[mode.value];
});
const subtitle = computed(() => (current.value ? hintText.value : '每一次完成都值得肯定'));
const emptyTitle = computed(() => {
  const astra = currentScope.value?.mode === 'astra';
  if (answeredCount.value || historicBest.value !== null) {
    return astra ? 'Astra 一整轮完成' : `本 ${scopeLabel.value} 学习完成`;
  }
  if (mode.value === 'review') return '今天没有到期词汇';
  if (mode.value === 'mistakes') return '错题本已经清空';
  return astra ? 'Astra 已学完一轮' : `本 ${scopeLabel.value} 已学完`;
});
const emptyCopy = computed(() => {
  if (answeredCount.value) return '答错的词已进入错题本，明天会再见到它们。';
  if (historicBest.value !== null) return '这是上一次完成时留下的记录，可以随时重学。';
  if (currentScope.value?.mode === 'astra') return '这一轮是全词乱序，随时可以从头再来。';
  return `可以继续学下一个 ${scopeLabel.value}，或进行一次快速测验。`;
});

/* ── 满分庆祝：100% 正确率 + 称号到「超级王牌」以上才触发 ── */
const celebrated = ref(false);
const praise = ref('');
const confetti = ref<Array<{ id: number; style: string }>>([]);
/** 答完最后一题时记一笔，等结算页真正出现再放动画，避免和翻页撞在一起 */
const pendingCelebration = ref(false);
const PRAISES = [
  '零失误，而且快。这不是运气，是熟练度。',
  '每一个词都答在点上，这一课被你彻底吃透了。',
  '这个速度和准确率，考场上的你会感谢现在的你。',
  '从第一个词稳到最后一个，节奏完全在你手里。',
  '满分不是偶然，是前面每一遍都认真过的结果。'
];
const CONFETTI_COLORS = ['#FF6F9C', '#FFD51F', '#6FB9EE', '#9BDD8C', '#FFA23A', '#8A57F5', '#F2F6FF'];
const showCelebration = computed(() =>
  mode.value === 'new'
  && answeredCount.value >= RANK_MIN_ANSWERS
  && correctCount.value === answeredCount.value
  && !!pace.value
  && isCelebrationRank(pace.value.title)
);
const celebrateHeadline = computed(() => (pace.value ? `满分 · ${pace.value.title}` : '零失误通关'));
/** 撒纸屑：位置/延迟/时长都随机，每一片都走自己的轨迹，看着才不像一整块在动 */
function buildConfetti() {
  return Array.from({ length: 26 }, (_, position) => {
    const left = Math.round(Math.random() * 96) + 2;
    const delay = Math.round(Math.random() * 900);
    const duration = 1500 + Math.round(Math.random() * 900);
    const width = 8 + Math.round(Math.random() * 8);
    const height = Math.max(4, Math.round(width * 0.55));
    const drift = Math.round((Math.random() - 0.5) * 170);
    const color = CONFETTI_COLORS[position % CONFETTI_COLORS.length];
    return {
      id: position,
      style: `left:${left}%;width:${width}px;height:${height}px;background:${color};animation-delay:${delay}ms;animation-duration:${duration}ms;--drift:${drift}px`
    };
  });
}
function triggerCelebration() {
  if (celebrated.value) return;
  celebrated.value = true;
  praise.value = PRAISES[Math.floor(Math.random() * PRAISES.length)];
  confetti.value = buildConfetti();
  // 先给触感，再等渲染：真机上震动和第一片纸屑基本同时到达
  void playCelebrateFeedback();
}
watch(current, (word) => {
  if (word || !pendingCelebration.value) return;
  pendingCelebration.value = false;
  triggerCelebration();
});
/** 秒数对人类更友好：不足一分钟只报秒，超过就报 分:秒 */
function formatClock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}
function setupOptions() {
  const word = queue.value[index.value];
  questionKey.value += 1;
  // 随机档的方向在切题这一刻定下来，本题内不会自己变
  activeDirection.value = directionPlan.value[index.value] ?? resolveDirection(directionMode.value);
  // 没有题（已学完的课）就别开计时器：否则结算页的「用时」会随着停留一直涨
  questionStartedAt = word ? Date.now() : 0;
  clock.value = questionStartedAt || clock.value;
  clearTimers();
  pickedId.value = null;
  locked.value = false;
  settled.value = false;
  powder.value = false;
  feedback.value = '';
  note.value = '';
  noteTone.value = '';
  guessUsed.value = false;
  options.value = word ? shuffle([word, ...distractors(word, 4)]) : [];
}
function clearTimers() {
  if (settleTimer) clearTimeout(settleTimer);
  if (collapseTimer) clearTimeout(collapseTimer);
  if (autoNextTimer) clearTimeout(autoNextTimer);
  settleTimer = null;
  collapseTimer = null;
  autoNextTimer = null;
  autoPending.value = false;
}
/**
 * 一个块这一轮要出的词。
 *
 * 三种情况严格分开，这是「Lesson 与 Unit 互不代劳」的关键：
 * - 还有没学过的词 → 接着学剩下的（中途退出再回来不会从头再来）
 * - 词都学过了、这一块自己也学过一轮 → 没有题，进结算页
 * - 词都学过了、但这一块从没按整块走过 → 整块重刷一遍（Unit 里 4 课都学完时走这条）
 */
function scopePool(scope: ScopeDef | null): WordItem[] {
  if (!scope) return [];
  if (scope.mode === 'astra') return shuffle(scope.words).slice(0, ASTRA_ROUND);
  // 用户刚点过「重置」：取走标记，用整块词从第 1 题重来一轮。
  // 这条要排在「只挑没学过的词」前面，否则学到一半的块只会继续出剩下半截，重置看着没反应。
  if (store.consumeRestartScope(scope.key)) return scope.words;
  const left = scope.words.filter((word) => !store.progress[String(word.id)]);
  if (left.length) return left;
  if (store.scopeTimes[scope.key]) return [];
  return scope.words;
}
function buildQueue() {
  if (!store.loaded) store.init();
  const pool =
    mode.value === 'review'
      ? store.dueWords()
      : mode.value === 'mistakes'
        ? store.mistakeWords()
        : scopePool(currentScope.value);
  queue.value = shuffle(pool);
  directionPlan.value = planDirections(directionMode.value, queue.value.length);
  index.value = 0;
  celebrated.value = false;
  praise.value = '';
  confetti.value = [];
  pendingCelebration.value = false;
  // 课程已经学完、这一轮没有题时，用上次完成记录还原同一张结算卡
  const saved = mode.value === 'new' && pool.length === 0 && currentScope.value
    ? store.scopeTimes[currentScope.value.key]
    : undefined;
  const round = saved?.round;
  historicBest.value = saved && !round ? saved.avg : null;
  answeredCount.value = round?.answered ?? 0;
  correctCount.value = round?.correct ?? 0;
  correctMs.value = round ? round.avg * 1000 * round.correct : 0;
  elapsedMs.value = round?.elapsedMs ?? 0;
  questionStartedAt = 0;
  setupOptions();
}
/** 切换块的统一入口：把课选择器也带上，切块后标题和 chips 不会对不上 */
function applyScope(scope: ScopeDef | null) {
  currentScope.value = scope;
  if (scope && scope.mode === 'lesson') {
    selectedLesson.value = scope.id;
    selectedUnit.value = Math.ceil(scope.id / 4);
  }
  buildQueue();
}
function selectUnit(unit: number) {
  pickerLocked.value = false;
  selectedUnit.value = unit;
  const list = store.lessonsOfUnit(unit);
  const first = list.find((lesson) => store.lessonStatus(lesson).left > 0) ?? list[0];
  applyScope(scopeOf('lesson', first));
}
function selectLesson(lesson: number) {
  pickerLocked.value = false;
  pickerOpen.value = false;
  applyScope(scopeOf('lesson', lesson));
}
function selectScope(scope: ScopeDef) {
  pickerLocked.value = false;
  pickerOpen.value = false;
  applyScope(scope);
}
function askSwitchScope() {
  const label = scopeLabel.value;
  dialog.value = {
    kind: 'switch',
    title: `切换 ${label}`,
    content: `当前 ${label} 已开始学习，切换不会丢失已学进度。确定要换吗？`,
    confirmText: '切换',
    cancelText: '留在这里',
    danger: false
  };
}
function askResetScope() {
  const scope = currentScope.value;
  if (!scope) return;
  dialog.value = {
    kind: 'reset',
    title: `重学这个 ${scopeLabel.value}`,
    content: `这块从头再来：里面的词会变回「没学过」，进度归零，可以重新学一遍；各课已经拿到的分数和称号保留，其他范围和错题本也不受影响。`,
    confirmText: '清空记录',
    cancelText: '取消',
    danger: true
  };
}
/** 结算页「换一个 Lesson / Unit…」：把上面的选择器展开并滚回顶部 */
function openScopePicker() {
  if (!canSwitchScope.value) return;
  pickerLocked.value = false;
  pickerOpen.value = true;
  scrollPageTop(220);
}
function confirmDialog() {
  const kind = dialog.value?.kind;
  dialog.value = null;
  if (kind === 'switch') {
    pickerLocked.value = false;
    pickerOpen.value = true;
  } else if (kind === 'reset') {
    const scope = currentScope.value;
    if (!scope) return;
    const cleared = store.resetScope(scope.key, scope.words.map((word) => word.id));
    pickerLocked.value = true;
    pickerOpen.value = false;
    buildQueue();
    scrollPageTop(200);
    uni.showToast({ title: cleared ? `已重置，从头再来` : '没有可重置的记录', icon: 'none' });
  }
}
function goNextScope() {
  const target = nextScopeData.value;
  if (!target) {
    uni.showToast({ title: '全部学完了', icon: 'none' });
    return;
  }
  pickerOpen.value = false;
  pickerLocked.value = false;
  applyScope(target.scope);
}
function playWord() {
  if (current.value) speak(current.value.word).catch(() => undefined);
}
function optionClass(option: WordItem) {
  if (!locked.value) return '';
  if (option.id === current.value?.id) return 'is-correct';
  if (powder.value) return 'is-powder';
  if (option.id === pickedId.value) return 'is-wrong';
  return 'is-dim';
}
function goBack() {
  uni.navigateBack({ delta: 1, fail: () => uni.reLaunch({ url: '/pages/index/index' }) });
}
/** 结算页直接去错题本专练；返回时还停在结算页，不会丢这一轮的数字 */
function goMistakes() {
  uni.navigateTo({ url: '/pages/study/study?mode=mistakes' });
}
function answer(option: WordItem) {
  const word = current.value;
  if (!word || locked.value) return;
  locked.value = true;
  let spent = 0;
  if (questionStartedAt) {
    spent = Math.min(Date.now() - questionStartedAt, QUESTION_CAP_MS);
    elapsedMs.value += spent;
    questionStartedAt = 0;
  }
  pickedId.value = option.id;
  const correct = option.id === word.id;
  answeredCount.value += 1;
  if (correct) {
    correctCount.value += 1;
    // 只有答对才进均速样本：答错那次的时间既不吞掉，也不拉低均值
    correctMs.value += spent;
  }
  feedback.value = correct ? 'feedback-correct' : 'feedback-wrong';
  feedbackKey.value += 1;
  note.value = correct ? '掌握 +1' : `正确答案是「${answerOf(word, activeDirection.value)}」`;
  noteTone.value = correct ? 'correct' : 'wrong';
  store.gradeWord(word.id, correct ? 'known' : 'forgot');
  if (correct) {
    // 先给触感再改状态：原生 bridge 只是一次 postMessage，开销可忽略；
    // 放在渲染前，触感才和爆散同时到达（之前延后 30ms 反而错位）
    void playCorrectFeedback();
    void playCorrectSound();
    powder.value = true;
    settleTimer = setTimeout(() => { settled.value = true; }, 320);
    collapseTimer = setTimeout(() => {
      options.value = options.value.filter((item) => item.id === word.id);
    }, 760);
    // 最后一题不自动翻：直接跳到结算页会来不及看，留给用户点「完成本课」
    if (settings.autoNext && !isLast.value) {
      autoPending.value = true;
      autoNextTimer = setTimeout(() => {
        autoNextTimer = null;
        autoPending.value = false;
        nextQuestion();
      }, AUTO_NEXT_MS);
    }
  } else {
    // 三下短促「哒-哒-哒」，和选项左右摇头的 320ms 动画对齐
    void playWrongFeedback();
    void playWrongSound();
    settled.value = true;
  }
  // 最后一题答完就结算，不依赖用户再点一次「完成本块」
  if (mode.value === 'new' && index.value >= queue.value.length - 1) finalizeScope();
}

/**
 * 一整块走完时记一次成绩，只有比历史最快还快才会覆盖。
 * 口径与页面上显示的「答对均速」保持一致——否则卡片上的秒数和答题时看到的对不上。
 * key 带粒度前缀，所以课 / Unit / Chunk / Epic / Astra 的成绩互不干扰。
 */
function finalizeScope() {
  const scope = currentScope.value;
  if (!scope) return;
  if (answeredCount.value < 3 || correctCount.value === 0) return;
  const avg = correctMs.value / correctCount.value / 1000;
  // 称号一起存下来：首页进度格里那个小圆点读的就是它，不用二次推算
  const rank = pace.value ? { title: pace.value.title, dot: pace.value.dot } : undefined;
  store.recordScopeTime(scope.key, avg, queue.value.length, {
    correct: correctCount.value,
    answered: answeredCount.value,
    avg: Math.round(avg * 1000) / 1000,
    elapsedMs: Math.round(elapsedMs.value),
    at: Date.now()
  }, rank);
  pendingCelebration.value = showCelebration.value;
}
/** 点提示行即取消这次自动翻页，停在本题看答案 */
function cancelAutoNext() {
  if (autoNextTimer) clearTimeout(autoNextTimer);
  autoNextTimer = null;
  autoPending.value = false;
}
function markGuess() {
  const word = current.value;
  if (!word || !canGuess.value) return;
  cancelAutoNext();
  guessUsed.value = true;
  store.guessWord(word.id);
  note.value = '已记入错题本，明天重来';
  noteTone.value = 'wrong';
  feedback.value = 'feedback-wrong';
  feedbackKey.value += 1;
  uni.showToast({ title: '已加入错题本', icon: 'none', duration: 1200 });
}
function nextQuestion() {
  if (!locked.value) return;
  cancelAutoNext();
  index.value += 1;
  setupOptions();
  // 翻页回到顶部：结算卡从第一条像素开始显示，普通题也不会被 .page 的残余 scrollTop 顶出去
  scrollPageTop(current.value ? 160 : 220);
}

onLoad((parameter) => {
  const requested = parameter?.mode;
  mode.value = requested === 'new' || requested === 'mistakes' ? requested : 'review';
  pickerLocked.value = false;
  pickerOpen.value = false;
  if (mode.value === 'new') {
    if (!store.loaded) store.init();
    let scope: ScopeDef | null = null;
    const rawScope = parameter?.scope;
    if (rawScope) {
      let key = String(rawScope);
      try {
        key = decodeURIComponent(key);
      } catch {
        // 已经是解码后的值，原样用
      }
      const parsed = parseScopeKey(key);
      if (parsed) scope = scopeOf(parsed.mode, parsed.id);
    }
    // 老链接只带 lesson / unit，按课兜底
    if (!scope) {
      const startLesson = parameter?.lesson
        ? Math.min(40, Math.max(1, Number(parameter.lesson) || 1))
        : parameter?.unit
          ? Math.min(40, Math.max(1, (Number(parameter.unit) - 1) * 4 + 1))
          : store.nextLessonToStudy();
      scope = scopeOf('lesson', startLesson);
    }
    currentScope.value = scope;
    if (scope && scope.mode === 'lesson') {
      selectedLesson.value = scope.id;
      selectedUnit.value = Math.ceil(scope.id / 4);
    }
  }
  buildQueue();
  clock.value = Date.now();
  // 只在"正在作答"时刷新：锁定后数字本来就不动，没必要让整个学习页每秒重渲染一次
  tickTimer = setInterval(() => {
    if (locked.value) return;
    clock.value = Date.now();
  }, 1000);
});
// 切后台时把当前题的起点顺延，回来的时间不算进这一题
onHide(() => {
  hiddenAt = Date.now();
  // 后台不该替用户翻页，回来保持原题
  cancelAutoNext();
});
onShow(() => {
  if (hiddenAt) {
    if (questionStartedAt) questionStartedAt += Date.now() - hiddenAt;
    hiddenAt = 0;
  }
  clock.value = Date.now();
});
onUnload(() => {
  clearTimers();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  stop();
});
</script>

<style scoped>
/* 正误不只染题卡：固定定位的透明层把光圈推到整个屏幕四边，不拦截任何点击 */
.screen-feedback { position: fixed; inset: 0; z-index: 60; pointer-events: none; border: 6rpx solid transparent; opacity: 0; }
.screen-feedback.feedback-correct { border-color: rgba(67, 210, 157, .74); box-shadow: inset 0 0 76rpx 22rpx rgba(48, 196, 139, .42); background: radial-gradient(ellipse at center, transparent 52%, rgba(48, 196, 139, .18) 100%); animation: screen-correct-flash 360ms ease-out both; }
.screen-feedback.feedback-wrong { border-color: rgba(255, 100, 128, .76); box-shadow: inset 0 0 82rpx 24rpx rgba(239, 83, 111, .44); background: radial-gradient(ellipse at center, transparent 50%, rgba(239, 83, 111, .20) 100%); animation: screen-wrong-flash 480ms ease-out both; }
@keyframes screen-correct-flash { 0% { opacity: 0; } 22% { opacity: 1; } 58% { opacity: .56; } 100% { opacity: 0; } }
@keyframes screen-wrong-flash { 0% { opacity: 0; } 14% { opacity: 1; } 30% { opacity: .34; } 46% { opacity: .9; } 100% { opacity: 0; } }
.study-heading { flex: 1; min-width: 0; margin-left: 22rpx; }
.study-heading .top-title { font-size: 30rpx; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.head-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 10rpx; }
.swap-button { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 6rpx; height: 52rpx; margin: 0; padding: 0 18rpx; border-radius: 16rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--text-secondary); font-size: 21rpx; line-height: 52rpx; }
.reset-button { color: var(--danger); border-color: rgba(220, 113, 135, .38); }
/* ── 方向拨杆：和「背诵方向」一起放在标题下面那条工具行里 ── */
.study-toolbar { display: flex; align-items: center; gap: 14rpx; margin: -10rpx 0 20rpx; }
.toolbar-label { color: var(--text-secondary); font-size: 21rpx; font-weight: 600; letter-spacing: 1rpx; white-space: nowrap; }
/* 三档：英→中 / 中→英 / 随机。滑块固定占三分之一，靠 translateX 走过去 */
.dir-switch { position: relative; display: flex; flex: 0 0 auto; align-items: center; width: 300rpx; height: 54rpx; margin: 0; padding: 4rpx; border: 1rpx solid var(--line); border-radius: 999rpx; background: var(--surface-soft); box-shadow: inset 0 2rpx 6rpx var(--shadow-dark); }
.dir-thumb { position: absolute; top: 4rpx; bottom: 4rpx; left: 4rpx; width: calc((100% - 8rpx) / 3); border-radius: 999rpx; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 4rpx 5rpx 12rpx var(--glow); transition: transform 240ms cubic-bezier(.32, 1.16, .36, 1); }
.dir-switch.is-zh2en .dir-thumb { transform: translateX(100%); }
.dir-switch.is-random .dir-thumb { transform: translateX(200%); }
.dir-label { position: relative; z-index: 1; flex: 1 1 0; min-width: 0; height: 46rpx; margin: 0; padding: 0; border: 0; border-radius: 999rpx; background: transparent; text-align: center; color: var(--text-secondary); font-size: 19rpx; font-weight: 700; letter-spacing: 0; line-height: 46rpx; transition: color 180ms ease; }
.dir-label::after { border: 0; }
.dir-label.on { color: var(--accent-contrast); text-shadow: 0 1rpx 2rpx rgba(10, 16, 30, .22); }
/* 随机档在工具行上多挂一个小标：让人一眼知道这题是在看英文还是看中文 */
.dir-tag { flex: 0 0 auto; padding: 5rpx 12rpx; border-radius: 12rpx; background: var(--surface-soft); color: var(--accent-ink); font-size: 18rpx; font-weight: 650; white-space: nowrap; }
.session-count { margin-left: auto; padding: 6rpx 16rpx; border-radius: 14rpx; background: var(--surface-soft); color: var(--text-secondary); font-size: 24rpx; font-variant-numeric: tabular-nums; }
.unit-scroll { width: 100%; margin-bottom: 24rpx; white-space: nowrap; }
.unit-list { display: inline-flex; gap: 14rpx; padding: 3rpx 3rpx 15rpx; }
.unit-chip { min-width: 126rpx; height: 62rpx; line-height: 62rpx; padding: 0 18rpx; border-radius: 20rpx; background: var(--surface); color: var(--text-secondary); font-size: 23rpx; border: 1rpx solid var(--line); }
.unit-chip.active { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); box-shadow: 5rpx 7rpx 18rpx var(--glow); }
.lesson-scroll { margin-top: -8rpx; }
.lesson-scroll .unit-list { gap: 10rpx; }
.lesson-chip { display: inline-flex; align-items: center; justify-content: center; gap: 6rpx; min-width: 156rpx; height: 56rpx; line-height: 56rpx; padding: 0 10rpx; font-size: 21rpx; }
.lesson-chip.done:not(.active) { opacity: .58; }
.chip-left { min-width: 30rpx; padding: 0 6rpx; border-radius: 12rpx; background: rgba(127, 127, 150, .18); color: inherit; font-size: 18rpx; line-height: 30rpx; text-align: center; }
.lesson-chip.active .chip-left { background: rgba(18, 22, 34, .28); }
/* 手机上两列容器只是「透明壳子」：display:contents 让里面的卡片直接排成一列，
   顺序由每个孩子的 order 决定；平板上同一个结构再变回真两列 —— 模板只写一次 */
.stage-cols { display: flex; flex-direction: column; }
.stage-col { display: contents; }
.stage-col-prompt .prompt { order: 1; }
.stage-col-answer .option-list { order: 2; }
.stage-col-answer .answer-note { order: 3; }
.stage-col-answer .auto-next, .stage-col-answer .action-row { order: 4; }
.stage-col-prompt .pace-card { order: 5; }
.stage-progress { height: 6rpx; margin: 0 10rpx 24rpx; border-radius: 8rpx; background: var(--surface-soft); overflow: hidden; }
.stage-progress > view { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); transition: width 300ms ease; }
.prompt {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 46rpx 30rpx 40rpx;
  text-align: center;
  border: 1rpx solid transparent;
  background:
    linear-gradient(158deg, var(--glass-tint) 0%, var(--glass-tint-2) 48%, var(--glass-tint) 100%) padding-box,
    linear-gradient(142deg, var(--glass-sheen), rgba(255, 255, 255, 0.08) 38%, var(--glass-refract) 72%, var(--glass-sheen)) border-box;
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  box-shadow: 0 30rpx 58rpx -26rpx var(--shadow-dark), inset 0 2rpx 0 var(--glass-sheen), inset 0 -28rpx 44rpx -32rpx var(--glass-sheen);
  transition: box-shadow 260ms ease;
  animation: prompt-fly-in 420ms cubic-bezier(.2, .86, .28, 1) both;
}
@keyframes prompt-fly-in {
  0% { opacity: 0; transform: translate3d(0, 38rpx, 0) scale(.972); }
  65% { opacity: 1; transform: translate3d(0, -4rpx, 0) scale(1.004); }
  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
.prompt::before {
  content: '';
  position: absolute;
  inset: -65% -25% auto -25%;
  height: 150%;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(42% 40% at 24% 30%, var(--glass-sheen), transparent 68%),
    radial-gradient(36% 34% at 78% 24%, var(--glass-refract), transparent 72%);
  opacity: .78;
  animation: liquid-drift 14s ease-in-out infinite alternate;
}
.prompt::after {
  content: '';
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: -70%;
  height: 110%;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(50% 50% at 50% 50%, var(--glass-refract), transparent 72%);
  filter: blur(16rpx);
  opacity: .55;
}
@keyframes liquid-drift {
  from { transform: translate3d(-2%, -1%, 0) scale(1.02); }
  to { transform: translate3d(2%, 3%, 0) scale(1.08); }
}
.prompt.feedback-correct { box-shadow: 0 0 0 2rpx rgba(67, 182, 141, .55), 0 14rpx 34rpx rgba(67, 182, 141, .18); }
.prompt.feedback-wrong { box-shadow: 0 0 0 2rpx rgba(220, 113, 135, .55), 0 14rpx 34rpx rgba(220, 113, 135, .16); }
.unit-label { position: absolute; top: 26rpx; color: var(--text-secondary); font-size: 20rpx; font-weight: 700; letter-spacing: 3rpx; }
.word { max-width: 100%; margin-top: 12rpx; overflow-wrap: anywhere; font-size: 70rpx; font-weight: 700; letter-spacing: -2rpx; }
/* 中→英模式大字是中文释义，可能是「先见之明；深谋远虑」这种长句，得降字号换行 */
.word.is-cn { font-size: 46rpx; line-height: 1.45; font-weight: 720; letter-spacing: 0; }
.word.is-long { font-size: 56rpx; letter-spacing: -1rpx; }
.word.is-xlong { font-size: 44rpx; letter-spacing: -1rpx; }
.prompt.is-zh2en { min-height: 300rpx; }
.reveal-row { display: inline-flex; align-items: center; gap: 10rpx; max-width: 100%; margin-top: 22rpx; padding: 10rpx 22rpx; border-radius: 999rpx; border: 1rpx dashed var(--line); background: var(--surface-soft); color: var(--accent-ink); }
.reveal-word { font-size: 30rpx; font-weight: 700; letter-spacing: -.5rpx; }
.reveal-phonetic { color: var(--text-secondary); font-size: 21rpx; }
.sound-button { display: flex; align-items: center; gap: 12rpx; margin-top: 24rpx; padding: 13rpx 26rpx; border-radius: 30rpx; background: var(--surface-soft); color: var(--accent-ink); font-size: 25rpx; border: 1rpx solid var(--line); }
.prompt-hint { margin-top: 26rpx; color: var(--text-secondary); font-size: 21rpx; letter-spacing: 1rpx; }
.option-list { display: flex; flex-direction: column; gap: 22rpx; margin-top: 30rpx; transition: gap 300ms ease 380ms; }
.option-list.is-powdered { gap: 0; }
.option-list.is-locked .option { pointer-events: none; }
.option {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  width: 100%;
  min-height: 134rpx;
  display: flex;
  align-items: center;
  padding: 22rpx 28rpx 22rpx 22rpx;
  border-radius: 24rpx;
  border: 1rpx solid transparent;
  background:
    linear-gradient(160deg, var(--glass-tint) 0%, var(--glass-tint-2) 58%, var(--glass-tint) 100%) padding-box,
    linear-gradient(135deg, var(--glass-sheen), rgba(255, 255, 255, 0.06) 42%, var(--glass-refract) 78%) border-box;
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  box-shadow: 0 16rpx 34rpx -22rpx var(--shadow-dark), inset 0 2rpx 0 var(--glass-sheen);
  color: var(--text);
  text-align: left;
  transition: transform 120ms ease, box-shadow 240ms ease, background 240ms ease, opacity 240ms ease;
  animation: option-fly-in 380ms cubic-bezier(.2, .82, .26, 1) both;
  animation-delay: var(--fly-delay, 90ms);
}
@keyframes option-fly-in {
  0% { opacity: 0; transform: translate3d(34rpx, 22rpx, 0) scale(.975); }
  70% { opacity: 1; transform: translate3d(-3rpx, 0, 0) scale(1.002); }
  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
.option::before {
  content: '';
  position: absolute;
  inset: -55% -20% auto -20%;
  height: 140%;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(46% 42% at 20% 34%, var(--glass-sheen), transparent 70%);
  opacity: .55;
}
.option:active { transform: scale(.975); }
.option.is-correct {
  color: var(--text);
  background: linear-gradient(135deg, rgba(67, 182, 141, .34), rgba(67, 182, 141, .16));
  border-color: rgba(67, 182, 141, .9);
  box-shadow: 0 0 0 1rpx rgba(67, 182, 141, .48), 0 12rpx 30rpx rgba(67, 182, 141, .28);
  animation: correct-pop 400ms cubic-bezier(.2, 1.2, .35, 1);
  animation-delay: 0ms;
}
.option.is-correct .option-index { color: var(--success); font-weight: 800; }
.option.is-correct .option-text { font-weight: 650; }
.option.is-powder {
  pointer-events: none;
  /* 动画期间卸掉实时毛玻璃，只合成 transform / opacity，避免五层高斯模糊一起重算 */
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  will-change: transform, opacity;
  animation: powder-burst 520ms cubic-bezier(.22, .72, .3, 1) forwards, powder-collapse 300ms cubic-bezier(.4, 0, .2, 1) 380ms forwards;
  animation-delay: 0ms, 380ms;
}
.option.is-powder::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 9rpx;
  height: 9rpx;
  border-radius: 50%;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  box-shadow:
    -150rpx -14rpx 0 -2rpx currentColor,
    -86rpx -30rpx 0 0 currentColor,
    -40rpx -22rpx 0 -1rpx currentColor,
    18rpx -34rpx 0 0 currentColor,
    72rpx -26rpx 0 -2rpx currentColor,
    132rpx -8rpx 0 0 currentColor,
    156rpx 16rpx 0 -1rpx currentColor,
    96rpx 24rpx 0 0 currentColor,
    34rpx 26rpx 0 -2rpx currentColor,
    -22rpx 20rpx 0 0 currentColor,
    -82rpx 26rpx 0 -1rpx currentColor,
    -140rpx 14rpx 0 0 currentColor,
    -58rpx 2rpx 0 -2rpx currentColor,
    8rpx 4rpx 0 -1rpx currentColor,
    66rpx 6rpx 0 0 currentColor,
    118rpx -30rpx 0 -2rpx currentColor;
  animation: dust-fly 620ms cubic-bezier(.2, .7, .4, 1) forwards;
}
@keyframes correct-pop {
  0% { transform: scale(1); }
  30% { transform: scale(1.03); }
  100% { transform: scale(1); }
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
.option.is-wrong { background: linear-gradient(135deg, rgba(220, 113, 135, .22), rgba(220, 113, 135, .10)); border-color: rgba(220, 113, 135, .78); box-shadow: 0 0 0 1rpx rgba(220, 113, 135, .40), 0 12rpx 30rpx rgba(220, 113, 135, .26); animation: option-shake 320ms ease; animation-delay: 0ms; }
.option.is-dim { opacity: .48; animation-delay: 0ms; }
.option-index { flex: 0 0 auto; width: 50rpx; height: 50rpx; margin-right: 20rpx; border-radius: 16rpx; background: var(--surface-strong); box-shadow: 1rpx 2rpx 5rpx var(--shadow-dark); color: var(--text-secondary); text-align: center; line-height: 50rpx; font-size: 23rpx; font-weight: 800; }
.option-text { flex: 1; font-size: 28rpx; line-height: 1.45; }
/* 中→英模式的选项是英文单词，给一点字距更像一个词条 */
.option.is-en .option-text { font-size: 32rpx; font-weight: 640; letter-spacing: .4rpx; }
.option-mark { flex: 0 0 auto; margin-left: 14rpx; color: var(--text-secondary); }
.answer-note { min-height: 52rpx; padding: 16rpx 6rpx 0; text-align: center; color: var(--text-secondary); font-size: 23rpx; opacity: 0; transition: opacity 200ms ease; }
.answer-note.note-correct { color: var(--success); opacity: 1; }
.answer-note.note-wrong { color: var(--danger); opacity: 1; }
.pace-card { display: flex; align-items: center; gap: 22rpx; margin-top: 32rpx; padding: 22rpx 24rpx 20rpx; border-radius: 24rpx; border: 1rpx solid var(--line); background: var(--surface-strong); box-shadow: 0 10rpx 26rpx var(--shadow-dark); }
.pace-cell { display: flex; flex-direction: column; gap: 6rpx; min-width: 0; }
.pace-label { color: var(--text-secondary); font-size: 20rpx; font-weight: 600; letter-spacing: 1.5rpx; }
.pace-value { color: var(--text); font-variant-numeric: tabular-nums; font-size: 38rpx; font-weight: 760; line-height: 1.05; letter-spacing: -.5rpx; white-space: nowrap; }
.pace-value-line { display: flex; align-items: baseline; }
.pace-unit { margin-left: 2rpx; color: var(--text-secondary); font-size: 21rpx; font-weight: 650; }
.pace-divider { align-self: stretch; width: 1rpx; margin: 4rpx 6rpx; background: var(--line); }
/* 底色由 pace.ts 的十六档配色给到 inline style，这里只管形状和光感 */
.pace-rank { flex: 0 0 auto; margin-left: auto; padding: 10rpx 20rpx 9rpx; border-radius: 999rpx; font-size: 24rpx; font-weight: 760; letter-spacing: .5rpx; white-space: nowrap; box-shadow: 0 6rpx 16rpx rgba(12, 18, 32, .18), inset 0 1rpx 0 rgba(255, 255, 255, .28); text-shadow: 0 1rpx 1rpx rgba(0, 0, 0, .10); }
.empty-rank { display: inline-block; margin: 22rpx 0 0; }
.rank-note { margin-top: 12rpx; color: var(--text-secondary); font-size: 19rpx; line-height: 1.5; }
.auto-next { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12rpx; min-height: 88rpx; margin-top: 6rpx; }
.auto-next-track { width: 100%; height: 4rpx; border-radius: 999rpx; background: var(--line); overflow: hidden; }
.auto-next-fill { width: 0; height: 100%; border-radius: 999rpx; background: linear-gradient(90deg, var(--accent), var(--accent-2)); animation: auto-next-fill 300ms linear forwards; }
.auto-next-copy { color: var(--text-secondary); font-size: 20rpx; letter-spacing: 1rpx; }
@keyframes auto-next-fill { from { width: 0; } to { width: 100%; } }
.action-row { display: flex; gap: 14rpx; margin-top: 6rpx; }
.action-row button { margin: 0; }
.guess-button { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; min-height: 88rpx; padding: 0 24rpx; border-radius: 22rpx; border: 1rpx dashed rgba(220, 113, 135, .55); background: var(--surface-soft); color: var(--danger); font-size: 23rpx; font-weight: 650; }
.next-button { display: flex; flex: 1; align-items: center; justify-content: center; min-height: 88rpx; border: 0; border-radius: 22rpx; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); font-size: 27rpx; font-weight: 700; box-shadow: 8rpx 12rpx 24rpx var(--glow); }
.next-button:active, .guess-button:active { transform: scale(.98); }
/* 满分庆祝：纸屑只在这一层里飞，不拦截任何点击 */
.empty-state.is-celebrating { position: relative; overflow: hidden; border-color: rgba(255, 190, 92, .38); box-shadow: 0 26rpx 60rpx -28rpx var(--shadow-dark), 0 0 0 1rpx rgba(255, 190, 92, .22); }
.celebrate-layer { position: fixed; inset: 0; z-index: 40; pointer-events: none; overflow: hidden; }
.confetti { position: absolute; top: -8%; border-radius: 2rpx; opacity: 0; animation-name: confetti-fall; animation-timing-function: cubic-bezier(.24, .6, .4, 1); animation-fill-mode: forwards; }
@keyframes confetti-fall {
  0% { opacity: 0; transform: translate3d(0, -10vh, 0) rotate(0deg); }
  12% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--drift, 0px), 104vh, 0) rotate(560deg); }
}
.celebrate-badge { display: inline-flex; align-items: center; gap: 8rpx; margin-bottom: 16rpx; padding: 8rpx 20rpx; border-radius: 999rpx; background: linear-gradient(135deg, rgba(255, 175, 64, .92), rgba(255, 118, 148, .92)); color: #3A1200; font-size: 18rpx; font-weight: 800; letter-spacing: 3rpx; box-shadow: 0 8rpx 20rpx rgba(255, 140, 70, .28); }
.celebrate-title { font-size: 50rpx; font-weight: 760; letter-spacing: .5rpx; animation: celebrate-pop 520ms cubic-bezier(.2, 1.3, .36, 1) both; }
.celebrate-copy { margin: 16rpx auto 6rpx; max-width: 88%; color: var(--text-secondary); font-size: 24rpx; line-height: 1.65; }
@keyframes celebrate-pop {
  0% { opacity: 0; transform: scale(.86) translateY(10rpx); }
  60% { opacity: 1; transform: scale(1.03) translateY(0); }
  100% { opacity: 1; transform: scale(1); }
}
.empty-state { margin-top: 12vh; padding: 50rpx 34rpx; text-align: center; }
.empty-icon { width: 104rpx; height: 104rpx; display: flex; align-items: center; justify-content: center; margin: 0 auto 24rpx; border-radius: 34rpx; background: var(--surface-soft); color: var(--accent-ink); }
.empty-title { font-size: 37rpx; font-weight: 750; }
.empty-copy { margin: 18rpx auto; max-width: 88%; color: var(--text-secondary); font-size: 24rpx; line-height: 1.6; }
.result-stats { display: flex; align-items: stretch; margin-top: 20rpx; }
.result-stat { position: relative; flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
.result-stat + .result-stat::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10rpx;
  bottom: 10rpx;
  width: 1rpx;
  background: var(--line);
}
.result-stat-value { font-size: 29rpx; font-weight: 750; color: var(--text); font-variant-numeric: tabular-nums; }
.result-stat-value.is-key { color: var(--accent-ink); font-size: 33rpx; }
.result-stat-unit { margin-left: 2rpx; font-size: 19rpx; font-weight: 650; color: var(--text-secondary); }
.result-stat-label { font-size: 18rpx; letter-spacing: .5rpx; color: var(--text-secondary); }
.result-score { margin-top: 24rpx; font-size: 82rpx; color: var(--accent-ink); }
.result-total { font-size: 36rpx; color: var(--text-secondary); }
.empty-action { width: 100%; margin-top: 20rpx; }
@keyframes option-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-9rpx); }
  60% { transform: translateX(8rpx); }
  85% { transform: translateX(-4rpx); }
}

.mistake-action { display: flex; align-items: center; justify-content: center; gap: 10rpx; color: var(--danger); border-color: rgba(220, 113, 135, .42); }

/* ── 手机：题卡留在上半屏，选项整块沉到下半屏，拇指不用往上够 ── */
@media (max-width: 719px) {
  /* 顶栏 + 工具行 + 方向行大约占 400rpx，这里必须减掉它，否则整块会超出视口、第 5 个选项被裁 */
  .study-stage { display: flex; flex-direction: column; min-height: calc(100vh - 418rpx); }
  .stage-cols { flex: 1; }
  /* 撑开题卡与选项之间那段空白，选项自然落到屏幕下半部分 */
  .stage-col-prompt .prompt { margin-bottom: auto; }
  .stage-col-answer .option-list { margin-top: 28rpx; }
}

/* 矮屏（老机型 / 分屏）：题卡和选项一起收紧一点，5 个选项不用滚动也能全看见 */
@media (max-width: 719px) and (max-height: 760px) {
  .study-stage { min-height: calc(100vh - 372rpx); }
  .prompt { padding: 32rpx 26rpx 28rpx; }
  .word { font-size: 58rpx; }
  .word.is-cn { font-size: 40rpx; }
  .word.is-long { font-size: 48rpx; }
  .word.is-xlong { font-size: 38rpx; }
  .sound-button { margin-top: 16rpx; padding: 10rpx 22rpx; font-size: 22rpx; }
  .prompt-hint { margin-top: 16rpx; }
  .option-list { gap: 14rpx; margin-top: 18rpx; }
  .option { min-height: 106rpx; padding: 16rpx 24rpx 16rpx 18rpx; border-radius: 20rpx; }
  .option-index { width: 44rpx; height: 44rpx; margin-right: 16rpx; line-height: 44rpx; font-size: 21rpx; }
  .option-text { font-size: 26rpx; }
  .option.is-en .option-text { font-size: 29rpx; }
  .pace-card { margin-top: 18rpx; padding: 16rpx 20rpx 14rpx; }
  .pace-value { font-size: 32rpx; }
}

/* ── 平板 / 宽窗口（≥720px）：题目与选项并排，左边看题右边选，不用来回滚 ── */
html.is-wide .study-heading { margin-left: 28rpx; }
html.is-wide .study-heading .top-title { font-size: 38rpx; }
html.is-wide .top-subtitle { font-size: 25rpx; }
html.is-wide .study-toolbar { margin-bottom: 26rpx; }
/* 内容比屏幕矮时用 margin:auto 把两栏垂直居中；内容高时 auto 自动变 0，
   不会把顶部顶出屏幕——比 align-content:center 安全 */
html.is-wide .study-stage { display: flex; flex-direction: column; min-height: calc(100vh - 320rpx); }
html.is-wide .stage-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.04fr);
  gap: 34rpx;
  align-items: stretch;
  margin: auto 0;
}
html.is-wide .stage-col { display: flex; flex-direction: column; }
/* 左卡跟右列等高，像一张竖着的抽认卡，不会一边长一边短 */
html.is-wide .stage-col-prompt .prompt { flex: 1; }
html.is-wide .prompt { padding: 70rpx 38rpx 58rpx; min-height: 380rpx; }
html.is-wide .word { font-size: 96rpx; }
html.is-wide .word.is-cn { font-size: 58rpx; }
html.is-wide .word.is-long { font-size: 70rpx; }
html.is-wide .word.is-xlong { font-size: 54rpx; }
html.is-wide .prompt.is-zh2en { min-height: 340rpx; }
html.is-wide .option-list { margin-top: 0; gap: 24rpx; }
html.is-wide .option { min-height: 142rpx; padding: 22rpx 30rpx 22rpx 24rpx; }
html.is-wide .option-text { font-size: 32rpx; }
html.is-wide .option.is-en .option-text { font-size: 36rpx; }
/* 平板上横滑列表看着像出了 bug，宽度够就直接换行铺开；手机横屏不加这条，
   否则一排 chip 占掉半屏。uni 的 button 自带左右 auto margin，不压掉会居中 */
html.is-tablet.is-wide .unit-scroll { white-space: normal; }
html.is-tablet.is-wide .unit-list { display: flex; flex-wrap: wrap; justify-content: flex-start; }
html.is-tablet.is-wide .unit-chip { margin: 0; flex: 0 0 auto; }
html.is-wide .answer-note { text-align: left; padding: 14rpx 6rpx 0; }
html.is-wide .action-row { margin-top: 10rpx; }
html.is-wide .action-row button { min-height: 84rpx; }
html.is-wide .pace-card { margin-top: 28rpx; padding: 26rpx 28rpx 24rpx; }
html.is-wide .pace-value { font-size: 46rpx; }
html.is-wide .empty-state { margin-top: 8vh; max-width: 760px; margin-left: auto; margin-right: auto; }
/* 窄高度（横屏平板 / 手机横屏）：选项再压一点，免得要滚动才能看到「下一题」 */
@media (max-height: 820px) {
  html.is-wide .study-stage { min-height: calc(100vh - 300rpx); }
  html.is-wide .prompt { min-height: 0; padding: 44rpx 32rpx 38rpx; }
  html.is-wide .word { font-size: 68rpx; }
  html.is-wide .word.is-cn { font-size: 46rpx; }
  html.is-wide .option { min-height: 100rpx; }
  html.is-wide .option-list { gap: 16rpx; }
}
@media (prefers-reduced-motion: reduce) {
  .screen-feedback { display: none; }
  .prompt, .option { animation: none; }
  .option.is-powder { opacity: 0; }
  .confetti { display: none; }
  .celebrate-title { animation: none; }
}
</style>
