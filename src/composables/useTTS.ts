import { Capacitor, registerPlugin } from '@capacitor/core';

interface OfflineTTSPlugin {
  speak(options: { text: string }): Promise<void>;
  stop(): Promise<void>;
}
const OfflineTTS = registerPlugin<OfflineTTSPlugin>('OfflineTTS');
let appTts: any = null;
let appReady = false;
let appInitializing: Promise<void> | null = null;

function languagePrompt(): void {
  uni.showModal({
    title: '英文离线语音不可用',
    content: '请在系统设置中安装英文离线语音，并将系统文字转语音引擎设为可用。',
    showCancel: false,
    confirmText: '知道了'
  });
}

function friendlyError(error: any): void {
  const message = String(error?.message || error || '');
  if (/LANG|language|语音|available|NOT_AVAILABLE/i.test(message)) languagePrompt();
  else uni.showToast({ title: message ? `发音失败：${message}` : '发音失败，请检查系统 TTS', icon: 'none', duration: 3000 });
}

function initAppTTS(): Promise<void> {
  if (appReady) return Promise.resolve();
  if (appInitializing) return appInitializing;
  appInitializing = new Promise<void>((resolve, reject) => {
    try {
      const TextToSpeech = plus.android.importClass('android.speech.tts.TextToSpeech');
      const Locale = plus.android.importClass('java.util.Locale');
      const activity = plus.android.runtimeMainActivity();
      const listener = plus.android.implements('android.speech.tts.TextToSpeech$OnInitListener', {
        onInit: (status: number) => {
          if (status !== 0 || !appTts) {
            appInitializing = null;
            reject(new Error('NOT_AVAILABLE'));
            return;
          }
          const availability = appTts.isLanguageAvailable(Locale.US);
          if (availability < 0) {
            appInitializing = null;
            reject(new Error('ERROR_LANGUAGE_MISSING'));
            return;
          }
          appTts.setLanguage(Locale.US);
          appReady = true;
          resolve();
        }
      });
      appTts = new TextToSpeech(activity, listener);
    } catch (error) {
      appInitializing = null;
      reject(error);
    }
  });
  return appInitializing;
}

function withTimeout<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function useTTS() {
  async function speak(rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text) return;
    try {
      if (Capacitor.isNativePlatform()) {
        await withTimeout(
          OfflineTTS.speak({ text }),
          4000,
          '系统语音引擎无响应，请在设置中安装英文离线语音'
        );
        return;
      }
      // #ifdef APP-PLUS
      await initAppTTS();
      const TextToSpeech = plus.android.importClass('android.speech.tts.TextToSpeech');
      const result = appTts.speak(text, TextToSpeech.QUEUE_FLUSH, null, `word-${Date.now()}`);
      if (result === -1) throw new Error('系统 TTS 无法播放');
      return;
      // #endif
      // #ifdef H5
      if (!('speechSynthesis' in window)) throw new Error('当前浏览器不支持系统语音');
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.88;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((item) => item.lang.toLowerCase() === 'en-us') || voices.find((item) => item.lang.startsWith('en'));
      if (voice) utterance.voice = voice;
      utterance.onerror = (event) => friendlyError(event.error || '语音播放被系统中断');
      window.speechSynthesis.speak(utterance);
      return;
      // #endif
      throw new Error('当前平台不支持发音');
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  }

  function stop(): void {
    if (Capacitor.isNativePlatform()) {
      OfflineTTS.stop().catch(() => undefined);
      return;
    }
    // #ifdef APP-PLUS
    if (appTts) appTts.stop();
    // #endif
    // #ifdef H5
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    // #endif
  }

  return { speak, stop };
}
