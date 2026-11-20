/**
 * 三个板块的唯一来源：编号 + 底栏视觉顺序。
 *
 * 编号（tab 值）决定页面渲染与存储，视觉顺序决定底栏从左到右的排列，
 * 也决定左右滑动的方向语义 —— 手指往右滑就露出视觉上左边那一块。
 * 两边共用这一份定义，避免底栏和手势各说各话。
 */
export interface TabItem {
  index: number;
  label: string;
  icon: string;
}

/** 从左到右：AI、单词、音乐 */
export const TAB_ITEMS: TabItem[] = [
  { index: 1, label: 'AI', icon: 'spark' },
  { index: 0, label: '单词', icon: 'book' },
  { index: 2, label: '音乐', icon: 'music' }
];

/** 视觉顺序对应的 tab 值，手势按这个数组前后挪一格 */
export const TAB_ORDER: number[] = TAB_ITEMS.map((item) => item.index);
