import type { Sm2Card } from './sm2';
import { ACCENT_THEME_DEFAULT, normalizeAccentTheme, type AccentThemeName } from './accentTheme';
import { DEFAULT_DIRECTION, normalizeDirection, type DirectionMode } from './direction';
import { scopesOf } from './scopes';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEYS = {
  meta: 'ky_v1_meta',
  progress: 'ky_v1_progress',
  mistakes: 'ky_v1_mistakes',
  settings: 'ky_v1_settings',
  background: 'ky_v1_background',
  wallpapers: 'ky_v1_wallpapers',
  lessonTime: 'ky_v1_lesson_time',
  quizScope: 'ky_v1_quiz_scope',
  photoTone: 'ky_v1_photo_tone'
} as const;

export type ThemeMode = 'system' | 'light' | 'dark';
/** system = 跟随系统；另两档是手动锁死。认不出的值一律回到跟随系统 */
export function normalizeTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system';
}
/** 0 = 最通透，100 = 最沉稳；旧版三档字符串在读取时换算成这个刻度 */
export type BgDim = number;
/** 玻璃通透度的两种操控方式：点三档预设，或直接拖滑块 */
export type DimMode = 'preset' | 'custom';
/** 控件玻璃的两种质感：雾玻璃（厚、柔）与液态玻璃（薄、透亮） */
export type GlassMode = 'fog' | 'liquid';
export const GLASS_MODE_DEFAULT: GlassMode = 'fog';
export const BG_DIM_MIN = 0;
export const BG_DIM_MAX = 100;
export const BG_DIM_DEFAULT = 50;
/** 控件玻璃质感：0 = 近乎裸玻璃，100 = 接近实底 */
export const GLASS_DEFAULT = 50;
const LEGACY_BG_DIM: Record<string, number> = { soft: 25, normal: 50, strong: 75 };
/**
 * 三档预设的刻度沿用 v2.3.x：通透 25 / 标准 50 / 沉稳 75。
 * 点预设后滑块置灰但数值仍同步过去，方便用户从这里继续微调。
 */
export const DIM_PRESETS: Array<{ value: BgDim; label: string }> = [
  { value: 25, label: '通透' },
  { value: 50, label: '标准' },
  { value: 75, label: '沉稳' }
];

export function normalizeBgDim(value: unknown): number {
  if (typeof value === 'string' && value in LEGACY_BG_DIM) return LEGACY_BG_DIM[value];
  if (typeof value !== 'number' && typeof value !== 'string') return BG_DIM_DEFAULT;
  if (value === '') return BG_DIM_DEFAULT;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return BG_DIM_DEFAULT;
  return Math.min(BG_DIM_MAX, Math.max(BG_DIM_MIN, Math.round(number)));
}
export type MistakeSource = 'study' | 'quiz' | 'spelling';
/** 历史壁纸保留压缩后的完整图片；不设数量上限、不自动淘汰，只有用户手动删除才移除 */
export interface WallpaperItem {
  id: string;
  /** 名字跟着这张图走：导入时定下来，之后切换顺序变化也不改名（v2.8.0 之前是按位置算的） */
  name: string;
  dataUrl: string;
  createdAt: number;
  lastUsedAt: number;
}
/**
 * v3.0.0 起图库里只有用户自己导入的图片：只认 dataURL，
 * 不再接受随包静态文件——旧版本内置的那张测试壁纸会因此自动失效。
 */
export function isWallpaperUrl(value: string): boolean {
  return value.startsWith('data:image/');
}
export interface MistakeItem {
  wordId: number;
  wrongCount: number;
  lastWrongAt: number;
  sources: MistakeSource[];
}
/**
 * 每个背诵块的最好成绩：只保留历史最快的一次每题平均用时。
 * key 形如 lesson:1 / unit:3 / chunk:2 / epic:1 / astra:1，各模式互不覆盖。
 * words 记录当时的词数，避免以后扩词导致旧成绩口径不一致时无从判断。
 * round 是最近一次完整走完这一块时的明细，用来让「再次打开已学完的课」也能看到同一张结算卡。
 */
export interface ScopeRound {
  correct: number;
  answered: number;
  /** 每题平均用时（秒），与结算页的「答对均速」同口径 */
  avg: number;
  /** 本轮总用时（毫秒） */
  elapsedMs: number;
  at: number;
}
/** 这一块拿到的称号：首页进度格里的小圆点要用它上色 */
export interface ScopeRank {
  title: string;
  dot: string;
}
export interface LessonTimeRecord {
  avg: number;
  words: number;
  at: number;
  round?: ScopeRound;
  rank?: ScopeRank;
}

/**
 * 老版本只按课存，键是纯数字。读档时统一补成 lesson: 前缀；
 * 已经写成新格式的原样保留，认不出的键直接丢掉。
 */
function normalizeTimeKey(key: string): { key: string; legacy: boolean } | null {
  if (/^\d+$/.test(key)) return { key: `lesson:${key}`, legacy: true };
  if (/^(lesson|unit|chunk|epic|astra):\d+$/.test(key)) return { key, legacy: false };
  return null;
}
/**
 * Epic 的切法在 v2.3.1 改过：从「每 1000 词一块」改成「前 20 课 / 后 20 课」。
 * 旧记录的 words 是 1000，对不上新块，读档时直接丢掉——否则会拿 1000 词的均速
 * 去冒充 1466 词那一块的历史最好成绩。
 */
function epicRecordFits(key: string, words: number): boolean {
  const match = /^epic:(\d+)$/.exec(key);
  if (!match) return true;
  const scope = scopesOf('epic')[Number(match[1]) - 1];
  if (!scope) return false;
  return !words || words === scope.words.length;
}

export interface Settings {
  /** 仅保留兼容：v2.5.0 起主题固定跟随系统，不再接受手动值 */
  theme: ThemeMode;
  /** 控件主色调：整套渐变随预设切换；老存档缺省为星云紫 */
  accent: AccentThemeName;
  /** 壁纸雾化程度：0 几乎原色，100 压到接近纯色 */
  bgDim: BgDim;
  /** 控件玻璃质感：0 近乎裸玻璃，100 接近实底；与雾化各走一个滑块 */
  glass: BgDim;
  /** preset = 三档按钮；custom = 用户手动拖过滑块（两个滑块共用这个状态） */
  dimMode: DimMode;
  /** 控件玻璃质感：fog 雾玻璃 / liquid 液态玻璃，两者都受 glass 滑块控制 */
  glassMode: GlassMode;
  /**
   * 玻璃质感总开关（v3.10.1）。关闭后全局关掉 backdrop-filter 并用实色底，
   * 让低端机免去每帧重采样背景模糊。老存档没有这一项，默认开，观感不变。
   */
  glassEffect: boolean;
  /** 答对后是否自动翻到下一题 */
  autoNext: boolean;
  /** 触感反馈总开关 */
  haptic: boolean;
  /** 答题音效总开关（默认关，用户自己开） */
  sound: boolean;
  /** 答对音效：warm_pop 温暖轻弹 / triple_chime 三连音 */
  correctSound: string;
  /** 答错音效：muted_double 闷双音 / soft_wood_tap 轻木鱼 */
  wrongSound: string;
  /** 背诵方向：英→中 / 中→英 / 随机 */
  direction: DirectionMode;
  /**
   * 实验性功能总开关。关闭时不渲染底部功能栏，
   * 设置页里由它衍生出来的选项（联网 / AI 接入 / 音乐曲库）一起隐藏。
   * 旧存档没有这个字段，所以是可选的；读取时只有明确的 true 才算开。
   */
  experimental?: boolean;
}
export interface BackupPayload {
  app: 'kaoyan-memory';
  schemaVersion: number;
  exportedAt: string;
  data: {
    progress: Record<string, Sm2Card>;
    mistakes: MistakeItem[];
    settings: Settings;
    lessonTimes?: Record<string, LessonTimeRecord>;
  };
}

const defaultSettings = (): Settings => ({
  theme: 'system',
  accent: ACCENT_THEME_DEFAULT,
  bgDim: BG_DIM_DEFAULT,
  glass: GLASS_DEFAULT,
  dimMode: 'preset',
  glassMode: GLASS_MODE_DEFAULT,
  glassEffect: true,
  autoNext: false,
  haptic: true,
  sound: false,
  correctSound: 'warm_pop',
  wrongSound: 'muted_double',
  direction: DEFAULT_DIRECTION,
  experimental: false
});
export function normalizeGlassMode(value: unknown): GlassMode {
  return value === 'liquid' ? 'liquid' : GLASS_MODE_DEFAULT;
}
/** 旧存档没写 dimMode：v2.4.x 存的是数字滑块 → 视为手动；更早的三档字符串 → 视为预设 */
function normalizeDimMode(value: unknown, rawDim: unknown): DimMode {
  if (value === 'preset' || value === 'custom') return value;
  return typeof rawDim === 'number' ? 'custom' : 'preset';
}
/** 结算明细只接受完整、合法的数字，任何一项不对就别拿它当结算卡 */
function normalizeRound(value: unknown): ScopeRound | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const round = value as Partial<ScopeRound>;
  const correct = Number(round.correct);
  const answered = Number(round.answered);
  const avg = Number(round.avg);
  const elapsedMs = Number(round.elapsedMs);
  if (!Number.isFinite(correct) || !Number.isFinite(answered) || answered <= 0) return undefined;
  if (correct < 0 || correct > answered) return undefined;
  if (!Number.isFinite(avg) || avg <= 0) return undefined;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return undefined;
  return {
    correct: Math.round(correct),
    answered: Math.round(answered),
    avg: Math.round(avg * 1000) / 1000,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
    at: Number.isFinite(round.at) ? Number(round.at) : 0
  };
}
/** 称号只接受「名字 + 颜色」这一对，缺一个就当没记录，别画一个透明圆点 */
function normalizeRank(value: unknown): ScopeRank | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rank = value as Partial<ScopeRank>;
  if (typeof rank.title !== 'string' || !rank.title.trim()) return undefined;
  if (typeof rank.dot !== 'string' || !rank.dot.trim()) return undefined;
  return { title: rank.title, dot: rank.dot };
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isEmpty = (value: unknown) => value === '' || value === null || value === undefined;

function read<T>(key: string, fallback: T): T {
  try {
    const value = uni.getStorageSync(key);
    return isEmpty(value) ? clone(fallback) : value as T;
  } catch {
    return clone(fallback);
  }
}

function write<T>(key: string, value: T): void {
  uni.setStorageSync(key, value);
}

function writeIfEmpty<T>(key: string, value: T): void {
  if (isEmpty(uni.getStorageSync(key))) write(key, value);
}

export function getProgress(): Record<string, Sm2Card> {
  const value = read<Record<string, Sm2Card>>(STORAGE_KEYS.progress, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function saveProgress(progress: Record<string, Sm2Card>): void {
  write(STORAGE_KEYS.progress, progress);
}

export function getMistakes(): MistakeItem[] {
  const value = read<MistakeItem[]>(STORAGE_KEYS.mistakes, []);
  return Array.isArray(value) ? value : [];
}

export function saveMistakes(mistakes: MistakeItem[]): void {
  write(STORAGE_KEYS.mistakes, mistakes);
}

export function getLessonTimes(): Record<string, LessonTimeRecord> {
  const value = read<Record<string, LessonTimeRecord>>(STORAGE_KEYS.lessonTime, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const clean: Record<string, LessonTimeRecord> = {};
  for (const [rawKey, item] of Object.entries(value)) {
    if (!item || typeof item !== 'object') continue;
    if (!Number.isFinite(item.avg) || item.avg <= 0) continue;
    const normalized = normalizeTimeKey(rawKey);
    if (!normalized) continue;
    const words = Number.isFinite(item.words) ? Number(item.words) : 0;
    if (!epicRecordFits(normalized.key, words)) continue;
    // 迁移期新旧键可能共存，新格式优先，旧键不覆盖已有成绩
    if (normalized.legacy && clean[normalized.key]) continue;
    const round = normalizeRound(item.round);
    const rank = normalizeRank(item.rank);
    clean[normalized.key] = {
      avg: Number(item.avg),
      words,
      at: Number.isFinite(item.at) ? Number(item.at) : 0,
      ...(round ? { round } : {}),
      ...(rank ? { rank } : {})
    };
  }
  return clean;
}

export function saveLessonTimes(records: Record<string, LessonTimeRecord>): void {
  write(STORAGE_KEYS.lessonTime, records);
}

export function getSettings(): Settings {
  const value = read<Partial<Settings>>(STORAGE_KEYS.settings, defaultSettings());
  return {
    // v3.0.0：恢复手动开关，自动 / 浅色 / 深色三档；老存档里的值原样认，认不出就回到自动
    theme: normalizeTheme(value.theme),
    accent: normalizeAccentTheme(value.accent),
    bgDim: normalizeBgDim(value.bgDim),
    // v2.6.0 之前只有一个滑块，同时管雾化和玻璃：老存档按原值补齐，观感不变
    glass: normalizeBgDim(value.glass === undefined || value.glass === null ? value.bgDim : value.glass),
    dimMode: normalizeDimMode(value.dimMode, value.bgDim),
    // 老存档没有这一项：默认雾玻璃，观感和升级前一模一样
    glassMode: normalizeGlassMode(value.glassMode),
    // 老存档没有这一项：默认开玻璃质感，观感不变；只有明确关掉才省性能
    glassEffect: value.glassEffect !== false,
    // 旧存档没有这一项，按关闭处理——自动翻页属于改变节奏的选项，得用户自己打开
    autoNext: value.autoNext === true,
    // 触感默认开：老用户升级后手感不该突然消失
    haptic: value.haptic !== false,
    // 音效默认关：这是新东西，且答对答错突然出声会打扰人，得用户自己开
    sound: value.sound === true,
    // 音效白名单：认不出就回到默认那一种
    correctSound: value.correctSound === 'triple_chime' ? 'triple_chime' : 'warm_pop',
    wrongSound: value.wrongSound === 'soft_wood_tap' ? 'soft_wood_tap' : 'muted_double',
    // 同理：老存档没有方向字段，默认「看英文选中文」，保持原来的习惯
    direction: normalizeDirection(value.direction),
    // 实验性功能默认关：这是新东西，不该在升级后自己冒出来
    experimental: value.experimental === true
  };
}

export function saveSettings(settings: Settings): void {
  write(STORAGE_KEYS.settings, settings);
}

/**
 * 壁纸明暗判定的落盘缓存（v3.5.2）。
 *
 * photoDark 是 new Image + canvas 异步采样出来的，结果原先只放在内存 Map 里。
 * 「划掉后台后重进」会清空这个 Map：冷启动首帧 photoDark 还是 false，浅色主题下
 * 会先铺一帧白色柔光 + 白玻璃，等图片解码采样完才切成深色烟熏玻璃，用户看到的
 * 就是「整个壁纸发白闪一下」。把判定按壁纸落盘，启动时同步读回来即可让首帧套对色。
 */
type PhotoToneMap = Record<string, boolean>;

/** 不拿整张 base64 当 key：字符数 + 采样散列足够区分，也不会把配额吃满 */
function photoToneKey(dataUrl: string): string {
  let hash = 5381;
  for (let i = 0; i < dataUrl.length; i += 97) {
    hash = ((hash << 5) + hash + dataUrl.charCodeAt(i)) | 0;
  }
  return `${dataUrl.length}-${(hash >>> 0).toString(36)}`;
}

export function getPhotoTone(dataUrl: string): boolean | undefined {
  if (!dataUrl) return undefined;
  const value = read<PhotoToneMap>(STORAGE_KEYS.photoTone, {});
  const hit = value && typeof value === 'object' ? value[photoToneKey(dataUrl)] : undefined;
  return typeof hit === 'boolean' ? hit : undefined;
}

export function savePhotoTone(dataUrl: string, dark: boolean): void {
  if (!dataUrl) return;
  const value = read<PhotoToneMap>(STORAGE_KEYS.photoTone, {});
  const map: PhotoToneMap = value && typeof value === 'object' ? { ...value } : {};
  map[photoToneKey(dataUrl)] = dark;
  // 跟着历史壁纸数量走，只留最近 12 个判定
  const keys = Object.keys(map);
  if (keys.length > 12) {
    for (const key of keys.slice(0, keys.length - 12)) delete map[key];
  }
  write(STORAGE_KEYS.photoTone, map);
}

/**
 * 当前背景只存「历史壁纸的 id」，不再把整张图再复制一份：
 * 以前同一个 base64 在 background / wallpapers 两个键里各占一份，等于白扔一张图。
 * 老存档里存的是完整 dataURL，照常读出来。
 */
const BG_REF_PREFIX = 'wp:';

export function getBackground(): string {
  const value = read<string>(STORAGE_KEYS.background, '');
  if (typeof value !== 'string' || !value) return '';
  if (isWallpaperUrl(value)) return value;
  if (!value.startsWith(BG_REF_PREFIX)) return '';
  const id = value.slice(BG_REF_PREFIX.length);
  return readWallpapers().find((item) => item.id === id)?.dataUrl ?? '';
}

export function saveBackground(dataUrl: string): void {
  if (!isWallpaperUrl(dataUrl)) {
    clearBackground();
    return;
  }
  // 重压缩过的历史壁纸仍保留原来的 id，引用要跟着历史里的 id 走，
  // 不能按新的 dataUrl 重算 hash，否则引用会指向一个不存在的条目。
  const hit = readWallpapers().find((item) => item.dataUrl === dataUrl);
  if (hit) {
    write(STORAGE_KEYS.background, `${BG_REF_PREFIX}${hit.id}`);
  } else {
    // 还没进历史（老存档、或单独调用）：退回存整图，启动时会自动补进历史，别把图弄丢
    write(STORAGE_KEYS.background, dataUrl);
  }
}

export function clearBackground(): void {
  try {
    uni.removeStorageSync(STORAGE_KEYS.background);
  } catch {
    write(STORAGE_KEYS.background, '');
  }
}

/** 同一张图有稳定 ID：重复导入只更新使用时间，不会在历史里堆出一串副本 */
function wallpaperId(dataUrl: string): string {
  let hash = 2166136261;
  for (let position = 0; position < dataUrl.length; position += 1) {
    hash ^= dataUrl.charCodeAt(position);
    hash = Math.imul(hash, 16777619);
  }
  return `wp_${(hash >>> 0).toString(36)}_${dataUrl.length.toString(36)}`;
}

const NAME_PATTERN = /^壁纸 (\d+)$/;

/**
 * 名字是绑在图片上的，所以读档时只补「没有名字」的老条目：
 * 按导入先后（createdAt）依次给最小可用编号，已有名字一律不动。
 * 这样切来切去、删掉几张，都不会出现「选中的那张变成壁纸 1」。
 */
function fillWallpaperNames(items: WallpaperItem[]): WallpaperItem[] {
  const used = new Set<number>();
  const unnamed: WallpaperItem[] = [];
  for (const item of items) {
    const match = item.name ? NAME_PATTERN.exec(item.name) : null;
    if (match) {
      const number = Number(match[1]);
      if (!used.has(number)) {
        used.add(number);
        item.name = `壁纸 ${number}`;
        continue;
      }
    }
    if (item.name && !match) continue;
    unnamed.push(item);
  }
  unnamed.sort((left, right) => left.createdAt - right.createdAt);
  let cursor = 1;
  for (const item of unnamed) {
    while (used.has(cursor)) cursor += 1;
    item.name = `壁纸 ${cursor}`;
    used.add(cursor);
  }
  return items;
}

function nextWallpaperName(items: WallpaperItem[]): string {
  let max = 0;
  for (const item of items) {
    const match = NAME_PATTERN.exec(item.name || '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `壁纸 ${max + 1}`;
}

function readWallpapers(): WallpaperItem[] {
  const value = read<unknown>(STORAGE_KEYS.wallpapers, []);
  if (!Array.isArray(value)) return [];
  const clean: WallpaperItem[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<WallpaperItem>;
    if (typeof candidate.dataUrl !== 'string' || !isWallpaperUrl(candidate.dataUrl)) continue;
    // 优先沿用存档里的 id：历史壁纸被重新压缩过之后 dataUrl 会变，
    // id 必须保持稳定，否则「当前背景」的引用和名字都会跟着漂。
    const id = typeof candidate.id === 'string' && /^wp_/.test(candidate.id)
      ? candidate.id
      : wallpaperId(candidate.dataUrl);
    if (seen.has(id)) continue;
    seen.add(id);
    const createdAt = Number.isFinite(candidate.createdAt) ? Number(candidate.createdAt) : 0;
    const lastUsedAt = Number.isFinite(candidate.lastUsedAt) ? Number(candidate.lastUsedAt) : createdAt;
    clean.push({
      id,
      name: typeof candidate.name === 'string' ? candidate.name : '',
      dataUrl: candidate.dataUrl,
      createdAt,
      lastUsedAt
    });
  }
  fillWallpaperNames(clean);
  return clean.sort((left, right) => right.lastUsedAt - left.lastUsedAt);
}

/** 读取时兼容 v2.3.x：那时只有当前背景一个字段，也要让它出现在历史里 */
export function getWallpapers(): WallpaperItem[] {
  const items = readWallpapers();
  const current = getBackground();
  if (current && !items.some((item) => item.dataUrl === current)) {
    items.unshift({ id: wallpaperId(current), name: '', dataUrl: current, createdAt: 0, lastUsedAt: 0 });
    fillWallpaperNames(items);
  }
  return items;
}

function saveWallpapers(items: WallpaperItem[]): void {
  write(STORAGE_KEYS.wallpapers, items);
}

/**
 * 估算壁纸占了多少本地存储字符数。配额是「整个应用」共用的，
 * 这里只算壁纸相关的两个键，用来在设置页显示「已用 / 上限」。
 */
export function wallpaperUsage(): { chars: number; count: number } {
  let chars = 0;
  let count = 0;
  try {
    const items = uni.getStorageSync(STORAGE_KEYS.wallpapers);
    if (Array.isArray(items)) {
      count = items.length;
      chars += JSON.stringify(items).length;
    }
    const background = uni.getStorageSync(STORAGE_KEYS.background);
    if (typeof background === 'string') chars += background.length;
  } catch {
    // 读不出来就按 0 处理，设置页只是少显示一行数字
  }
  return { chars, count };
}

/** 一键整理：按 id 把历史壁纸换成重新压缩后的图，id / 名字 / 使用时间都不动 */
export function replaceWallpaperData(next: Array<{ id: string; dataUrl: string }>): void {
  const items = readWallpapers();
  const currentBefore = getBackground();
  const currentId = items.find((item) => item.dataUrl === currentBefore)?.id;
  let changed = false;
  for (const entry of next) {
    if (!isWallpaperUrl(entry.dataUrl)) continue;
    const hit = items.find((item) => item.id === entry.id);
    if (hit && hit.dataUrl !== entry.dataUrl) {
      hit.dataUrl = entry.dataUrl;
      changed = true;
    }
  }
  if (changed) saveWallpapers(items);
  // 当前背景也得跟着换成新图并落成 id 引用，否则 getWallpapers 会把旧图当新条目补回来
  if (currentId) {
    const currentAfter = items.find((item) => item.id === currentId)?.dataUrl;
    if (currentAfter && isWallpaperUrl(currentAfter)) saveBackground(currentAfter);
  }
}

/** 导入新图或再次应用历史图都走这里：先落盘成功，再切换当前背景 */
export function useWallpaper(dataUrl: string, at = Date.now()): WallpaperItem[] {
  if (!isWallpaperUrl(dataUrl)) throw new Error('壁纸格式不正确');
  const items = readWallpapers();
  const existing = items.find((item) => item.dataUrl === dataUrl);
  if (existing) {
    existing.lastUsedAt = at;
  } else {
    // 新图拿一个「还没被用过」的编号，别人已经占着的名字不会被顶掉
    items.push({ id: wallpaperId(dataUrl), name: nextWallpaperName(items), dataUrl, createdAt: at, lastUsedAt: at });
  }
  saveWallpapers(items);
  saveBackground(dataUrl);
  return readWallpapers();
}

export function useWallpaperById(id: string, at = Date.now()): string {
  const item = readWallpapers().find((candidate) => candidate.id === id);
  if (!item) throw new Error('这张历史壁纸已经不存在');
  useWallpaper(item.dataUrl, at);
  return item.dataUrl;
}

/** 只停用当前背景，不清历史；用户仍可从图库一键切回来 */
export function deleteWallpaper(id: string): string {
  const items = readWallpapers();
  const target = items.find((item) => item.id === id);
  if (!target) return getBackground();
  // 先判断再删：当前背景存的是 id 引用，删完再查就查不到了
  const wasCurrent = getBackground() === target.dataUrl;
  saveWallpapers(items.filter((item) => item.id !== id));
  if (wasCurrent) {
    clearBackground();
    return '';
  }
  return getBackground();
}

function migrateWallpaperHistory(): void {
  const current = getBackground();
  if (!current || readWallpapers().some((item) => item.dataUrl === current)) return;
  const at = Date.now();
  try {
    saveWallpapers([...readWallpapers(), { id: wallpaperId(current), dataUrl: current, createdAt: at, lastUsedAt: at }]);
  } catch {
    // 存储已满时不能让升级流程把 App 卡在启动阶段；当前图仍在，getWallpapers() 会临时补出来
  }
}

export function migrateSchema(): void {
  const meta = read<{ schemaVersion?: number }>(STORAGE_KEYS.meta, {});
  const version = Number(meta.schemaVersion || 0);
  if (version < SCHEMA_VERSION) {
    const oldProgress = uni.getStorageSync('ky_progress');
    const oldMistakes = uni.getStorageSync('ky_mistakes');
    const oldSettings = uni.getStorageSync('ky_settings');
    if (!isEmpty(oldProgress)) writeIfEmpty(STORAGE_KEYS.progress, oldProgress);
    if (!isEmpty(oldMistakes)) writeIfEmpty(STORAGE_KEYS.mistakes, oldMistakes);
    if (!isEmpty(oldSettings)) writeIfEmpty(STORAGE_KEYS.settings, oldSettings);
  }
  write(STORAGE_KEYS.meta, {
    schemaVersion: SCHEMA_VERSION,
    createdAt: read(STORAGE_KEYS.meta, {}).createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * v3.0.0 去掉了随包内置的测试壁纸。老存档里可能还留着指向它的条目
 * （`/static/wallpapers/miku.jpg`），图片已经不在了，打开设置会显示破图，
 * 所以启动时顺手清掉：条目删掉，当前背景若正是它则回默认渐变。
 */
function purgeRemovedWallpapers(): void {
  const stored = read<unknown>(STORAGE_KEYS.wallpapers, null);
  if (Array.isArray(stored)) {
    const kept = stored.filter((item) => {
      const dataUrl = (item as Partial<WallpaperItem> | null)?.dataUrl;
      return typeof dataUrl === 'string' && isWallpaperUrl(dataUrl);
    });
    if (kept.length !== stored.length) saveWallpapers(kept as WallpaperItem[]);
  }
  // 只清理老版本指向内置静态图的脏数据；wp: 开头的是当前壁纸的 id 引用，别误删
  const background = read<string>(STORAGE_KEYS.background, '');
  if (background && !isWallpaperUrl(background) && !background.startsWith(BG_REF_PREFIX)) clearBackground();
}

export function initStorage(): void {
  migrateSchema();
  purgeRemovedWallpapers();
  migrateWallpaperHistory();
  writeIfEmpty(STORAGE_KEYS.progress, {});
  writeIfEmpty(STORAGE_KEYS.mistakes, []);
  writeIfEmpty(STORAGE_KEYS.settings, defaultSettings());
  writeIfEmpty(STORAGE_KEYS.lessonTime, {});
}

/**
 * 快速测验的抽查范围。
 * 第一次进来默认全选 40 课，之后记住上次勾的那几课——
 * 快速测测验每次都会弹选择器，但勾选状态保留，多半只是点一下「开始」。
 */
export function getQuizLessons(): number[] {
  const total = scopesOf('lesson').length;
  const all = Array.from({ length: total }, (_, position) => position + 1);
  const value = read<unknown>(STORAGE_KEYS.quizScope, null);
  if (!Array.isArray(value)) return all;
  const picked = new Set<number>();
  for (const item of value) {
    const lesson = Number(item);
    if (Number.isInteger(lesson) && lesson >= 1 && lesson <= total) picked.add(lesson);
  }
  // 空数组说明上次一个都没勾，这种状态不该被当成"默认全选"以外的语义；仍回到全选
  return picked.size ? [...picked].sort((left, right) => left - right) : all;
}

export function saveQuizLessons(lessons: number[]): void {
  const total = scopesOf('lesson').length;
  const picked = [...new Set(lessons.filter((lesson) => Number.isInteger(lesson) && lesson >= 1 && lesson <= total))]
    .sort((left, right) => left - right);
  if (!picked.length) return;
  write(STORAGE_KEYS.quizScope, picked);
}

export function exportBackup(): string {
  const payload: BackupPayload = {
    app: 'kaoyan-memory',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      progress: getProgress(),
      mistakes: getMistakes(),
      settings: getSettings(),
      lessonTimes: getLessonTimes()
    }
  };
  return JSON.stringify(payload, null, 2);
}

function assertBackup(value: unknown): asserts value is BackupPayload {
  if (!value || typeof value !== 'object') throw new Error('备份必须是 JSON 对象');
  const candidate = value as Partial<BackupPayload>;
  if (candidate.app !== 'kaoyan-memory') throw new Error('这不是 Vast Galaxy 备份文件');
  if (!Number.isInteger(candidate.schemaVersion) || Number(candidate.schemaVersion) > SCHEMA_VERSION) {
    throw new Error('备份版本高于当前应用，请升级应用');
  }
  if (!candidate.data || typeof candidate.data !== 'object') throw new Error('备份缺少 data 数据');
  if (!candidate.data.progress || typeof candidate.data.progress !== 'object' || Array.isArray(candidate.data.progress)) {
    throw new Error('学习进度格式不正确');
  }
  if (!Array.isArray(candidate.data.mistakes)) throw new Error('错题本格式不正确');
  for (const [key, card] of Object.entries(candidate.data.progress)) {
    if (!/^\d+$/.test(key) || !card || typeof card !== 'object' || !Number.isFinite(card.dueDate) || !Number.isFinite(card.ef)) {
      throw new Error(`单词 ${key} 的进度数据损坏`);
    }
  }
  for (const item of candidate.data.mistakes) {
    if (!item || !Number.isInteger(item.wordId) || !Number.isFinite(item.wrongCount)) throw new Error('错题记录格式不正确');
  }
}

export function importBackup(json: string): { progressCount: number; mistakeCount: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('JSON 无法解析，请检查复制内容');
  }
  assertBackup(parsed);
  const current = getSettings();
  saveProgress(parsed.data.progress);
  saveMistakes(parsed.data.mistakes);
  saveSettings({
    // 恢复备份时把主题也带回来；备份里没有这一项就沿用本机当前的档位
    theme: parsed.data.settings?.theme === undefined ? current.theme : normalizeTheme(parsed.data.settings.theme),
    accent: parsed.data.settings?.accent === undefined ? current.accent : normalizeAccentTheme(parsed.data.settings.accent),
    bgDim: parsed.data.settings?.bgDim === undefined ? current.bgDim : normalizeBgDim(parsed.data.settings.bgDim),
    glass: parsed.data.settings?.glass === undefined || parsed.data.settings?.glass === null
      ? current.glass
      : normalizeBgDim(parsed.data.settings.glass),
    dimMode: normalizeDimMode(parsed.data.settings?.dimMode, parsed.data.settings?.bgDim),
    glassMode: normalizeGlassMode(parsed.data.settings?.glassMode),
    // 玻璃总开关：备份里带了照它，没带沿用本机，避免老备份把新设置冲掉
    glassEffect: parsed.data.settings?.glassEffect === undefined
      ? current.glassEffect
      : parsed.data.settings.glassEffect !== false,
    autoNext: parsed.data.settings?.autoNext === true,
    haptic: parsed.data.settings?.haptic !== false,
    // 音效：备份里带了就照它（含白名单），没带就沿用本机当前设置
    sound: parsed.data.settings?.sound === undefined ? current.sound : parsed.data.settings.sound === true,
    correctSound: parsed.data.settings?.correctSound === 'triple_chime' ? 'triple_chime'
      : parsed.data.settings?.correctSound === 'warm_pop' ? 'warm_pop' : current.correctSound,
    wrongSound: parsed.data.settings?.wrongSound === 'soft_wood_tap' ? 'soft_wood_tap'
      : parsed.data.settings?.wrongSound === 'muted_double' ? 'muted_double' : current.wrongSound,
    direction: normalizeDirection(parsed.data.settings?.direction),
    // 备份里带了实验开关就照它，没带就沿用本机当前状态
    experimental: parsed.data.settings?.experimental === undefined
      ? current.experimental
      : parsed.data.settings.experimental === true
  });
  // 备份是"整体替换"语义：旧版本导出的包里没有这一项，按空表处理，不残留本机旧记录
  saveLessonTimes(getLessonTimesFrom(parsed.data.lessonTimes));
  write(STORAGE_KEYS.meta, { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() });
  return { progressCount: Object.keys(parsed.data.progress).length, mistakeCount: parsed.data.mistakes.length };
}

/** 备份里的成绩记录做一次清洗，非法条目直接丢掉，不让脏数据进本地。 */
function getLessonTimesFrom(value: unknown): Record<string, LessonTimeRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const clean: Record<string, LessonTimeRecord> = {};
  for (const [rawKey, item] of Object.entries(value as Record<string, LessonTimeRecord>)) {
    if (!item || !Number.isFinite(item.avg) || item.avg <= 0) continue;
    const normalized = normalizeTimeKey(rawKey);
    if (!normalized) continue;
    const words = Number.isFinite(item.words) ? Number(item.words) : 0;
    if (!epicRecordFits(normalized.key, words)) continue;
    if (normalized.legacy && clean[normalized.key]) continue;
    const round = normalizeRound(item.round);
    const rank = normalizeRank(item.rank);
    clean[normalized.key] = {
      avg: Number(item.avg),
      words,
      at: Number.isFinite(item.at) ? Number(item.at) : 0,
      ...(round ? { round } : {}),
      ...(rank ? { rank } : {})
    };
  }
  return clean;
}

export function downloadBackup(): string {
  const json = exportBackup();
  // #ifdef H5
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `kaoyan-memory-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  // #endif
  return json;
}
