import { Capacitor, registerPlugin } from '@capacitor/core';

interface ClipboardPluginApi {
  read(): Promise<{ text?: string }>;
}

const Clipboard = registerPlugin<ClipboardPluginApi>('Clipboard');

/**
 * 读系统剪贴板。
 * 原生 App 里走我们自己的 ClipboardPlugin（Android ClipboardManager），
 * 真机上稳定可读；H5 调试环境退回浏览器 API。
 * 读不到返回空串，调用方自行提示。
 */
export async function readClipboard(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Clipboard.read();
      return String(res?.text ?? '');
    } catch {
      // 原生读取失败也往下兜底
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // 浏览器不给读就算了
  }
  return await new Promise<string>((resolve) => {
    try {
      uni.getClipboardData({
        success: (result) => resolve(String(result?.data ?? '')),
        fail: () => resolve('')
      });
    } catch {
      resolve('');
    }
  });
}
