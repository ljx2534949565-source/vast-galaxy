import { registerPlugin } from '@capacitor/core';

interface StudyFeedbackPlugin {
  correct(): Promise<{ mode?: string } | void>;
  wrong(): Promise<{ mode?: string } | void>;
  tap(): Promise<{ mode?: string } | void>;
  celebrate(): Promise<{ mode?: string } | void>;
  /** v3.10：播放一段答题音效，name 对应 res/raw 下的资源名（不带扩展名） */
  sound(options: { name: string }): Promise<{ played?: boolean } | void>;
}

const StudyFeedback = registerPlugin<StudyFeedbackPlugin>('StudyFeedback');

/** 触感结果，用于设置页自检显示，定位"到底有没有震"。 */
export type HapticResult = 'native' | 'web' | 'none';

/**
 * 总开关：设置里关掉「触感反馈」后，所有震动入口都在这一层被拦下，
 * 不用每个页面各自判断，也不会漏掉某一条链路。
 */
let hapticEnabled = true;

export function setHapticEnabled(on: boolean): void {
  hapticEnabled = on;
}

export function isHapticEnabled(): boolean {
  return hapticEnabled;
}

/** 网页兜底：安卓 WebView 里 navigator.vibrate 常被系统忽略，所以只作为第二选择。 */
function webVibrate(pattern: number[]): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      // 与原生波形同节奏：[震动, 停顿, 震动, ...]
      return navigator.vibrate(pattern);
    }
  } catch {
    // 浏览器禁用震动时静默跳过，不影响答题流程。
  }
  return false;
}

/**
 * 统一入口。
 *
 * 这里**不判断平台**，直接打原生插件，失败再回落网页 API：
 * 用 Capacitor.isNativePlatform() 做前置判断时，一旦判断失准整条链路就静默失效，
 * 表现是"从始至终没有震动"。让调用本身成为判断依据，才没有静默失败的死角。
 */
async function fire(method: 'correct' | 'wrong' | 'tap' | 'celebrate', pattern: number[]): Promise<HapticResult> {
  if (!hapticEnabled) return 'none';
  try {
    await StudyFeedback[method]();
    return 'native';
  } catch {
    return webVibrate(pattern) ? 'web' : 'none';
  }
}

/**
 * 答对：三下短促「哒-哒-哒」。
 *
 * v2.6.0 按用户手感对调：原来答对是两段加重的「咚咚」，答错是三下急促，
 * 用户反馈「答错像答对、答对像答错」——错了该是拖长的重锤，对了该是轻快的连击。
 * 所以现在答对走三下短促（旧答错波形），答错走两段加重（旧答对波形）。
 */
export function playCorrectFeedback(): Promise<HapticResult> {
  return fire('correct', [28, 62, 28, 62, 34]);
}

/**
 * 答错：45ms「哒」→ 55ms 停顿 → 70ms 加重「哒」。
 * 一顿一沉，像盖章否定，比连击更"沉"，也更符合答错时选项摇头的 320ms。
 */
export function playWrongFeedback(): Promise<HapticResult> {
  return fire('wrong', [45, 55, 70]);
}

/** 轻触：开关、切换、点选这类没有对错的操作用一下极短的点按感 */
export function playTapFeedback(): Promise<HapticResult> {
  return fire('tap', [14]);
}

/** 庆祝：连续三下短促 + 一段长震，用于满分通关的结算 */
export function playCelebrateFeedback(): Promise<HapticResult> {
  return fire('celebrate', [30, 45, 30, 45, 30, 45, 30, 130, 90]);
}

/* ─────────────────────────────────────────────────────────────
 * 答题音效（v3.10）
 * 与震动反馈相互独立：震动总开关 hapticEnabled 不影响音效，反之亦然。
 * 音效总开关默认关，得用户在设置里主动打开；开哪种由 settings store 传入。
 * ───────────────────────────────────────────────────────────── */

/** 音效总开关，默认关 */
let soundEnabled = false;
/** 用户选中的音效：键是 correct / wrong，值是 res/raw 资源名 */
const soundChoice: Record<'correct' | 'wrong', string> = {
  correct: 'correct_02_warm_pop',
  wrong: 'wrong_02_muted_double'
};

/** 设置名 → res/raw 资源名。只认白名单，别的名字回落到默认。 */
const SOUND_ASSETS: Record<string, string> = {
  warm_pop: 'correct_02_warm_pop',
  triple_chime: 'correct_04_triple_chime',
  muted_double: 'wrong_02_muted_double',
  soft_wood_tap: 'wrong_03_soft_wood_tap'
};

export function setSoundEnabled(on: boolean): void {
  soundEnabled = on;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

/** 由 settings store 在 init / 改动时同步选中项；kind 是 correct / wrong */
export function setSoundChoice(kind: 'correct' | 'wrong', name: string): void {
  const asset = SOUND_ASSETS[name];
  if (asset) soundChoice[kind] = asset;
}

/** 播放答对音效（受音效总开关控制） */
export function playCorrectSound(): Promise<void> {
  return playSound(soundChoice.correct);
}

/** 播放答错音效（受音效总开关控制） */
export function playWrongSound(): Promise<void> {
  return playSound(soundChoice.wrong);
}

/** 试听指定设置名（设置页"试听"按钮用，忽略总开关，让人关着也能听效果） */
export function previewSound(name: string): Promise<void> {
  const asset = SOUND_ASSETS[name];
  if (!asset) return Promise.resolve();
  return fireSound(asset);
}

async function playSound(asset: string): Promise<void> {
  if (!soundEnabled) return;
  await fireSound(asset);
}

/** 真正打原生插件；失败静默，绝不影响答题主流程 */
async function fireSound(asset: string): Promise<void> {
  try {
    await StudyFeedback.sound({ name: asset });
  } catch {
    // 音效是可有可无的润色，播不出来就当没这回事
  }
}
