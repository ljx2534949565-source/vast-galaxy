import words from '@/data/wordsData';
import type { WordItem } from '@/utils/quiz';
import { paceRank } from '@/utils/pace';

/**
 * 背诵粒度。同一个词库按五种方式切块，成绩按 key 分开存，互不影响：
 * - lesson：一课（约 73 词），40 块
 * - unit：一个 Unit（4 课），10 块
 * - chunk：每 500 词一块（按词库顺序切片），6 块
 * - epic：前后两半——前 20 课 / 后 20 课（即 Unit 1–5 / Unit 6–10），2 块
 * - astra：全部 2931 词，1 块，整块乱序
 */
export type ScopeMode = 'lesson' | 'unit' | 'chunk' | 'epic' | 'astra';

export const CHUNK_SIZE = 500;
/** 词库固定 10 个 Unit、每个 Unit 4 课，按课切块与按 Unit 切块共用这两个常量 */
export const UNIT_COUNT = 10;
export const LESSONS_PER_UNIT = 4;
/**
 * Epic 一块覆盖 5 个 Unit。
 * 原来按「每 1000 词」切 3 块，用户觉得三块之间没有语义；改成按 Unit 对半分：
 * 前 5 个 Unit（第 1–20 课）一块、后 5 个 Unit（第 21–40 课）一块。
 */
export const EPIC_UNITS = 5;
export const EPIC_BLOCKS = UNIT_COUNT / EPIC_UNITS;
/** Astra 一轮从全词里随机抽这么多题：2931 题一次背不完，抽 100 才能反复刷分 */
export const ASTRA_ROUND = 100;

export const SCOPE_MODES: Array<{ key: ScopeMode; label: string; noun: string }> = [
  // 用户要求这一档走英文，和 Unit / Chunk / Epic / Astra 排在一起更像一套刻度
  { key: 'lesson', label: 'Lesson', noun: 'Lessons' },
  { key: 'unit', label: 'Unit', noun: 'Units' },
  { key: 'chunk', label: 'Chunk', noun: 'Chunks' },
  { key: 'epic', label: 'Epic', noun: 'Epics' },
  { key: 'astra', label: 'Astra', noun: 'Astra' }
];

export interface ScopeDef {
  mode: ScopeMode;
  id: number;
  /** 存储键，如 lesson:1、chunk:3；成绩按它分开记 */
  key: string;
  /** 格子里的短标：1 / U1 / C1 / E1 / Astra */
  label: string;
  /** 答题页标题 */
  name: string;
  words: WordItem[];
}

export interface ScopeCell {
  id: number;
  key: string;
  label: string;
  total: number;
  left: number;
  /**
   * 这一块自己完整学过一轮（有本粒度的成绩记录）。
   * 注意：不是「里面的词都学过」——把 Unit 的 4 个 Lesson 学完，Unit 仍然不算学完，
   * 必须按整块走一轮才算。五种粒度彼此独立，互不代劳。
   */
  done: boolean;
  /** 没按整块学过，但里面的词已经全部学过：首页提示「推荐学习」 */
  recommend: boolean;
  /**
   * 词都学过、自己没成绩，但它所属的上级块（Unit）已经按整块走过一轮。
   * 这种情况说明是「先做大的」带学了这些词：按绿框「完成」显示，但不显示分数，
   * 也不写「推荐学习」——和 recommend 互斥。
   */
  inherited: boolean;
  best: number | null;
  /** 这一块拿到的称号；没学过就是 null，首页也就不画小圆点 */
  rank: { title: string; dot: string } | null;
}

export function scopeKey(mode: ScopeMode, id: number): string {
  return `${mode}:${id}`;
}

/** 旧版本只存了纯数字键（课时），读出来统一补上 lesson: 前缀 */
export function parseScopeKey(key: string): { mode: ScopeMode; id: number } | null {
  const match = /^(lesson|unit|chunk|epic|astra):(\d+)$/.exec(key);
  if (match) return { mode: match[1] as ScopeMode, id: Number(match[2]) };
  if (/^\d+$/.test(key)) return { mode: 'lesson', id: Number(key) };
  return null;
}

export function normalizeScopeKey(key: string): string | null {
  const parsed = parseScopeKey(key);
  return parsed ? scopeKey(parsed.mode, parsed.id) : null;
}

function chunkCount(size: number): number {
  return Math.max(1, Math.ceil(words.length / size));
}

function build(mode: ScopeMode): ScopeDef[] {
  const pool = words as WordItem[];
  if (mode === 'astra') {
    return [{ mode, id: 1, key: scopeKey(mode, 1), label: 'Astra', name: `Astra · 全词乱序（每轮 ${ASTRA_ROUND} 题）`, words: pool }];
  }
  if (mode === 'chunk') {
    const size = CHUNK_SIZE;
    const total = chunkCount(size);
    return Array.from({ length: total }, (_, position) => {
      const id = position + 1;
      const start = position * size + 1;
      const end = Math.min(pool.length, (position + 1) * size);
      return {
        mode,
        id,
        key: scopeKey(mode, id),
        label: `C${id}`,
        name: `Chunk ${id} · 第 ${start}–${end} 词`,
        words: pool.slice(start - 1, end)
      };
    });
  }
  if (mode === 'epic') {
    const lessonsPerHalf = EPIC_UNITS * LESSONS_PER_UNIT;
    return Array.from({ length: EPIC_BLOCKS }, (_, position) => {
      const id = position + 1;
      const from = position * EPIC_UNITS + 1;
      const to = from + EPIC_UNITS - 1;
      return {
        mode,
        id,
        key: scopeKey(mode, id),
        label: `E${id}`,
        // 标题只留短语，太长会在学习页被省略号截断；Unit 区间由页面上的 stageLabel 显示
        name: `Epic ${id} · ${id === 1 ? '前' : '后'} ${lessonsPerHalf} 课`,
        words: pool.filter((word) => {
          const unit = word.unit ?? 1;
          return unit >= from && unit <= to;
        })
      };
    });
  }
  if (mode === 'unit') {
    return Array.from({ length: UNIT_COUNT }, (_, position) => {
      const id = position + 1;
      return {
        mode,
        id,
        key: scopeKey(mode, id),
        label: `U${id}`,
        name: `Unit ${id} · ${LESSONS_PER_UNIT} 课`,
        words: pool.filter((word) => word.unit === id)
      };
    });
  }
  return Array.from({ length: UNIT_COUNT * LESSONS_PER_UNIT }, (_, position) => {
    const id = position + 1;
    const unit = Math.ceil(id / LESSONS_PER_UNIT);
    return {
      mode,
      id,
      key: scopeKey(mode, id),
      label: String(id),
      name: `Unit ${unit} · Lesson ${id - (unit - 1) * LESSONS_PER_UNIT}`,
      words: pool.filter((word) => word.lesson === id)
    };
  });
}

/** 词库是静态的，切块结果缓存住；主页每次渲染都重建 40 个数组没必要 */
const cache = new Map<ScopeMode, ScopeDef[]>();

export function scopesOf(mode: ScopeMode): ScopeDef[] {
  const hit = cache.get(mode);
  if (hit) return hit;
  const built = build(mode);
  cache.set(mode, built);
  return built;
}

export function scopeOf(mode: ScopeMode, id: number): ScopeDef | null {
  return scopesOf(mode).find((scope) => scope.id === id) ?? null;
}

/** 一个词属于哪个块：chunk 按词库顺序切片，epic 按 Unit 归属，所以要分开算 */
function keyOfWord(mode: ScopeMode, word: WordItem, position: number): string {
  if (mode === 'astra') return scopeKey('astra', 1);
  if (mode === 'chunk') return scopeKey('chunk', Math.floor(position / CHUNK_SIZE) + 1);
  if (mode === 'epic') {
    const block = Math.min(EPIC_BLOCKS, Math.ceil((word.unit ?? 1) / EPIC_UNITS));
    return scopeKey('epic', block);
  }
  if (mode === 'unit') return scopeKey('unit', word.unit);
  return scopeKey('lesson', word.lesson ?? 0);
}

/**
 * 课程板数据。只遍历词库一次——逐块过滤会让主页每次渲染扫 40 遍 2931 词。
 */
export function buildBoard(
  mode: ScopeMode,
  progress: Record<string, unknown>,
  times: Record<string, { avg: number; rank?: { title: string; dot: string } }>
): ScopeCell[] {
  const list = scopesOf(mode);
  const stats = new Map<string, { total: number; left: number }>();
  for (const scope of list) stats.set(scope.key, { total: 0, left: 0 });
  const pool = words as WordItem[];
  for (let position = 0; position < pool.length; position += 1) {
    const word = pool[position];
    const entry = stats.get(keyOfWord(mode, word, position));
    if (!entry) continue;
    entry.total += 1;
    if (!progress[String(word.id)]) entry.left += 1;
  }
  return list.map((scope) => {
    const entry = stats.get(scope.key)!;
    const record = times[scope.key];
    // 有成绩记录 = 这一块按整块走完过。词被别的粒度学过不算数
    const hasRecord = !!record && Number.isFinite(record.avg);
    const allLearned = entry.total > 0 && entry.left === 0;

    // Lesson 粒度专用：词都学过、这课自己没走过一轮时，看是谁把这些词带会的。
    // 若所属 Unit 已经按整块走过，说明用户是「先做大再带小」：这些课按完成显示（绿框、无分数），
    // 而不是「推荐学习」。反过来 Unit 自己没成绩、只是 4 课学完了，仍走 recommend 那条路。
    let inherited = false;
    if (mode === 'lesson' && !hasRecord && allLearned) {
      const unit = Math.ceil(scope.id / LESSONS_PER_UNIT);
      const unitRecord = times[scopeKey('unit', unit)];
      inherited = !!unitRecord && Number.isFinite(unitRecord.avg);
    }

    return {
      id: scope.id,
      key: scope.key,
      label: scope.label,
      total: entry.total,
      left: entry.left,
      done: hasRecord,
      // 词都学过了、但这块自己还没走过一轮：值得推荐，但不冒充「已完成」。
      // 已被上级 Unit 带会的课不再推荐，交给 inherited 走绿框显示。
      recommend: !hasRecord && allLearned && !inherited,
      inherited,
      best: hasRecord ? (record as { avg: number }).avg : null,
      // 老存档只存了最快均速，没有称号：按均速补一个，升级后历史课程也能亮起圆点
      rank: hasRecord ? (record?.rank ?? rankFromAvg((record as { avg: number }).avg)) : null
    };
  });
}

/** 只按速度反推称号：老记录没有正确率，只能给出速度这一档 */
function rankFromAvg(avg: number): { title: string; dot: string } | null {
  const rank = paceRank(avg);
  return rank.title ? { title: rank.title, dot: rank.dot } : null;
}

/** 有成绩的块里最快的一个，用于卡片右上角那句话 */
export function bestOf(cells: ScopeCell[]): number | null {
  const values = cells.filter((cell) => cell.best).map((cell) => cell.best as number);
  return values.length ? Math.min(...values) : null;
}

/** 已学完的块数 */
export function doneCount(cells: ScopeCell[]): number {
  return cells.filter((cell) => cell.done).length;
}
