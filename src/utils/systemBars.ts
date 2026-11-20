import { Capacitor, registerPlugin } from '@capacitor/core';

interface SystemBarsPlugin {
  getInsets(): Promise<{ top: number; bottom: number }>;
  setLightBackground(options: { light: boolean }): Promise<void>;
}

const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');

let currentTheme: 'light' | 'dark' = 'light';

/**
 * 原生端：WebView 已铺满整屏，这里把状态栏 / 手势条高度写成 CSS 变量。
 * 横竖屏切换后系统栏位置会变（竖屏吃顶部、横屏常吃侧边），所以要能重复取。
 */
export function refreshSystemBars(): void {
  if (!Capacitor.isNativePlatform()) return;
  const root = document.documentElement;

  const readInsets = (attempt: number) => {
    SystemBars.getInsets()
      .then((insets) => {
        const top = Math.max(0, Math.round(Number(insets?.top) || 0));
        const bottom = Math.max(0, Math.round(Number(insets?.bottom) || 0));
        if (top > 0 || attempt >= 4) {
          root.style.setProperty('--inset-top', `${top}px`);
          root.style.setProperty('--inset-bottom', `${bottom}px`);
          return;
        }
        window.setTimeout(() => readInsets(attempt + 1), 120);
      })
      .catch(() => {});
  };

  readInsets(0);
}

/**
 * 让状态栏图标颜色跟随明暗主题，并把安全区变量填上。
 * 浏览器里直接跳过，交给 env(safe-area-inset-*)。
 */
export function applySystemBars(theme: 'light' | 'dark'): void {
  currentTheme = theme;
  if (!Capacitor.isNativePlatform()) return;
  refreshSystemBars();
  SystemBars.setLightBackground({ light: currentTheme === 'light' }).catch(() => {});
}
