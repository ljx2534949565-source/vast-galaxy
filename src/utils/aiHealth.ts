/**
 * 「这套云端参数到底通没通」的结论。
 *
 * v3.5.6 之前顶部那行小字是写死的「已配置（未验证连通）」：成功聊过一次也
 * 不会变，改了 Key / 地址 / 模型也还是那句，等于一句永远正确但没信息量的废话。
 *
 * 这里把结论落成一条带指纹的记录：
 * - 指纹 = 方案 + 地址 + 模型 + Key，任一变了，旧结论自动作废，回到「未验证」；
 * - 成功回复一次记 okAt，失败记 failAt，谁更近谁算数；
 * - 太久没验证（7 天）也退回「未验证」，避免半年前通一次就永远算连通。
 *
 * 只存一个短字符串和两个时间戳，不占空间，也不进备份包。
 */
import type { AiConfig } from '@/utils/ai';

export const AI_HEALTH_KEY = 'ky_v1_ai_health';

/** 超过这个时间没再成功过，就重新标回「未验证」 */
export const HEALTH_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AiHealth {
  /** 上次验证时的配置指纹；空表示从没验证过 */
  fingerprint: string;
  /** 最近一次成功回复的时间 */
  okAt: number;
  /** 最近一次失败的时间 */
  failAt: number;
  /** 失败摘要，仅供排查，不上界面 */
  failReason: string;
}

export type AiHealthState = 'unknown' | 'ok' | 'failed';

export function emptyHealth(): AiHealth {
  return { fingerprint: '', okAt: 0, failAt: 0, failReason: '' };
}

/**
 * 配置指纹：只用来判「还是不是同一套参数」，不做安全用途。
 * DJB2 够短，碰撞概率对这个场景无所谓。
 */
export function aiFingerprint(config: AiConfig): string {
  const raw = [config.provider ?? '', config.apiBase, config.model, config.apiKey].join('\u0001');
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) + hash + raw.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

/** 这套参数当前的连通结论 */
export function healthState(health: AiHealth, config: AiConfig, now = Date.now()): AiHealthState {
  if (!config.provider) return 'unknown';
  if (!health.fingerprint || health.fingerprint !== aiFingerprint(config)) return 'unknown';
  if (health.failAt > health.okAt) return 'failed';
  if (!health.okAt) return 'unknown';
  if (now - health.okAt > HEALTH_STALE_MS) return 'unknown';
  return 'ok';
}

function normalizeTime(value: unknown): number {
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? Math.floor(time) : 0;
}

export function normalizeHealth(value: unknown): AiHealth {
  const data = (value ?? {}) as Partial<AiHealth>;
  return {
    fingerprint: typeof data.fingerprint === 'string' ? data.fingerprint : '',
    okAt: normalizeTime(data.okAt),
    failAt: normalizeTime(data.failAt),
    failReason: typeof data.failReason === 'string' ? data.failReason.slice(0, 120) : ''
  };
}

export function readAiHealth(): AiHealth {
  try {
    const raw = uni.getStorageSync(AI_HEALTH_KEY);
    if (!raw) return emptyHealth();
    return normalizeHealth(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return emptyHealth();
  }
}

export function saveAiHealth(health: AiHealth): void {
  try {
    uni.setStorageSync(AI_HEALTH_KEY, normalizeHealth(health));
  } catch {
    // 存不了就只在本次会话里记着，不影响对话
  }
}

/** 成功回复：指纹跟着当前配置走，顺手把之前的失败记录清掉 */
export function healthOnOk(config: AiConfig, at = Date.now()): AiHealth {
  return { fingerprint: aiFingerprint(config), okAt: at, failAt: 0, failReason: '' };
}

/** 失败：保留上次成功时间，但失败更近，结论会翻成 failed */
export function healthOnFail(previous: AiHealth, config: AiConfig, reason: string, at = Date.now()): AiHealth {
  return {
    fingerprint: aiFingerprint(config),
    okAt: previous.fingerprint === aiFingerprint(config) ? previous.okAt : 0,
    failAt: at,
    failReason: String(reason ?? '').slice(0, 120)
  };
}
