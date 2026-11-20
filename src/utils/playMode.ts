/** 播放模式：顺序（列表轮播）/ 随机 / 单曲循环 */
export type PlayMode = 'order' | 'shuffle' | 'one';

/** 前端模式 → 原生整数，与 MusicPlayerPlugin.java 的 MODE_* 常量对应 */
export const PLAY_MODE_CODE: Record<PlayMode, number> = { order: 0, shuffle: 1, one: 2 };

/** 原生整数 → 前端模式；越界或旧数据一律按顺序处理 */
export function playModeFromCode(code: unknown): PlayMode {
  return code === 1 ? 'shuffle' : code === 2 ? 'one' : 'order';
}

/** 点一下模式按钮时的轮转顺序：顺序 → 随机 → 单曲 → 顺序 */
export function nextPlayMode(current: PlayMode): PlayMode {
  return current === 'order' ? 'shuffle' : current === 'shuffle' ? 'one' : 'order';
}
