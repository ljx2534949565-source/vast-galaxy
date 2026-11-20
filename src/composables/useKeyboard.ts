/**
 * 软键盘高度 → 全局 CSS 变量 + <html> 状态类。
 *
 * 背景：v3.5.0 起 manifest 用 adjustNothing，键盘弹出时 WebView 布局视口**完全不变**，
 * 所以底栏、输入条这些 position:fixed 元素不会再被一起顶到键盘上方，滚动聊天时也不会漂移。
 * 代价是网页必须自己知道键盘有多高，才能只把 AI 输入条抬到键盘上沿。
 *
 * 两条高度通道，取较大值（互不覆盖）：
 *  - 原生：SystemBarsPlugin 读 WindowInsets.Type.ime()，派发 nativekeyboard 事件。
 *  - H5 / 兜底：window.visualViewport 的可见高度差。部分安卓机型 IME inset 拿不到时
 *    visualViewport 仍然会缩，反之亦然，取 max 最稳。
 * 另外暴露 window.__setKeyboardHeight(n) 供端到端测试直接模拟。
 */
const VAR = '--keyboard-height';
const OPEN_CLASS = 'keyboard-open';
/** 只有 AI 聊天输入条可见时才锁窗（v3.5.1），别误伤设置页弹窗 / 单词页备份框 */
const CHAT_CLASS = 'keyboard-chat';
/** 小于这个高度多半是地址栏收放或手势条，不是键盘 */
const MIN_KEYBOARD = 80;

let installed = false;

/** 聊天输入条当前是否真的可见：三个 tab 都在 DOM 里，隐藏的那个 rect 为 0；
 *  独立页面（设置页）弹键盘时首页整体隐藏，同样是 0。 */
function chatComposerVisible(): boolean {
  const el = document.querySelector('.ai-page .composer');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function useKeyboard(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  let nativeHeight = 0;
  let viewportHeight = 0;

  let wasOpen = false;

  const render = () => {
    const height = Math.max(nativeHeight, viewportHeight);
    const shown = height >= MIN_KEYBOARD ? height : 0;
    // 必须在挂 keyboard-chat 之前读：body 一变 fixed，window.scrollY 立刻被清成 0。
    // 弹出前用户正看到哪一段，就靠这个数在锁窗后原样还原（v3.5.4）。
    const scrollBefore = window.scrollY;
    const root = document.documentElement;
    root.style.setProperty(VAR, `${shown}px`);
    const open = shown > 0;
    root.classList.toggle(OPEN_CLASS, open);
    // 锁窗只在「AI 聊天输入条可见」时开：设置页的 AI 配置弹窗、单词页的
    // 备份输入框也会弹键盘，但它们不该被压成一屏，仍走原来的弹窗适配。
    root.classList.toggle(CHAT_CLASS, open && chatComposerVisible());
    // 键盘开合的瞬间通知页面：AI 面板要切换滚动宿主、还原原来的位置。
    // 只在状态翻转时派发，避免每次 resize 都打扰页面。
    if (open !== wasOpen) {
      wasOpen = open;
      window.dispatchEvent(new CustomEvent('keyboardchange', { detail: { open, height: shown, chat: root.classList.contains(CHAT_CLASS), scrollBefore } }));
    }
  };

  // 通道一：原生 IME inset
  window.addEventListener('nativekeyboard', (event) => {
    const detail = (event as CustomEvent<{ height?: number }>).detail;
    nativeHeight = Math.max(0, Math.round(Number(detail?.height) || 0));
    render();
  });

  // 通道二：visualViewport（H5 与部分原生 WebView 都有效）
  const measure = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    viewportHeight = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    render();
  };
  window.visualViewport?.addEventListener('resize', measure);
  window.visualViewport?.addEventListener('scroll', measure);
  window.addEventListener('resize', measure);

  // 端到端测试用的手动注入口：浏览器里没法真的弹键盘
  (window as unknown as { __setKeyboardHeight?: (px: number) => void }).__setKeyboardHeight = (px) => {
    nativeHeight = Math.max(0, Math.round(Number(px) || 0));
    render();
  };

  render();
}
