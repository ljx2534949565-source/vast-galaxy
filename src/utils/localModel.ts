/**
 * 本地模型的原生能力封装。
 *
 * 建目录、列模型、加载、生成、卸载都走 LocalModelPlugin。
 * 浏览器（H5 调试）没有这些能力，全部降级成明确的"不支持"提示，绝不让页面崩。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface LocalTokenEvent {
  text: string;
  index: number;
  done: boolean;
  error?: string;
}

interface LocalModelPluginApi {
  ensureModelDir(): Promise<{ code?: string; path?: string }>;
  listModels(): Promise<{ models?: ModelFile[]; raw?: number; note?: string }>;
  loadModel(options: { path: string }): Promise<{ ok?: boolean; path?: string }>;
  pickModel(): Promise<{ cancelled?: boolean; path?: string; name?: string }>;
  generate(options: { prompt: string }): Promise<{ text?: string }>;
  unload(): Promise<void>;
  status(): Promise<{ loaded?: boolean; path?: string }>;
  listLocalModels(): Promise<{ models?: StoredModel[] }>;
  deleteLocalModel(options: { name: string }): Promise<{ ok?: boolean }>;
  addListener(eventName: string, listenerFunc: (event: LocalTokenEvent) => void): { remove: () => void };
  removeAllListeners(): Promise<void>;
}

const LocalModel = registerPlugin<LocalModelPluginApi>('LocalModel');

export interface ModelFile {
  name: string;
  size: number;
  path: string;
}

/** App 私有目录里已存的一份模型副本（占"应用数据"空间，可删除） */
export interface StoredModel {
  name: string;
  size: number;
  path: string;
  active: boolean;
}

export interface EnsureDirResult {
  kind: 'ok' | 'needManual' | 'unsupported';
  path: string;
}

/** 教程里统一展示的目标目录 */
export const MODEL_DIR = 'Download/yanci-models';

function native(): boolean {
  return Capacitor.isNativePlatform();
}

/** 建好模型目录 */
export async function ensureModelDir(): Promise<EnsureDirResult> {
  if (!native()) return { kind: 'unsupported', path: MODEL_DIR };
  try {
    const res = await LocalModel.ensureModelDir();
    return res?.code === 'OK'
      ? { kind: 'ok', path: res.path || MODEL_DIR }
      : { kind: 'needManual', path: res?.path || MODEL_DIR };
  } catch {
    return { kind: 'needManual', path: MODEL_DIR };
  }
}

export interface ScanResult {
  models: ModelFile[];
  /** 媒体库扫描到的原始记录数（含非 gguf），用于诊断 */
  raw: number;
  /** 原生层返回的诊断说明，空字符串表示正常 */
  note: string;
}

/** 列出手机上可用的 gguf 模型（带诊断信息） */
export async function scanModels(): Promise<ScanResult> {
  if (!native()) return { models: [], raw: 0, note: '当前不是安卓环境' };
  try {
    const res = await LocalModel.listModels();
    const arr = Array.isArray(res?.models) ? res.models : [];
    const models = arr
      .filter((m) => m && typeof m.path === 'string' && typeof m.name === 'string')
      .map((m) => ({ name: m.name, size: Number(m.size) || 0, path: m.path }));
    return {
      models,
      raw: Number(res?.raw) || 0,
      note: typeof res?.note === 'string' ? res.note : ''
    };
  } catch (e) {
    return { models: [], raw: 0, note: '扫描调用失败：' + ((e as Error)?.message || '未知错误') };
  }
}

/** 只取模型列表，保留旧调用方式 */
export async function listModels(): Promise<ModelFile[]> {
  return (await scanModels()).models;
}

export interface PickResult {
  cancelled: boolean;
  path: string;
  name: string;
}

/** 打开系统文件选择器，让用户自己挑一个 gguf（扫描不到时的兜底） */
export async function pickModel(): Promise<PickResult> {
  if (!native()) return { cancelled: true, path: '', name: '' };
  try {
    const res = await LocalModel.pickModel();
    return {
      cancelled: res?.cancelled === true,
      path: typeof res?.path === 'string' ? res.path : '',
      name: typeof res?.name === 'string' ? res.name : ''
    };
  } catch {
    return { cancelled: true, path: '', name: '' };
  }
}

export interface LoadResult {
  ok: boolean;
  path: string;
  error?: string;
}

/** 加载模型（可能耗时数秒） */
export async function loadModel(path: string): Promise<LoadResult> {
  if (!native()) return { ok: false, path, error: '当前环境不支持本地模型' };
  try {
    const res = await LocalModel.loadModel({ path });
    return { ok: res?.ok === true, path: res?.path || path };
  } catch (e) {
    return { ok: false, path, error: (e as Error)?.message || '加载失败' };
  }
}

/** 生成一句话回答（一次性返回，保留给不需要流式的调用方） */
export async function generate(prompt: string): Promise<{ ok: boolean; text: string; error?: string }> {
  if (!native()) return { ok: false, text: '', error: '当前环境不支持本地模型' };
  try {
    const res = await LocalModel.generate({ prompt });
    return { ok: true, text: String(res?.text ?? '') };
  } catch (e) {
    return { ok: false, text: '', error: (e as Error)?.message || '生成失败' };
  }
}

/**
 * 流式生成：原生每吐出一块就回调一次 onChunk，界面边收边显示。
 *
 * 原生端 generate() 在推理过程中通过 notifyListeners("localToken") 推送增量块，
 * 最后再 resolve 完整文本。这里把两条路都收口：
 *  - 监听 localToken，逐块拼文本并回调；
 *  - 等 generate() 的 Promise 落地（整段生成结束）后移除监听、返回全文。
 *
 * onChunk 只在有增量文本时调用；done 事件不带文本。error 由 generate() 的拒绝
 * 统一处理，这里不重复报错，避免和前端的错误气泡打架。
 */
export async function generateStream(
  prompt: string,
  onChunk: (piece: string, fullText: string) => void
): Promise<{ ok: boolean; text: string; error?: string }> {
  if (!native()) return { ok: false, text: '', error: '当前环境不支持本地模型' };

  let full = '';
  let handle: { remove: () => void } | null = null;
  try {
    handle = LocalModel.addListener('localToken', (event: LocalTokenEvent) => {
      if (!event || typeof event.text !== 'string') return;
      if (event.text) {
        full += event.text;
        onChunk(event.text, full);
      }
    });
    const res = await LocalModel.generate({ prompt });
    return { ok: true, text: String(res?.text ?? full) };
  } catch (e) {
    return { ok: false, text: full, error: (e as Error)?.message || '生成失败' };
  } finally {
    if (handle) {
      try { handle.remove(); } catch { /* 忽略 */ }
    }
  }
}

export async function unloadModel(): Promise<void> {
  if (!native()) return;
  try { await LocalModel.unload(); } catch { /* 忽略 */ }
}

export async function modelStatus(): Promise<{ loaded: boolean; path: string }> {
  if (!native()) return { loaded: false, path: '' };
  try {
    const res = await LocalModel.status();
    return { loaded: res?.loaded === true, path: res?.path || '' };
  } catch {
    return { loaded: false, path: '' };
  }
}

/** 列出 App 私有目录里已存的模型副本（这些才是占"应用数据"空间的大头） */
export async function listStoredModels(): Promise<StoredModel[]> {
  if (!native()) return [];
  try {
    const res = await LocalModel.listLocalModels();
    const arr = Array.isArray(res?.models) ? res.models : [];
    return arr
      .filter((m) => m && typeof m.name === 'string')
      .map((m) => ({
        name: m.name,
        size: Number(m.size) || 0,
        path: typeof m.path === 'string' ? m.path : '',
        active: m.active === true
      }));
  } catch {
    return [];
  }
}

/** 删除一个私有模型副本，释放它占的存储空间；返回是否删成功 */
export async function deleteStoredModel(name: string): Promise<boolean> {
  if (!native()) return false;
  try {
    const res = await LocalModel.deleteLocalModel({ name });
    return res?.ok === true;
  } catch {
    return false;
  }
}

/** 把字节数格式化成给人看的大小 */
export function formatModelSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}
