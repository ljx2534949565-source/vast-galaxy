import { defineStore } from 'pinia';
import words from '@/data/wordsData';
import { addLocalDays, createCard, isDue, reviewByGrade, type Grade, type Sm2Card } from '@/utils/sm2';
import { buildBoard, scopeKey, type ScopeCell, type ScopeMode } from '@/utils/scopes';
import {
  getLessonTimes,
  getMistakes,
  getProgress,
  saveLessonTimes,
  saveMistakes,
  saveProgress,
  type LessonTimeRecord,
  type MistakeItem,
  type MistakeSource,
  type ScopeRank,
  type ScopeRound
} from '@/utils/storage';

export const useProgressStore = defineStore('progress', {
  state: () => ({
    progress: {} as Record<string, Sm2Card>,
    mistakes: [] as MistakeItem[],
    /** 每个背诵块的历史最快平均用时（秒/题），key 是 lesson:1 / unit:3 / chunk:2 / epic:1 / astra:1 */
    scopeTimes: {} as Record<string, LessonTimeRecord>,
    /**
     * 被用户手动点过「重置」、需要用整块词从第 1 题重新走一轮的块。
     * key 同上；只做内存标记，study.scopePool 读到即消费（清掉）。
     * 这样学了半截、还没结算出成绩的块也能真正从头重来。
     */
    restartScopes: {} as Record<string, boolean>,
    loaded: false
  }),
  getters: {
    total: () => words.length,
    cards: (state) => Object.values(state.progress),
    mastered(): number { return this.cards.filter((card) => card.status === 'mastered').length; },
    learning(): number { return this.cards.filter((card) => card.status === 'learning').length; },
    dueCards(): Sm2Card[] { return this.cards.filter((card) => isDue(card)); },
    dueCount(): number { return this.dueCards.length; },
    newCount(): number { return words.filter((word) => !this.progress[String(word.id)]).length; },
    finishedLessons(): number {
      let count = 0;
      for (const cell of this.lessonBoard) if (cell.done) count += 1;
      return count;
    },
    nextLessonPoint(): { unit: number; lesson: number } {
      const next = this.nextLessonToStudy();
      const unit = Math.ceil(next / 4);
      // 课号一律用全局编号（1–40），不要再折回单元内的 1–4，免得和选择器里的 L5 对不上
      return { unit, lesson: next };
    },
    masteredPercent(): number { return this.total > 0 ? Math.round((this.mastered / this.total) * 100) : 0; },
    /**
     * 某个粒度下的全部格子（课 40 / Unit 10 / Chunk 6 / Epic 3 / Astra 1）。
     * 统计在 buildBoard 里只遍历一遍词库，主页每次渲染按需调用。
     */
    boardOf(): (mode: ScopeMode) => ScopeCell[] {
      return (mode: ScopeMode) => buildBoard(mode, this.progress, this.scopeTimes);
    },
    /** 这一块是否按整块完整学过一轮（不是「里面的词都学过」） */
    scopeDone(): (key: string) => boolean {
      return (key: string) => !!this.scopeTimes[key];
    },
    /** 主页课程板的 40 格数据（按课模式） */
    lessonBoard(): ScopeCell[] {
      return this.boardOf('lesson');
    },
    /** 所有已完成课程里最快的一课，用于卡片头部一句话总结 */
    bestLessonAvg(): number | null {
      const values = this.lessonBoard.filter((item) => item.done && item.best).map((item) => item.best as number);
      return values.length ? Math.min(...values) : null;
    }
  },
  actions: {
    init() {
      this.progress = getProgress();
      this.mistakes = getMistakes();
      this.scopeTimes = getLessonTimes();
      this.loaded = true;
    },
    reload() {
      this.init();
    },
    gradeWord(wordId: number, grade: Grade): Sm2Card {
      const key = String(wordId);
      const current = this.progress[key] || createCard(wordId);
      const next = reviewByGrade(current, grade);
      this.progress = { ...this.progress, [key]: next };
      saveProgress(this.progress);
      if (grade === 'forgot') this.recordMistake(wordId, 'study');
      if (grade === 'known') this.removeMistake(wordId);
      return next;
    },
    recordMistake(wordId: number, source: MistakeSource) {
      const existing = this.mistakes.find((item) => item.wordId === wordId);
      if (existing) {
        existing.wrongCount += 1;
        existing.lastWrongAt = Date.now();
        if (!existing.sources.includes(source)) existing.sources.push(source);
        this.mistakes = [...this.mistakes];
      } else {
        this.mistakes = [...this.mistakes, { wordId, wrongCount: 1, lastWrongAt: Date.now(), sources: [source] }];
      }
      saveMistakes(this.mistakes);
    },
    removeMistake(wordId: number) {
      this.mistakes = this.mistakes.filter((item) => item.wordId !== wordId);
      saveMistakes(this.mistakes);
    },
    guessWord(wordId: number): Sm2Card {
      const key = String(wordId);
      const current = this.progress[key] || createCard(wordId);
      const next: Sm2Card = {
        ...current,
        interval: 1,
        repetitions: 0,
        dueDate: addLocalDays(Date.now(), 1),
        status: 'learning',
        lapses: current.lapses + 1,
        lastQuality: 0
      };
      this.progress = { ...this.progress, [key]: next };
      saveProgress(this.progress);
      this.recordMistake(wordId, 'study');
      return next;
    },
    /**
     * 记录一个背诵块的成绩。
     * avg 只有在比历史最快还快时才覆盖；round 则每次完整走完都刷新，
     * 用来在「再次打开已学完的课」时还原同一张结算卡。
     * key 带模式前缀，所以课 / Unit / Chunk / Epic / Astra 的成绩天然互不干扰。
     * @returns 是否刷新了最快记录
     */
    recordScopeTime(key: string, avg: number, words: number, round?: ScopeRound, rank?: ScopeRank): boolean {
      if (!Number.isFinite(avg) || avg <= 0) return false;
      const prev = this.scopeTimes[key];
      const faster = !prev || prev.avg > avg;
      const bestAvg = prev && !faster ? prev.avg : Math.round(avg * 100) / 100;
      const bestAt = prev && !faster ? prev.at : Date.now();
      this.scopeTimes = {
        ...this.scopeTimes,
        [key]: {
          avg: bestAvg,
          words,
          at: bestAt,
          // 明细永远取最近一次：结算页展示的是"这轮打成什么样"，不是历史最快
          ...(round ? { round } : prev?.round ? { round: prev.round } : {}),
          // 称号跟最近一次完整走完的那轮绑定，首页小圆点读的就是它
          ...(rank ? { rank } : prev?.rank ? { rank: prev.rank } : {})
        }
      };
      saveLessonTimes(this.scopeTimes);
      return faster;
    },
    /**
     * 重置一个块：清掉它自己的成绩，并把它包含的词的「已学」标记也清掉，
     * 让这块真正回到 0/N——那几个词会重新变成「没学过」，能再学一遍。
     *
     * 关键区分两类数据，别混为一谈：
     * - progress[wordId]：某个词学没学过（掌握卡片）。它决定首页「3/310」里的 3。
     *   重置必须删掉本块词的这一项，否则那几个词还挂着「已学」，外面还是 3/310，
     *   用户会觉得「重置没用、词找不回来」。删了它们才会回到 0/310、重新可学。
     * - scopeTimes[key]：某个块结算出来的成绩（用时/称号）。按 key 分开存，
     *   删 unit:1 不会动 lesson:1~4 的成绩，所以「重置一个 Unit 不清掉里面 Lesson
     *   的分数」这个约束依然成立。
     *
     * 只删本块 wordIds 的 progress，不动别的词、别的块成绩、错题本。
     *
     * @returns 这块是否确实有「学过或拿过分」的记录可重置
     */
    resetScope(key: string, wordIds?: number[]): boolean {
      // 这块有没有东西可重置：拿过分，或者里面至少有一个词学过
      const hadScore = !!this.scopeTimes[key];
      const hadProgress = !!wordIds?.some((id) => !!this.progress[String(id)]);
      if (!hadScore && !hadProgress) return false;

      if (hadScore) {
        const scopeTimes = { ...this.scopeTimes };
        delete scopeTimes[key];
        this.scopeTimes = scopeTimes;
        saveLessonTimes(scopeTimes);
      }
      // 把本块词打回「未学」：这才是用户理解的「重置」——计数归零、词能重新学。
      // 只删传进来的这批词，绝不动块外的词；其他粒度的成绩本来就不在这里，天然不受影响。
      if (hadProgress && wordIds?.length) {
        const progress = { ...this.progress };
        for (const id of wordIds) delete progress[String(id)];
        this.progress = progress;
        saveProgress(progress);
      }
      // 打上整块重来标记：下一轮 buildQueue 会用它把整块词排进队列
      this.restartScopes = { ...this.restartScopes, [key]: true };
      return true;
    },
    /** scopePool 读到重置标记时取走它，保证只重来一轮、不会次次从头 */
    consumeRestartScope(key: string): boolean {
      if (!this.restartScopes[key]) return false;
      const restarts = { ...this.restartScopes };
      delete restarts[key];
      this.restartScopes = restarts;
      return true;
    },
    /** 兼容旧调用：按课重置 */
    resetLesson(lesson: number): boolean {
      const ids = words.filter((word) => word.lesson === lesson).map((word) => word.id);
      return this.resetScope(scopeKey('lesson', lesson), ids);
    },
    dueWords() {
      const ids = new Set(this.dueCards.map((card) => card.wordId));
      return words.filter((word) => ids.has(word.id));
    },
    newWords(lesson: number) {
      return words.filter((word) => word.lesson === lesson && !this.progress[String(word.id)]);
    },
    lessonsOfUnit(unit: number): number[] {
      return [0, 1, 2, 3].map((offset) => (unit - 1) * 4 + offset + 1);
    },
    lessonStatus(lesson: number) {
      const pool = words.filter((word) => word.lesson === lesson);
      const left = pool.filter((word) => !this.progress[String(word.id)]).length;
      return { total: pool.length, left };
    },
    nextLessonToStudy(): number {
      // 先补还没学过的词；词都学完了，就找还没按整课走过一轮的课
      for (let lesson = 1; lesson <= 40; lesson += 1) {
        if (this.lessonStatus(lesson).left > 0) return lesson;
      }
      for (let lesson = 1; lesson <= 40; lesson += 1) {
        if (!this.scopeTimes[`lesson:${lesson}`]) return lesson;
      }
      return 1;
    },
    mistakeWords() {
      const ids = new Set(this.mistakes.map((item) => item.wordId));
      return words.filter((word) => ids.has(word.id));
    }
  }
});
