<template>
  <view class="words-panel">
    <view class="page-content">
      <view class="top-bar">
        <view>
          <view class="brand serif">Vast<span>·</span>Galaxy</view>
          <view class="top-subtitle">{{ dateLabel }}<text v-if="!lab.ai.network"> · 离线专注模式</text></view>
        </view>
        <view class="top-actions">
          <button class="icon-button" aria-label="设置" @click="openSettings">
            <AppIcon name="gear" :size="24" />
          </button>
        </view>
      </view>

      <view class="hero glass-card fade-up home-hero">
        <view class="eyebrow">YOUR QUIET MOMENT</view>
        <view class="hero-title">{{ tagline }}</view>
        <view class="hero-bottom">
          <text>{{ store.mastered }} / {{ store.total }} 已掌握</text>
          <text>{{ store.masteredPercent }}%</text>
        </view>
        <view class="progress-track"><view class="progress-fill" :style="{ width: `${store.masteredPercent}%` }" /></view>
      </view>

      <view class="countdown glass-card home-count fade-up">
        <text class="countdown-text">距离考研还有</text>
        <text class="countdown-number serif">{{ daysLeft }}</text>
        <text class="countdown-text">天</text>
      </view>

      <view class="stats-grid home-stats">
        <view v-for="item in statCards" :key="item.label" class="stat-card glass-card fade-up">
          <view class="stat-value serif">{{ item.value }}</view>
          <view class="stat-label">{{ item.label }}</view>
          <view class="stat-dot" :style="{ background: item.color }" />
        </view>
      </view>

      <view class="home-block home-block-today">
      <view class="section-title">今日学习</view>
      <view class="entry-list">
        <button v-for="entry in entries" :key="entry.key" class="entry glass-card fade-up" @click="openEntry(entry.key)">
          <view class="entry-icon" :class="entry.key"><AppIcon :name="entry.icon" :size="26" /></view>
          <view class="entry-copy">
            <view class="entry-title">{{ entry.title }}</view>
            <view class="entry-description">{{ entry.description }}</view>
          </view>
          <view v-if="entry.badge !== undefined" class="entry-badge">{{ entry.badge }}</view>
          <text class="entry-arrow">›</text>
        </button>
      </view>
      </view>

      <view class="home-block home-block-board">
      <view class="section-title">背诵进度</view>
      <view class="lesson-board glass-card fade-up" :class="`theme-${mode}`">
        <view :key="mode" class="board-deco" aria-hidden="true">
          <view class="deco-orb" />
          <view class="deco-ring" />
          <view class="deco-lines" />
          <view class="deco-stars" />
          <view class="deco-bar" />
          <text class="deco-word">{{ decoWord }}</text>
        </view>
        <view class="board-inner">
        <view class="board-head">
          <view class="board-copy-wrap">
            <view v-if="decoKicker" class="board-kicker">{{ decoKicker }}</view>
            <view class="board-title">{{ boardTitle }}</view>
            <view class="board-copy">{{ boardCopy }}</view>
          </view>
          <view v-if="bestValue !== null" class="board-best">
            <view class="best-line">
              <text class="best-value">{{ bestValue }}</text>
              <text class="best-unit">s/题</text>
            </view>
            <text class="best-label">最快一项</text>
          </view>
        </view>

        <view class="mode-switch">
          <button
            v-for="item in SCOPE_MODES"
            :key="item.key"
            class="mode-chip"
            :class="{ active: mode === item.key }"
            @click="pickMode(item.key)"
          >{{ item.label }}</button>
        </view>

        <view class="board-grid" :class="`grid-${mode}`">
          <button
            v-for="cell in board"
            :key="cell.key"
            class="board-cell"
            :class="{ 'is-done': cell.done, 'is-inherited': cell.inherited, 'is-recommend': cell.recommend, 'is-active': !cell.done && !cell.inherited && !cell.recommend && cell.left < cell.total }"
            @click="openScope(cell.key)"
          >
            <text class="cell-no">{{ cell.label }}</text>
            <text v-if="cell.best" class="cell-meta">{{ formatBest(cell.best) }}s</text>
            <text v-else-if="mode === 'astra'" class="cell-meta">{{ cell.total }} 词</text>
            <!-- 学完但没留下成绩（比如重置过用时）时别再显示 73/73，那看着像没学 -->
            <text v-else-if="cell.done" class="cell-meta">完成</text>
            <!-- 先做大了 Unit、这批词被带会：绿框显示完成，但不显示分数、不写推荐 -->
            <text v-else-if="cell.inherited" class="cell-meta">完成</text>
            <!-- 词都学过了，但这一块自己还没按整块走过：推荐，而不冒充完成 -->
            <text v-else-if="cell.recommend" class="cell-meta">推荐学习</text>
            <text v-else-if="cell.left < cell.total" class="cell-meta">{{ cell.total - cell.left }}/{{ cell.total }}</text>
            <text v-else-if="mode === 'epic'" class="cell-meta">Unit {{ (cell.id - 1) * EPIC_UNITS + 1 }}–{{ cell.id * EPIC_UNITS }} · {{ cell.total }} 词</text>
            <!-- 拿到称号的块右上角点一颗小圆点：颜色就是那一档的代表色 -->
            <view v-if="cell.rank" class="rank-dot" :style="{ background: cell.rank.dot }" :aria-label="`称号：${cell.rank.title}`" />
          </button>
        </view>
        <view v-if="hasRanks" class="rank-legend">
          <view class="rank-legend-dot" />
          <text>小圆点是这个 {{ noun }} 拿到的称号，颜色对应档位；没学过的块不显示</text>
        </view>
        </view>
      </view>
      </view>

      <view class="home-block home-block-backup">
      <view class="section-title">数据保险箱</view>
      <view class="backup-card glass-card fade-up">
        <view class="backup-copy">
          <view class="backup-title">进度只属于你</view>
          <view class="top-subtitle">本地 JSON 备份，无需登录或联网</view>
        </view>
        <view class="backup-actions">
          <button class="secondary-button" @click="openExport"><AppIcon name="download" :size="20" />导出</button>
          <button class="secondary-button" @click="openImport"><AppIcon name="upload" :size="20" />导入</button>
        </view>
      </view>
      </view>
      <view class="footer-note fade-up">v{{ version }} · SM-2 本地记忆算法 · {{ store.total }} 考研核心词 · 数据留在本机</view>
    </view>

    <view v-if="showBackup" class="modal-mask" @click="showBackup = false">
      <view class="backup-modal glass-card" @click.stop>
        <view class="modal-head">
          <view class="top-title">{{ backupMode === 'export' ? '导出备份' : '导入备份' }}</view>
          <button class="icon-button" @click="showBackup = false"><AppIcon name="close" :size="21" /></button>
        </view>
        <view class="modal-tip">{{ backupMode === 'export' ? '已生成 JSON。可复制保存；H5 同时下载文件。' : '粘贴完整 JSON 后导入，现有学习数据将被替换。' }}</view>
        <textarea v-model="backupText" class="backup-textarea" :readonly="backupMode === 'export'" placeholder="粘贴 Vast Galaxy JSON 备份" maxlength="-1" />
        <button v-if="backupMode === 'export'" class="primary-button" @click="copyBackup">复制 JSON</button>
        <button v-else class="primary-button" :disabled="!backupText.trim()" @click="confirmImport">确认导入</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import { useProgressStore } from '@/stores/progress';
import { useSettingsStore } from '@/stores/settings';
import { useLabStore } from '@/stores/lab';
import { downloadBackup, importBackup } from '@/utils/storage';
import { EPIC_UNITS, SCOPE_MODES, bestOf, doneCount, scopesOf, type ScopeMode } from '@/utils/scopes';
import { APP_VERSION } from '@/config/app';

const store = useProgressStore();
const settings = useSettingsStore();
const lab = useLabStore();
lab.init();
const version = APP_VERSION;
const showBackup = ref(false);
const backupMode = ref<'export' | 'import'>('export');
const backupText = ref('');
/** 同一个卡片上切换背诵粒度，每个粒度的成绩各存各的 */
const MODE_KEY = 'ky_v1_scope_mode';
const mode = ref<ScopeMode>(readMode());
function readMode(): ScopeMode {
  try {
    const saved = String(uni.getStorageSync(MODE_KEY) || '');
    return SCOPE_MODES.some((item) => item.key === saved) ? (saved as ScopeMode) : 'lesson';
  } catch {
    return 'lesson';
  }
}
function pickMode(next: ScopeMode) {
  mode.value = next;
  try {
    uni.setStorageSync(MODE_KEY, next);
  } catch {
    // 存不了就只在本次生效，不影响主流程
  }
}
const board = computed(() => store.boardOf(mode.value));
const hasRanks = computed(() => board.value.some((cell) => !!cell.rank));
const noun = computed(() => SCOPE_MODES.find((item) => item.key === mode.value)?.label ?? 'Lesson');
/**
 * 首页那句大标题按天轮换：一天换一句，同一个句子不会连着看腻。
 * 用日期算索引而不是随机——同一天里反复进出首页，标题不会一直跳。
 */
const TAGLINES = [
  '让每一次回顾，都恰到好处。',
  '背过的词，终会在考场上回来找你。',
  '一天一点，词汇量自己会长大。',
  '不追速度，只追「确实记住了」。',
  '今天多背的十分钟，是十二月的一份底气。',
  '把陌生的词，一个个变成熟人。',
  '反复见面，才算真的认识。',
  '慢一点也没关系，别停下就行。'
];
const tagline = computed(() => {
  const day = Math.floor(parseDay(todayKey.value).getTime() / 86400000);
  return TAGLINES[Math.abs(day) % TAGLINES.length];
});
/** 卡片背景的巨字水印：epic / astra 用它撑出压迫感，其余模式留空 */
const DECO_WORD: Record<ScopeMode, string> = { lesson: '', unit: '', chunk: '', epic: 'EPIC', astra: 'ASTRA' };
const DECO_KICKER: Record<ScopeMode, string> = { lesson: '', unit: '', chunk: '', epic: 'EPIC TRIAL', astra: 'DEEP SPACE' };
const decoWord = computed(() => DECO_WORD[mode.value]);
const decoKicker = computed(() => DECO_KICKER[mode.value]);
const bestValue = computed(() => bestOf(board.value));
const boardTitle = computed(() => {
  if (mode.value === 'astra') {
    const cell = board.value[0];
    return cell ? `全词总挑战 · 已学 ${cell.total - cell.left} / ${cell.total} 词` : '全词总挑战';
  }
  const noun = SCOPE_MODES.find((item) => item.key === mode.value)?.noun ?? '';
  return `已学完 ${doneCount(board.value)} / ${scopesOf(mode.value).length} ${noun}`;
});
const boardCopy = computed(() => {
  switch (mode.value) {
    case 'unit':
      return '每 4 课为一个 Unit。绿色＝按整个 Unit 走过一轮（不是把 4 课学完就算）；4 课都学完的 Unit 会标「推荐学习」';
    case 'chunk':
      return '按词库顺序每 500 词分为一组：C1 = 第 1–500 词，C6 = 第 2501–2931 词；成绩与按课完全独立';
    case 'epic':
      return '按 Unit 前后对半分：E1 = Unit 1–5（第 1–20 课），E2 = Unit 6–10（第 21–40 课）；适合二轮快速过词';
    case 'astra':
      return '全部 2931 词随机乱序，每轮抽 100 题；走完一轮记一次成绩，可以反复刷';
    default:
      return '1–40 对应 Unit 1–10 各 4 课；绿框＝这一课走过一轮、或所属 Unit 先做完带会了它（不计分）；紫色＝学过一部分；4 课都学完但 Unit 没走过会标「推荐学习」';
  }
});

/** 老存档/导入的成绩可能带一长串小数：统一收成两位，去掉末尾的 0 */
function formatBest(value: number): string {
  return String(Number(value.toFixed(2)));
}
function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function parseDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

const todayKey = ref(dayKey(new Date()));
const dateLabel = computed(() =>
  new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(parseDay(todayKey.value))
);

/** 初试首日固定为 12 月倒数第二个周六（2027 考研即 2026-12-19，与教育部公布一致） */
function examDayOf(year: number) {
  const saturdays: number[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, 11, day);
    if (date.getMonth() !== 11) break;
    if (date.getDay() === 6) saturdays.push(day);
  }
  return new Date(year, 11, saturdays[saturdays.length - 2] ?? 19);
}

/** 今年初试已过就自动顺延到下一届，无需手动设置 */
const daysLeft = computed(() => {
  const today = parseDay(todayKey.value);
  let target = examDayOf(today.getFullYear());
  if (today.getTime() > target.getTime()) target = examDayOf(today.getFullYear() + 1);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
});

onShow(() => {
  todayKey.value = dayKey(new Date());
  if (!store.loaded) store.init();
  else store.reload();
});

const statCards = computed(() => [
  { label: '总词汇', value: Number(store.total) || 0, color: 'var(--accent)' },
  { label: '已掌握', value: Number(store.mastered) || 0, color: '#43b68d' },
  { label: '学习中', value: Number(store.learning) || 0, color: '#d69c4c' },
  { label: '待复习', value: Number(store.dueCount) || 0, color: '#5b9fd6' },
  { label: '错题本', value: Number(store.mistakes.length) || 0, color: '#dc7187' }
]);
const entries = computed(() => [
  { key: 'review', title: '今日复习', description: '按记忆曲线，巩固到期词汇', icon: 'review', badge: store.dueCount },
  { key: 'new', title: '学新词', description: store.finishedLessons >= 40 ? '40 Lessons 已全部学完' : `Lesson ${store.finishedLessons}/40 · 下一课 U${store.nextLessonPoint.unit} L${store.nextLessonPoint.lesson}`, icon: 'book' },
  { key: 'words', title: '看单词', description: '逐词过一遍词义和发音，先看懂再去做题', icon: 'list' },
  { key: 'mistakes', title: '错题本专练', description: '集中攻克每一次失误', icon: 'target', badge: store.mistakes.length },
  { key: 'quiz', title: '快速测验', description: '10 / 20 / 30 题自由挑战', icon: 'quiz' }
]);

function openSettings() {
  uni.navigateTo({ url: '/pages/settings/settings' });
}
function openScope(key: string) {
  uni.navigateTo({ url: `/pages/study/study?mode=new&scope=${encodeURIComponent(key)}` });
}
function openEntry(key: string) {
  const routes: Record<string, string> = {
    review: '/pages/study/study?mode=review',
    new: '/pages/study/study?mode=new',
    words: '/pages/words/words',
    mistakes: '/pages/study/study?mode=mistakes',
    quiz: '/pages/quiz/quiz'
  };
  uni.navigateTo({ url: routes[key] });
}
function openExport() {
  backupText.value = downloadBackup();
  backupMode.value = 'export';
  showBackup.value = true;
}
function openImport() {
  backupText.value = '';
  backupMode.value = 'import';
  showBackup.value = true;
}
function copyBackup() {
  uni.setClipboardData({ data: backupText.value, success: () => uni.showToast({ title: '备份已复制', icon: 'success' }) });
}
function confirmImport() {
  try {
    const result = importBackup(backupText.value);
    store.reload();
    settings.restore();
    showBackup.value = false;
    uni.showToast({ title: `已恢复 ${result.progressCount} 条进度`, icon: 'none' });
  } catch (error) {
    uni.showModal({ title: '导入失败', content: (error as Error).message, showCancel: false });
  }
}
</script>


<style scoped>
.brand { font-size: 45rpx; font-weight: 700; letter-spacing: -1rpx; }
.brand span { color: var(--accent-ink); }
.top-actions { display: flex; align-items: center; gap: 12rpx; margin-left: auto; }
.page-content .top-bar .icon-button {
  width: 66rpx;
  height: 66rpx;
  margin: 0;
  border-radius: 50%;
  border-color: transparent;
  background: var(--surface-soft);
  box-shadow: none;
  color: var(--text-secondary);
}
.page-content .top-bar .icon-button::before { display: none; }
.hero { padding: 36rpx; margin-top: 16rpx; }
.eyebrow { color: var(--accent-ink); font-size: 18rpx; font-weight: 800; letter-spacing: 4rpx; }
.hero-title { margin-top: 20rpx; font-size: 48rpx; line-height: 1.35; font-weight: 750; letter-spacing: .5rpx; text-wrap: balance; }
.hero-bottom { display: flex; justify-content: space-between; margin-top: 34rpx; color: var(--text-secondary); font-size: 24rpx; }
.progress-track { height: 13rpx; margin-top: 16rpx; border-radius: 20rpx; background: var(--surface-soft); overflow: hidden; box-shadow: inset 2rpx 2rpx 5rpx var(--shadow-dark); }
.progress-fill { height: 100%; min-width: 0; border-radius: inherit; background: var(--accent-track); transition: width 420ms ease; }
.countdown { display: flex; align-items: center; justify-content: center; gap: 14rpx; margin-top: 28rpx; padding: 30rpx 24rpx; }
.countdown-text { color: var(--text-secondary); font-size: 33rpx; font-weight: 650; letter-spacing: 1rpx; }
.countdown-number { font-variant-numeric: tabular-nums; font-size: 62rpx; font-weight: 700; line-height: 1; letter-spacing: -1rpx; background: linear-gradient(135deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12rpx; margin-top: 24rpx; }
.stat-card { position: relative; min-width: 0; padding: 24rpx 8rpx 20rpx; text-align: center; }
.stat-value { font-size: 37rpx; font-weight: 700; }
.stat-label { margin-top: 8rpx; color: var(--text-secondary); font-size: 20rpx; white-space: nowrap; }
.stat-dot { width: 8rpx; height: 8rpx; margin: 14rpx auto 0; border-radius: 50%; }
.entry-list { display: flex; flex-direction: column; gap: 18rpx; }
.entry { width: 100%; min-height: 128rpx; display: flex; align-items: center; padding: 22rpx 26rpx; text-align: left; transition: transform 120ms ease; }
.entry:active { transform: scale(.98); }
.entry-icon { width: 76rpx; height: 76rpx; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 22rpx; color: var(--accent-contrast); background: var(--accent-gradient); box-shadow: 6rpx 8rpx 16rpx var(--glow); }
.entry-icon.review { background: linear-gradient(145deg, #568ec7, #66b7c1); }
.entry-icon.mistakes { background: linear-gradient(145deg, #c25f7a, #db8792); }
.entry-copy { flex: 1; min-width: 0; margin-left: 22rpx; }
.entry-title { font-size: 30rpx; font-weight: 720; }
.entry-description { margin-top: 8rpx; color: var(--text-secondary); font-size: 22rpx; }
.entry-badge { min-width: 43rpx; height: 43rpx; line-height: 43rpx; padding: 0 10rpx; border-radius: 22rpx; background: var(--surface-strong); color: var(--accent-ink); text-align: center; font-size: 22rpx; font-weight: 750; }
.entry-arrow { margin-left: 16rpx; color: var(--text-secondary); font-size: 43rpx; }
.lesson-board {
  position: relative;
  overflow: hidden;
  padding: 26rpx;
  /* 五套主题只改这一组变量，结构样式共用；换主题时不用重写格子样式 */
  --bd-title: var(--text);
  --bd-copy: var(--text-secondary);
  --bd-line: var(--line);
  --bd-best: var(--success);
  --bd-kicker: var(--accent);
  --bd-chip-bg: var(--surface-soft);
  --bd-chip-fg: var(--text-secondary);
  --bd-chip-active-bg: var(--surface-strong);
  --bd-chip-active-fg: var(--accent);
  --bd-cell-bg: var(--surface-soft);
  --bd-cell-border: var(--line);
  --bd-cell-fg: var(--text-secondary);
  --bd-live-bg: var(--surface);
  --bd-live-border: rgba(var(--accent-rgb), .34);
  --bd-live-fg: var(--accent);
  --bd-done-bg: rgba(67, 182, 141, .16);
  --bd-done-border: rgba(67, 182, 141, .55);
  --bd-done-fg: var(--success);
}
.board-inner { position: relative; z-index: 1; }
.board-deco { position: absolute; inset: 0; z-index: 0; overflow: hidden; border-radius: inherit; pointer-events: none; animation: deco-in 420ms ease both; }
.deco-orb, .deco-ring, .deco-lines, .deco-stars, .deco-bar, .deco-word { position: absolute; opacity: 0; }
.deco-orb { width: 440rpx; height: 440rpx; border-radius: 50%; filter: blur(46rpx); }
.deco-ring { width: 460rpx; height: 460rpx; border-radius: 50%; border: 1rpx solid transparent; }
.deco-lines { inset: 0; }
.deco-stars { inset: 0; }
.deco-bar { left: 0; right: 0; top: 0; height: 6rpx; }
.deco-word { right: -14rpx; bottom: -34rpx; font-size: 176rpx; font-weight: 800; line-height: .8; letter-spacing: 10rpx; white-space: nowrap; }

.board-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.board-copy-wrap { flex: 1; min-width: 0; }
.board-kicker { margin-bottom: 10rpx; color: var(--bd-kicker); font-size: 17rpx; font-weight: 800; letter-spacing: 7rpx; }
.board-title { color: var(--bd-title); font-size: 27rpx; font-weight: 720; }
.board-copy { margin-top: 8rpx; color: var(--bd-copy); font-size: 20rpx; line-height: 1.55; }
.board-best { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6rpx; }
.best-line { display: flex; align-items: baseline; gap: 4rpx; }
.best-value { font-size: 42rpx; font-weight: 750; color: var(--bd-best); font-variant-numeric: tabular-nums; line-height: 1; }
.best-unit { color: var(--bd-copy); font-size: 18rpx; }
.best-label { color: var(--bd-copy); font-size: 17rpx; white-space: nowrap; }
.mode-switch { display: flex; gap: 8rpx; margin-top: 22rpx; padding: 6rpx; border-radius: 18rpx; background: var(--bd-chip-bg); }
.mode-chip { flex: 1; min-width: 0; height: 56rpx; line-height: 56rpx; margin: 0; padding: 0; border: none; border-radius: 13rpx; background: transparent; color: var(--bd-chip-fg); font-size: 21rpx; font-weight: 650; }
.mode-chip::after { border: none; }
.mode-chip.active { background: var(--bd-chip-active-bg); color: var(--bd-chip-active-fg); font-weight: 780; box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, .14); }
.board-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12rpx; margin-top: 24rpx; }
.grid-unit { grid-template-columns: repeat(5, 1fr); }
.grid-chunk { grid-template-columns: repeat(3, 1fr); }
/* Epic 只有前后两块，格子给宽也给自己高一点，别让两个小方块孤零零挂在左侧 */
.grid-epic { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-astra { grid-template-columns: 1fr; }
.grid-chunk .board-cell { height: 110rpx; }
.grid-epic .board-cell { height: 150rpx; }
.grid-epic .cell-no { font-size: 30rpx; letter-spacing: 1rpx; }
.grid-epic .cell-meta { font-size: 20rpx; }
.grid-astra .board-cell { flex-direction: row; gap: 16rpx; height: 118rpx; }
.grid-astra .cell-no { font-size: 28rpx; letter-spacing: 1rpx; }
.grid-astra .cell-meta { margin-top: 0; font-size: 21rpx; }
.board-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 96rpx; margin: 0; padding: 0; border-radius: 18rpx; border: 1rpx solid var(--bd-cell-border); background: var(--bd-cell-bg); color: var(--bd-cell-fg); transition: transform 120ms ease; }
.board-cell:active { transform: scale(.95); }
.board-cell { position: relative; overflow: hidden; }
.cell-no { font-size: 24rpx; font-weight: 700; line-height: 1.15; }
/* 称号圆点：12rpx 太小看不见、太大抢格子，配一圈浅描边更像"徽章" */
.rank-dot { position: absolute; top: 9rpx; right: 9rpx; width: 13rpx; height: 13rpx; border-radius: 50%; box-shadow: 0 0 0 2rpx rgba(255, 255, 255, .55), 0 2rpx 6rpx rgba(10, 16, 30, .28); }
.grid-astra .rank-dot { top: 14rpx; right: 16rpx; width: 15rpx; height: 15rpx; }
.rank-legend { display: flex; align-items: flex-start; gap: 10rpx; margin-top: 16rpx; color: var(--bd-copy); font-size: 18rpx; line-height: 1.5; }
.rank-legend-dot { flex: 0 0 auto; width: 12rpx; height: 12rpx; margin-top: 5rpx; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 0 0 2rpx rgba(255, 255, 255, .5); }
.cell-meta { margin-top: 3rpx; font-size: 17rpx; font-variant-numeric: tabular-nums; opacity: .82; }
.board-cell.is-active { border-color: var(--bd-live-border); background: var(--bd-live-bg); color: var(--bd-live-fg); }
.board-cell.is-done { border-color: var(--bd-done-border); background: var(--bd-done-bg); color: var(--bd-done-fg); }
.board-cell.is-done .cell-meta { opacity: 1; font-weight: 650; }
/* 先做完 Unit 带会的 Lesson：绿色实线边框显示完成，但不填充背景、不显示分数。
   和真正自己整块走过的 is-done 区分开——那里有一点淡绿底。 */
.board-cell.is-inherited { border-color: var(--bd-done-border); background: transparent; color: var(--bd-done-fg); }
.board-cell.is-inherited .cell-meta { opacity: .9; font-weight: 650; }
/* 推荐学习：词已学过、但这块还没按整块走过。虚线边框和「完成」的实线绿区分开 */
.board-cell.is-recommend { border-color: var(--bd-live-border); border-style: dashed; background: var(--bd-live-bg); color: var(--bd-live-fg); }
.board-cell.is-recommend .cell-meta { opacity: 1; font-weight: 700; }

/* ── Lesson：默认一档，只铺一层极淡的冷紫，点回来时有落定感 ── */
.theme-lesson {
  border-color: rgba(104, 112, 220, .26);
  background:
    radial-gradient(110% 92% at 100% -18%, rgba(126, 138, 236, .18), transparent 62%),
    linear-gradient(155deg, rgba(118, 128, 226, .10), rgba(255, 255, 255, 0) 62%);
}

/* ── Unit：秩序感，冷色细网格 ── */
.theme-unit {
  border-color: rgba(96, 160, 220, .34);
  background:
    radial-gradient(120% 90% at 100% -12%, rgba(96, 170, 220, .32), transparent 62%),
    linear-gradient(155deg, rgba(110, 160, 225, .20), rgba(110, 215, 205, .10) 58%, rgba(255, 255, 255, 0));
}
.theme-unit .deco-orb { top: -190rpx; right: -120rpx; background: rgba(86, 158, 214, .55); opacity: .5; }
.theme-unit .deco-lines { background-image: repeating-linear-gradient(90deg, rgba(70, 140, 200, .20) 0 1rpx, transparent 1rpx 10%); opacity: .75; }

/* ── Chunk：铜金分段，竖向切线暗示 500 词一刀 ── */
.theme-chunk {
  border-color: rgba(198, 148, 54, .38);
  background:
    radial-gradient(120% 110% at 0% 0%, rgba(224, 146, 42, .46), transparent 60%),
    radial-gradient(100% 90% at 102% 108%, rgba(246, 186, 92, .34), transparent 64%),
    linear-gradient(150deg, rgba(226, 168, 82, .34), rgba(226, 168, 82, .22));
}
.theme-chunk .deco-orb { bottom: -210rpx; left: -150rpx; background: rgba(214, 156, 76, .55); opacity: .45; }
.theme-chunk .deco-lines { background-image: repeating-linear-gradient(90deg, rgba(176, 118, 40, .18) 0 1rpx, transparent 1rpx 20%); opacity: .8; }

/* ── Epic：暗红熔炉，压上来的一层 ── */
.theme-epic {
  border-color: rgba(255, 110, 80, .34);
  background:
    radial-gradient(82% 64% at 50% -18%, rgba(255, 80, 52, .40), transparent 66%),
    radial-gradient(72% 70% at 108% 108%, rgba(140, 18, 42, .58), transparent 72%),
    linear-gradient(160deg, #1A0810 0%, #23090F 46%, #0A0407 100%);
  box-shadow: 0 22rpx 50rpx rgba(28, 2, 6, .55), inset 0 0 80rpx rgba(255, 66, 40, .12);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  --bd-title: #FFE2D9;
  --bd-copy: rgba(255, 209, 198, .64);
  --bd-line: rgba(255, 120, 90, .22);
  --bd-best: #FFA184;
  --bd-kicker: #FF8C68;
  --bd-chip-bg: rgba(255, 255, 255, .06);
  --bd-chip-fg: rgba(255, 214, 203, .62);
  --bd-chip-active-bg: rgba(255, 96, 62, .26);
  --bd-chip-active-fg: #FFD2C2;
  --bd-cell-bg: rgba(255, 255, 255, .045);
  --bd-cell-border: rgba(255, 120, 90, .20);
  --bd-cell-fg: rgba(255, 214, 203, .64);
  --bd-live-bg: rgba(255, 86, 56, .16);
  --bd-live-border: rgba(255, 110, 80, .48);
  --bd-live-fg: #FF9C7C;
  --bd-done-bg: rgba(255, 92, 50, .22);
  --bd-done-border: rgba(255, 132, 92, .58);
  --bd-done-fg: #FFC9B7;
}
.theme-epic .deco-orb { top: -230rpx; left: -80rpx; background: rgba(255, 78, 48, .60); opacity: .5; animation: epic-breathe 7s ease-in-out infinite; }
.theme-epic .deco-ring { top: 40rpx; right: -170rpx; border-color: rgba(255, 120, 90, .16); box-shadow: inset 0 0 60rpx rgba(255, 80, 50, .10); opacity: 1; }
.theme-epic .deco-bar { background: repeating-linear-gradient(135deg, rgba(255, 122, 76, .85) 0 14rpx, rgba(255, 122, 76, 0) 14rpx 28rpx); opacity: .45; }
.theme-epic .deco-word { color: rgba(255, 120, 90, .085); opacity: 1; animation: epic-breathe 9s ease-in-out infinite; }
.theme-epic .board-cell { box-shadow: inset 0 0 24rpx rgba(255, 70, 40, .10); }

/* ── Astra：深空，星场 + 缓慢自转的轨道环 ── */
.theme-astra {
  border-color: rgba(126, 168, 255, .34);
  background:
    radial-gradient(62% 52% at 16% 8%, rgba(96, 140, 255, .34), transparent 66%),
    radial-gradient(56% 56% at 86% 24%, rgba(168, 96, 255, .32), transparent 66%),
    radial-gradient(74% 64% at 50% 114%, rgba(38, 172, 200, .26), transparent 72%),
    linear-gradient(165deg, #05070F 0%, #0A1030 46%, #04050F 100%);
  box-shadow: 0 22rpx 52rpx rgba(2, 6, 20, .58), inset 0 0 80rpx rgba(86, 140, 255, .14);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  --bd-title: #EAF2FF;
  --bd-copy: rgba(206, 224, 255, .66);
  --bd-line: rgba(130, 170, 255, .22);
  --bd-best: #8FD0FF;
  --bd-kicker: #8CC2FF;
  --bd-chip-bg: rgba(255, 255, 255, .05);
  --bd-chip-fg: rgba(200, 220, 255, .62);
  --bd-chip-active-bg: rgba(110, 160, 255, .22);
  --bd-chip-active-fg: #CFE4FF;
  --bd-cell-bg: rgba(255, 255, 255, .045);
  --bd-cell-border: rgba(130, 170, 255, .22);
  --bd-cell-fg: rgba(200, 220, 255, .68);
  --bd-live-bg: rgba(90, 150, 255, .18);
  --bd-live-border: rgba(126, 186, 255, .52);
  --bd-live-fg: #A9D4FF;
  --bd-done-bg: rgba(70, 140, 255, .22);
  --bd-done-border: rgba(120, 190, 255, .55);
  --bd-done-fg: #B7E0FF;
}
.theme-astra .deco-stars {
  opacity: .9;
  background-image:
    radial-gradient(2.2rpx 2.2rpx at 12% 24%, rgba(255, 255, 255, .95), transparent 62%),
    radial-gradient(1.8rpx 1.8rpx at 62% 68%, rgba(206, 228, 255, .85), transparent 62%),
    radial-gradient(1.6rpx 1.6rpx at 84% 18%, rgba(255, 255, 255, .8), transparent 62%),
    radial-gradient(2rpx 2rpx at 34% 82%, rgba(190, 220, 255, .75), transparent 62%),
    radial-gradient(1.4rpx 1.4rpx at 48% 38%, rgba(255, 255, 255, .7), transparent 62%);
  background-size: 180rpx 180rpx, 240rpx 240rpx, 300rpx 300rpx, 210rpx 210rpx, 150rpx 150rpx;
  animation: twinkle 6.5s ease-in-out infinite;
}
.theme-astra .deco-orb { bottom: -240rpx; left: -120rpx; background: rgba(52, 150, 255, .55); opacity: .45; animation: epic-breathe 9s ease-in-out infinite; }
.theme-astra .deco-ring { width: 620rpx; height: 620rpx; top: -150rpx; right: -230rpx; border-color: rgba(120, 180, 255, .18); border-top-color: rgba(160, 214, 255, .55); opacity: 1; animation: astra-spin 28s linear infinite; }
.theme-astra .deco-word { bottom: -56rpx; color: rgba(130, 180, 255, .075); text-shadow: 0 0 40rpx rgba(90, 150, 255, .30); opacity: 1; }
.theme-astra .board-cell { height: 148rpx; border-radius: 22rpx; box-shadow: inset 0 0 30rpx rgba(90, 150, 255, .10); }
.theme-astra .cell-no { font-size: 34rpx; font-weight: 800; letter-spacing: 10rpx; text-shadow: 0 0 20rpx rgba(120, 180, 255, .45); }
.theme-astra .cell-meta { font-size: 20rpx; letter-spacing: 1rpx; }

@keyframes deco-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes epic-breathe { 0%, 100% { opacity: .35; } 50% { opacity: .78; } }
@keyframes astra-spin { to { transform: rotate(360deg); } }
@keyframes twinkle { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
.backup-card { padding: 26rpx; }
.backup-title { margin-bottom: 7rpx; font-weight: 700; }
.backup-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; margin-top: 22rpx; }
.footer-note { padding: 36rpx 0 10rpx; text-align: center; color: var(--text-secondary); font-size: 20rpx; }
.modal-mask { position: fixed; z-index: 30; inset: 0; display: flex; align-items: center; padding: 30rpx; background: rgba(4, 10, 18, .58); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
.backup-modal { width: 100%; max-width: 700px; max-height: 84vh; margin: auto; padding: 28rpx; background: var(--surface-strong); }
.modal-head { display: flex; align-items: center; justify-content: space-between; }
.modal-tip { margin: 24rpx 0 16rpx; color: var(--text-secondary); font-size: 23rpx; line-height: 1.6; }
.backup-textarea { width: 100%; height: 330rpx; margin-bottom: 20rpx; padding: 20rpx; border: 1rpx solid var(--line); border-radius: 18rpx; background: var(--surface-soft); color: var(--text); font-size: 21rpx; }
@media (max-width: 360px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .stat-card { padding: 18rpx 6rpx; }
  .hero-title { font-size: 42rpx; }
}

/* ── 平板：首页从「一条长列表」改成仪表盘，横向把空间用起来 ── */
.home-block { min-width: 0; }
/* 进页面时按顺序浮上来：hero 先到，越往下越晚一点，节奏别拖太长。
   淡入必须挂在玻璃卡片自己身上——挂在外面那层 view 上，动画会把外层变成
   「被变换的容器」，里面的 backdrop-filter 就采样不到壁纸，卡片会突然变成一块平板。 */
.home-count { --fade-delay: 60ms; }
.home-stats .stat-card:nth-child(1) { --fade-delay: 110ms; }
.home-stats .stat-card:nth-child(2) { --fade-delay: 140ms; }
.home-stats .stat-card:nth-child(3) { --fade-delay: 170ms; }
.home-stats .stat-card:nth-child(4) { --fade-delay: 200ms; }
.home-stats .stat-card:nth-child(5) { --fade-delay: 230ms; }
.entry-list .entry:nth-child(1) { --fade-delay: 240ms; }
.entry-list .entry:nth-child(2) { --fade-delay: 280ms; }
.entry-list .entry:nth-child(3) { --fade-delay: 320ms; }
.entry-list .entry:nth-child(4) { --fade-delay: 360ms; }
.entry-list .entry:nth-child(5) { --fade-delay: 400ms; }
.home-block-board .lesson-board { --fade-delay: 430ms; }
.home-block-backup .backup-card { --fade-delay: 470ms; }
.footer-note { --fade-delay: 500ms; }
html.is-wide .page-content {
  display: grid;
  grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr);
  grid-template-areas:
    "top    top"
    "hero   hero"
    "count  stats"
    "today  board"
    "backup board"
    "foot   foot";
  column-gap: 28rpx;
  align-items: start;
}
html.is-wide .top-bar { grid-area: top; }
html.is-wide .home-hero { grid-area: hero; }
html.is-wide .home-count { grid-area: count; }
html.is-wide .home-stats { grid-area: stats; }
html.is-wide .home-block-today { grid-area: today; }
html.is-wide .home-block-board { grid-area: board; }
html.is-wide .home-block-backup { grid-area: backup; }
html.is-wide .footer-note { grid-area: foot; }
html.is-wide .hero { padding: 44rpx 44rpx 38rpx; }
html.is-wide .hero-title { font-size: 54rpx; }
html.is-wide .countdown { margin-top: 24rpx; }
html.is-wide .stats-grid { margin-top: 24rpx; }
html.is-wide .entry-list { gap: 16rpx; }
html.is-wide .entry { min-height: 118rpx; }
html.is-wide .section-title { margin-top: 26rpx; }
/* 40 格在平板上不该固定 5 列：宽度够就自动多排几列，格子不会被拉成条 */
html.is-wide .grid-lesson,
html.is-wide .grid-unit { grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); }
html.is-wide .board-cell { height: 104rpx; }
html.is-wide .board-grid { gap: 14rpx; }
html.is-wide .home-block-backup { margin-top: 26rpx; }

/* ── 平板横屏：可用的高度只有 800 上下，hero 再吃两行标题就看不到进度了 ── */
html.is-tablet.is-landscape .hero { padding: 34rpx 42rpx 30rpx; }
html.is-tablet.is-landscape .hero-title { margin-top: 12rpx; font-size: 46rpx; line-height: 1.28; }
html.is-tablet.is-landscape .hero-title br { display: none; }
html.is-tablet.is-landscape .hero-bottom { margin-top: 20rpx; }
html.is-tablet.is-landscape .progress-track { margin-top: 12rpx; }
html.is-tablet.is-landscape .countdown { padding-top: 20rpx; padding-bottom: 20rpx; }
html.is-tablet.is-landscape .stat-card { padding: 18rpx 10rpx; }
html.is-tablet.is-landscape .section-title { margin-top: 22rpx; }
html.is-tablet.is-landscape .entry { min-height: 104rpx; }
/* 横屏时右栏够宽，进度格再密一点，40 格尽量一屏看完 */
html.is-tablet.is-landscape .board-grid { gap: 10rpx; margin-top: 18rpx; }
html.is-tablet.is-landscape .board-cell { height: 88rpx; }
html.is-tablet.is-landscape .board-copy { display: none; }
</style>
