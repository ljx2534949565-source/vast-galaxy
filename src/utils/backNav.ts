/**
 * 安卓系统返回键 ↔ 网页二级界面的桥接。
 *
 * AI 的一级/二级只是 Vue 里的状态切换，不是路由，原生 WebView.canGoBack() 认不出来，
 * 以前按系统返回键会直接退出到桌面。现在网页把「是否停在二级对话页」告诉原生
 * （BackNavPlugin.setChat），原生据此在 onBackPressed 里发 nativeBack 事件，
 * 网页收到后自己退回一级。H5 调试环境没有原生，退回 window 的 popstate/自定义事件。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface BackNavPluginApi {
  setChat(options: { active: boolean }): Promise<void>;
  addListener(eventName: string, listenerFunc: (event: { source?: string }) => void): { remove: () => void };
}

const BackNav = registerPlugin<BackNavPluginApi>('BackNav');

/** 告诉原生：当前是否停在 AI 二级对话页 */
export function setChatActive(active: boolean): void {
  if (!Capacitor.isNativePlatform()) return;
  void BackNav.setChat({ active }).catch(() => {
    // 原生桥没就绪时忽略，不影响页面内返回按钮（它走正常 click）
  });
}

/**
 * 监听「系统返回键」事件：原生发 nativeBack，H5 调试用 window 自定义事件。
 * 返回的函数用于卸载时移除监听。
 */
export function onSystemBack(handler: () => void): () => void {
  let removed = false;
  const cleanups: Array<() => void> = [];

  if (Capacitor.isNativePlatform()) {
    const handle = BackNav.addListener('nativeBack', () => {
      if (!removed) handler();
    });
    cleanups.push(() => handle.remove());
  } else {
    const onEvent = () => handler();
    window.addEventListener('ky-native-back', onEvent);
    cleanups.push(() => window.removeEventListener('ky-native-back', onEvent));
  }

  return () => {
    if (removed) return;
    removed = true;
    cleanups.forEach((fn) => fn());
  };
}
