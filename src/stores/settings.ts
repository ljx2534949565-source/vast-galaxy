import { defineStore } from 'pinia';
import {
  clearBackground,
  deleteWallpaper as deleteWallpaperRecord,
  getBackground,
  getSettings,
  getPhotoTone,
  getWallpapers,
  initStorage,
  savePhotoTone,
  saveSettings,
  useWallpaper,
  useWallpaperById,
  normalizeBgDim,
  normalizeGlassMode,
  normalizeTheme,
  BG_DIM_DEFAULT,
  GLASS_DEFAULT,
  GLASS_MODE_DEFAULT,
  type BgDim,
  type DimMode,
  type GlassMode,
  type ThemeMode,
  type WallpaperItem
} from '@/utils/storage';
import { applySystemBars } from '@/utils/systemBars';
import {
  ACCENT_THEME_DEFAULT,
  applyAccentTheme,
  normalizeAccentTheme,
  type AccentThemeName
} from '@/utils/accentTheme';
import { setHapticEnabled, setSoundEnabled, setSoundChoice } from '@/utils/feedback';
import { DEFAULT_DIRECTION, flipDirection, type DirectionMode } from '@/utils/direction';

function systemTheme(): 'light' | 'dark' {
  // #ifdef H5
  // 原生壳在系统明暗切换时会写这个标记（WebView 的 matchMedia 不一定会跟着变）
  const native = (window as unknown as { __nativeDark?: boolean }).__nativeDark;
  if (typeof native === 'boolean') return native ? 'dark' : 'light';
  if (window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  // #endif
  try {
    return uni.getSystemInfoSync().theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * 三档主题：自动跟随系统，或手动锁死浅色 / 深色。
 * 监听只绑一次，H5 用 matchMedia，原生用 uni.onThemeChange；
 * 只有「自动」档才吃系统事件，手动档下系统换了外观也不动。
 */
let themeWatcherBound = false;
function watchSystemTheme(onChange: () => void) {
  if (themeWatcherBound) return;
  themeWatcherBound = true;
  // #ifdef H5
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', onChange);
  // #endif
  // #ifndef H5
  (uni as unknown as { onThemeChange?: (handler: () => void) => void }).onThemeChange?.(onChange);
  // #endif
}

// [最小浓度, 最大浓度]：两端都要比旧版三档更极端
const PHOTO_ALPHA: Record<'light' | 'dark', [number, number]> = {
  light: [0.015, 0.90],
  dark: [0.04, 0.94]
};

/**
 * 滑块同时改照片遮罩和玻璃表面：
 * 左端照片几乎原色、卡片接近裸玻璃；右端照片被压暗、卡片变成实底。
 */
function alphaAt(dim: number, range: [number, number]): number {
  const ratio = normalizeBgDim(dim) / 100;
  return range[0] + (range[1] - range[0]) * ratio;
}

/** 采样缩小后的照片亮度，只用来决定玻璃上配深字还是浅字 */
const photoToneCache = new Map<string, boolean>();
let tonePending = '';
/**
 * DOM 上当前这套颜色是不是「明暗未判定」时的兜底值。
 * v3.6.6：换壁纸那一瞬间判定还没回来，applyBackground() 只能拿深色中性顶住；
 * 等判定回来时，如果只看「photoDark 变没变」就会漏掉重绘 —— 浅色壁纸判出来
 * 也是 false，和兜底时的 false 一样，于是深色兜底一直留在页面上，要等下一次
 * apply()（通常是离开设置页）才刷新。这个标记就是专门用来识别这种情况的。
 */
let toneFallback = false;
/**
 * 换壁纸的请求序号。预判明暗是异步的，用户可能连着点第二张，
 * 回来晚的那次不能把界面拽回旧壁纸。
 */
let wallpaperSeq = 0;

function detectPhotoDark(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef H5
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve(false);
        context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let sum = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          sum += (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
        }
        resolve(sum / (pixels.length / 4) < 0.48);
      } catch {
        resolve(false);
      }
    };
    image.onerror = () => resolve(false);
    image.src = dataUrl;
    // #endif
    // #ifndef H5
    resolve(false);
    // #endif
  });
}

/**
 * 把一张壁纸的明暗算出来并落盘。
 * 失败静默：调用方退回「深色兜底 + 判定回来补重绘」，最多是闪一下，不会没配色。
 */
async function primePhotoTone(dataUrl: string): Promise<void> {
  if (!dataUrl) return;
  if (photoToneCache.has(dataUrl)) return;
  if (getPhotoTone(dataUrl) !== undefined) return;
  try {
    const dark = await detectPhotoDark(dataUrl);
    photoToneCache.set(dataUrl, dark);
    savePhotoTone(dataUrl, dark);
  } catch {
    /* 采样失败：applyBackground() 里会走兜底 + 判定回来补重绘 */
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    mode: 'system' as ThemeMode,
    resolved: 'light' as 'light' | 'dark',
    /** 全局控件主色调：按预设同时更新渐变、透明叠色与光晕 */
    accent: ACCENT_THEME_DEFAULT as AccentThemeName,
    background: '',
    /** 所有曾设置的壁纸，按最近使用排序 */
    wallpapers: [] as WallpaperItem[],
    /** 当前壁纸整体偏暗时为 true，玻璃换浅色文字与深色烟熏底 */
    photoDark: false,
    /** 壁纸雾化程度 0–100 */
    bgDim: BG_DIM_DEFAULT as BgDim,
    /** 控件玻璃质感 0–100，和雾化各走一个滑块 */
    glass: GLASS_DEFAULT as BgDim,
    /** 三档预设 / 手动滑块，两种操控方式互斥高亮（两个滑块共用一个状态） */
    dimMode: 'preset' as DimMode,
    /** 控件玻璃质感：fog 雾玻璃 / liquid 液态玻璃 */
    glassMode: GLASS_MODE_DEFAULT as GlassMode,
    /** 玻璃质感总开关：关掉后全局 none backdrop-filter + 实色底，给低端机提速 */
    glassEffect: true,
    /** 答对后自动翻到下一题（学习页读取） */
    autoNext: false,
    /** 触感反馈总开关 */
    haptic: true,
    /** 答题音效总开关（默认关） */
    sound: false,
    /** 答对音效：warm_pop / triple_chime */
    correctSound: 'warm_pop' as string,
    /** 答错音效：muted_double / soft_wood_tap */
    wrongSound: 'muted_double' as string,
    /** 背诵方向：en2zh / zh2en / random（学习页与测验页的三档拨杆） */
    direction: DEFAULT_DIRECTION as DirectionMode,
    /** 实验性功能总开关：控制底部功能栏与设置里的实验选项是否出现 */
    experimental: false
  }),
  actions: {
    init() {
      initStorage();
      const saved = getSettings();
      this.mode = saved.theme;
      this.accent = saved.accent;
      this.bgDim = saved.bgDim;
      this.glass = saved.glass;
      this.dimMode = saved.dimMode;
      this.glassMode = saved.glassMode;
      this.glassEffect = saved.glassEffect;
      this.autoNext = saved.autoNext;
      this.haptic = saved.haptic;
      this.sound = saved.sound;
      this.correctSound = saved.correctSound;
      this.wrongSound = saved.wrongSound;
      this.direction = saved.direction;
      this.experimental = saved.experimental === true;
      setHapticEnabled(this.haptic);
      setSoundEnabled(this.sound);
      setSoundChoice('correct', this.correctSound);
      setSoundChoice('wrong', this.wrongSound);
      this.background = getBackground();
      this.wallpapers = getWallpapers();
      watchSystemTheme(() => {
        if (this.mode === 'system') this.apply();
      });
      // #ifdef H5
      // 原生壳切换系统外观时会派发这个事件，拿到 uiMode 后重新套一次色
      window.addEventListener('native-theme-change', () => {
        if (this.mode === 'system') this.apply();
      });
      // #endif
      this.apply();
    },
    /** 三个设置项一起落盘，避免某个入口漏写字段 */
    persist() {
      saveSettings({
        theme: this.mode,
        accent: this.accent,
        bgDim: this.bgDim,
        glass: this.glass,
        dimMode: this.dimMode,
        glassMode: this.glassMode,
        glassEffect: this.glassEffect,
        autoNext: this.autoNext,
        haptic: this.haptic,
        sound: this.sound,
        correctSound: this.correctSound,
        wrongSound: this.wrongSound,
        direction: this.direction,
        experimental: this.experimental
      });
    },
    apply() {
      // resolved 才是真正生效的那一档：自动档问系统，手动档直接用选中的值
      this.resolved = this.mode === 'system' ? systemTheme() : this.mode;
      // #ifdef H5
      document.documentElement.dataset.theme = this.resolved;
      document.documentElement.style.colorScheme = this.resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', this.resolved === 'dark' ? '#0E1520' : '#E8EEF7');
      applyAccentTheme(this.accent, this.resolved);
      // #endif
      this.applyGlass();
      this.applyBackground();
      applySystemBars(this.resolved);
    },
    /**
     * 玻璃质感：两种模式共用同一根透明度滑块，只在「厚薄」上分岔——
     * 雾玻璃越往后越糊、越实；液态玻璃始终薄透，靠更高的饱和与亮度做出玻璃感。
     */
    applyGlass() {
      // #ifdef H5
      const root = document.documentElement;
      // 玻璃总开关：关掉后给根节点挂标记，具体「关模糊 + 换实色」由 App.vue 的
      // html.glass-off 规则统一处理。用根节点 class 是因为 backdrop-filter 散落在
      // 各页面组件里，逐个改不现实；一个 class 全局兜住最稳。
      root.classList.toggle('glass-off', !this.glassEffect);
      const liquid = this.glassMode === 'liquid';
      const ratio = normalizeBgDim(this.glass) / 100;
      root.classList.toggle('glass-liquid', liquid);
      root.classList.toggle('glass-fog', !liquid);
      const blur = liquid ? 3 + ratio * 7 : 13 + ratio * 17;
      root.style.setProperty('--glass-blur', `${blur.toFixed(1)}px`);
      // 题卡比小控件再糊一点，同一个变量乘 1.8，两种质感都能跟着滑块走
      root.style.setProperty('--glass-blur-strong', `${(blur * 1.8).toFixed(1)}px`);
      root.style.setProperty('--glass-sat', `${Math.round(liquid ? 240 + ratio * 40 : 180 + ratio * 40)}%`);
      root.style.setProperty('--glass-bright', `${(liquid ? 106 + ratio * 4 : 100).toFixed(0)}%`);
      // #endif
    },
    /** 手动切档：立刻套色并落盘，下次启动还是这一档 */
    setThemeMode(mode: ThemeMode) {
      this.mode = normalizeTheme(mode);
      this.persist();
      this.apply();
    },
    /** 切换整套控件渐变并落盘；不改变壁纸、明暗模式或对错状态色 */
    setAccentTheme(name: AccentThemeName) {
      this.accent = normalizeAccentTheme(name);
      this.persist();
      this.apply();
    },
    /** 从后台回来时补一次：自动档下系统在后台换了明暗，WebView 不一定收到 change */
    refreshTheme() {
      if (this.mode !== 'system') return;
      if (systemTheme() !== this.resolved) this.apply();
    },
    syncPhotoTone(dataUrl: string) {
      // #ifdef H5
      const root = document.documentElement;
      const cached = photoToneCache.get(dataUrl);
      if (cached !== undefined) {
        this.photoDark = cached;
        root.classList.toggle('photo-dark', cached);
        root.classList.toggle('photo-light', !cached);
        return;
      }
      // v3.5.2：冷启动优先同步读落盘判定，首帧就套对配色，不必等图片解码采样。
      // 这样「划掉后台后重进」不会再出现「先白后深」的一帧发白闪烁。
      const persisted = getPhotoTone(dataUrl);
      if (persisted !== undefined) {
        photoToneCache.set(dataUrl, persisted);
        this.photoDark = persisted;
        root.classList.toggle('photo-dark', persisted);
        root.classList.toggle('photo-light', !persisted);
        return;
      }
      if (tonePending === dataUrl) return;
      tonePending = dataUrl;
      void detectPhotoDark(dataUrl).then((dark) => {
        photoToneCache.set(dataUrl, dark);
        savePhotoTone(dataUrl, dark);
        if (this.background !== dataUrl) return;
        tonePending = '';
        // 值没变也要重绘的情况：上一帧写进 DOM 的是「未判定」的兜底深色，
        // 现在知道了真实明暗（哪怕是浅色），配色得跟着落到真值上
        const changed = dark !== this.photoDark || toneFallback;
        this.photoDark = dark;
        root.classList.toggle('photo-dark', dark);
        root.classList.toggle('photo-light', !dark);
        // 判定没变（且当前不是兜底色）就别重绘，省掉一次无谓的全屏刷新
        if (changed) this.applyBackground();
      });
      // #endif
    },
    applyBackground() {
      // #ifdef H5
      const root = document.documentElement;
      if (!this.background) {
        this.photoDark = false;
        toneFallback = false;
        root.classList.remove('has-photo', 'photo-dark', 'photo-light');
        root.style.removeProperty('--bg-photo');
        root.style.removeProperty('--photo-a');
        root.style.removeProperty('--photo-b');
        root.style.removeProperty('--surface');
        root.style.removeProperty('--surface-strong');
        root.style.removeProperty('--surface-soft');
        root.style.removeProperty('--dialog-fill');
        root.style.removeProperty('--dialog-fill-2');
        return;
      }
      this.syncPhotoTone(this.background);
      const dark = this.resolved === 'dark';
      // 两个滑块各管一半：雾化只压照片，玻璃只改控件表面
      const alpha = alphaAt(this.bgDim, PHOTO_ALPHA[dark ? 'dark' : 'light']);
      // v3.5.2：明暗判定还没就绪（换新壁纸 / 刚升级还没缓存）时，首帧用深色中性顶住，
      // 绝不先铺一层白雾再切深色 —— 那正是「整个壁纸发白闪一下」的样子。
      const toneKnown = photoToneCache.has(this.background);
      // 记下这一帧用的是不是兜底色：异步判定回来时靠它决定要不要补一次重绘
      toneFallback = !toneKnown;
      const tint = dark || this.photoDark
        ? '10, 17, 27'
        : toneKnown ? '248, 251, 255' : '18, 28, 42';
      const ratio = normalizeBgDim(this.glass) / 100;
      // 液态玻璃整体更透：同一个滑块刻度下，表面比雾玻璃低一档，照片能透上来
      const liquid = this.glassMode === 'liquid';
      // 玻璃表面跟着滑：左端接近裸玻璃，右端接近实底；深色照片换烟熏底，浅字才立得住
      const surface = this.photoDark
        ? (liquid ? 0.20 + ratio * 0.44 : 0.34 + ratio * 0.50)
        : dark
          ? (liquid ? 0.12 + ratio * 0.56 : 0.22 + ratio * 0.64)
          : (liquid ? 0.10 + ratio * 0.56 : 0.18 + ratio * 0.64);
      const strong = this.photoDark
        ? (liquid ? 0.40 + ratio * 0.40 : 0.58 + ratio * 0.38)
        : dark
          ? (liquid ? 0.28 + ratio * 0.52 : 0.42 + ratio * 0.54)
          : (liquid ? 0.24 + ratio * 0.56 : 0.38 + ratio * 0.58);
      const soft = this.photoDark
        ? (liquid ? 0.12 + ratio * 0.24 : 0.22 + ratio * 0.28)
        : dark
          ? (liquid ? 0.04 + ratio * 0.30 : 0.10 + ratio * 0.36)
          : (liquid ? 0.03 + ratio * 0.30 : 0.08 + ratio * 0.36);
      const surfaceTint = dark || this.photoDark
        ? '16, 27, 43'
        : toneKnown ? '255, 255, 255' : '26, 38, 54';
      root.style.setProperty('--bg-photo', `url("${this.background}")`);
      root.style.setProperty('--photo-a', `rgba(${tint}, ${alpha})`);
      root.style.setProperty('--photo-b', `rgba(${tint}, ${Math.min(alpha + 0.12, 0.97)})`);
      root.style.setProperty('--surface', `rgba(${surfaceTint}, ${surface})`);
      root.style.setProperty('--surface-strong', `rgba(${surfaceTint}, ${strong})`);
      root.style.setProperty('--surface-soft', `rgba(${surfaceTint}, ${soft})`);
      // 底栏与弹窗用 dialog-fill 当实底：深色照片上必须跟着换成烟熏玻璃，
      // 否则浅色主题 + 深色壁纸会出现「白底 + 浅字」整块看不清
      root.style.setProperty('--dialog-fill', `rgba(${surfaceTint}, ${strong})`);
      root.style.setProperty('--dialog-fill-2', `rgba(${surfaceTint}, ${surface})`);
      root.classList.add('has-photo');
      // #endif
    },
    setBackground(dataUrl: string) {
      wallpaperSeq += 1;
      this.wallpapers = useWallpaper(dataUrl);
      this.background = dataUrl;
      this.applyBackground();
    },
    /**
     * 换一张新导入的壁纸。
     * 先把明暗算完再落盘，applyBackground() 第一次拿到的就是真值 ——
     * 否则「未知 → 深色兜底 → 判定回来再改浅」会在换图那一下闪一道深色。
     * 图片刚压缩过，解码结果还在内存里，这一步通常只有几十毫秒。
     */
    async setBackgroundWarm(dataUrl: string) {
      const seq = ++wallpaperSeq;
      await primePhotoTone(dataUrl);
      // 期间又换了别的：这次结果作废，别把界面拽回上一张
      if (seq !== wallpaperSeq) return;
      this.wallpapers = useWallpaper(dataUrl);
      this.background = dataUrl;
      this.applyBackground();
    },
    async selectWallpaper(id: string) {
      const seq = ++wallpaperSeq;
      const dataUrl = useWallpaperById(id);
      this.wallpapers = getWallpapers();
      // 切过的历史壁纸基本都有落盘判定，这里通常是空操作；
      // 只有换机迁移来的存档才会真的等一次采样
      await primePhotoTone(dataUrl);
      if (seq !== wallpaperSeq) return;
      this.background = dataUrl;
      this.applyBackground();
    },
    removeBackground() {
      wallpaperSeq += 1;
      clearBackground();
      this.background = '';
      this.applyBackground();
    },
    async deleteWallpaper(id: string) {
      const seq = ++wallpaperSeq;
      const dataUrl = deleteWallpaperRecord(id);
      this.wallpapers = getWallpapers();
      // 删掉的若是当前背景，会顺位切到另一张；同样先把明暗备好再套
      await primePhotoTone(dataUrl);
      if (seq !== wallpaperSeq) return;
      this.background = dataUrl;
      this.applyBackground();
    },
    /** 一键整理历史壁纸后，重新读一遍落盘结果（当前背景可能是 id 引用） */
    async refreshWallpapers() {
      const seq = ++wallpaperSeq;
      const dataUrl = getBackground();
      this.wallpapers = getWallpapers();
      // 压缩会给每张图重新编码，dataUrl 全变、判定缓存全部失效：
      // 不先补算就会整套界面按「未知」铺一帧深色
      await primePhotoTone(dataUrl);
      if (seq !== wallpaperSeq) return;
      this.background = dataUrl;
      this.applyBackground();
    },
    /**
     * mode 默认 custom：只要动了滑块就接管操控权，三档按钮随之置灰。
     * 点三档预设请走 setDimPreset()，不要直接调这里。
     */
    setBgDim(dim: BgDim, save = true, mode: DimMode = 'custom') {
      this.bgDim = normalizeBgDim(dim);
      this.dimMode = mode;
      if (save) this.persist();
      this.applyBackground();
    },
    /** 控件玻璃质感滑块 */
    setGlass(value: BgDim, save = true, mode: DimMode = 'custom') {
      this.glass = normalizeBgDim(value);
      this.dimMode = mode;
      if (save) this.persist();
      this.applyGlass();
      this.applyBackground();
    },
    /** 雾玻璃 / 液态玻璃：只换表面质感，不动透明度刻度 */
    setGlassMode(mode: GlassMode) {
      this.glassMode = normalizeGlassMode(mode);
      this.persist();
      this.applyGlass();
      this.applyBackground();
    },
    /** 玻璃质感总开关：关掉后全局去模糊 + 实色底，低端机省去每帧背景重采样 */
    setGlassEffect(on: boolean) {
      this.glassEffect = on === true;
      this.persist();
      this.applyGlass();
    },
    /** 点三档之一：两个滑块一起停在对应刻度，但仍置灰待用户继续微调 */
    setDimPreset(dim: BgDim) {
      this.bgDim = normalizeBgDim(dim);
      this.glass = normalizeBgDim(dim);
      this.dimMode = 'preset';
      this.persist();
      this.applyGlass();
      this.applyBackground();
    },
    /** 手指刚碰到滑轨就切到手动模式，哪怕只是点了一下没拖动 */
    takeOverDim() {
      if (this.dimMode === 'custom') return;
      this.dimMode = 'custom';
      this.persist();
    },
    setHaptic(on: boolean) {
      this.haptic = on;
      setHapticEnabled(on);
      this.persist();
    },
    setSound(on: boolean) {
      this.sound = on;
      setSoundEnabled(on);
      this.persist();
    },
    setCorrectSound(name: string) {
      this.correctSound = name;
      setSoundChoice('correct', name);
      this.persist();
    },
    setWrongSound(name: string) {
      this.wrongSound = name;
      setSoundChoice('wrong', name);
      this.persist();
    },
    setAutoNext(on: boolean) {
      this.autoNext = on;
      this.persist();
    },
    setDirection(direction: DirectionMode) {
      this.direction = direction;
      this.persist();
    },
    /** 实验性功能：关掉时不做任何清理，AI 配置与曲库原样留着，下次打开还在 */
    setExperimental(on: boolean) {
      this.experimental = on === true;
      this.persist();
    },
    flipDirection() {
      this.setDirection(flipDirection(this.direction));
    },
    restore() {
      const saved = getSettings();
      this.mode = saved.theme;
      this.accent = saved.accent;
      this.bgDim = saved.bgDim;
      this.glass = saved.glass;
      this.dimMode = saved.dimMode;
      this.glassMode = saved.glassMode;
      this.glassEffect = saved.glassEffect;
      this.autoNext = saved.autoNext;
      this.haptic = saved.haptic;
      this.sound = saved.sound;
      this.correctSound = saved.correctSound;
      this.wrongSound = saved.wrongSound;
      this.direction = saved.direction;
      this.experimental = saved.experimental === true;
      setHapticEnabled(this.haptic);
      setSoundEnabled(this.sound);
      setSoundChoice('correct', this.correctSound);
      setSoundChoice('wrong', this.wrongSound);
      this.background = getBackground();
      this.wallpapers = getWallpapers();
      this.apply();
    }
  }
});
