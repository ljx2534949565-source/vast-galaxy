import { beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = new Map<string, unknown>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => (bucket.has(key) ? bucket.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => void bucket.set(key, value),
  removeStorageSync: (key: string) => void bucket.delete(key)
});

const { defaultAiConfig } = await import('@/utils/ai');
const {
  AI_HEALTH_KEY,
  HEALTH_STALE_MS,
  aiFingerprint,
  emptyHealth,
  healthOnFail,
  healthOnOk,
  healthState,
  normalizeHealth,
  readAiHealth,
  saveAiHealth
} = await import('@/utils/aiHealth');

/** 一套能用的云端参数 */
function cloud(overrides: Record<string, unknown> = {}) {
  return {
    ...defaultAiConfig(),
    provider: 'cloud' as const,
    network: true,
    apiKey: 'sk-abcdefghijklmnopqrstuvwx',
    apiBase: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    ...overrides
  };
}

describe('aiFingerprint：配置一变就换指纹', () => {
  it('同一套参数指纹稳定', () => {
    expect(aiFingerprint(cloud())).toBe(aiFingerprint(cloud()));
  });

  it('换 Key / 地址 / 模型 / 方案，指纹都会变', () => {
    const base = aiFingerprint(cloud());
    expect(aiFingerprint(cloud({ apiKey: 'sk-zzzzzzzzzzzzzzzzzzzzzzzz' }))).not.toBe(base);
    expect(aiFingerprint(cloud({ apiBase: 'https://api.moonshot.cn' }))).not.toBe(base);
    expect(aiFingerprint(cloud({ model: 'deepseek-reasoner' }))).not.toBe(base);
    expect(aiFingerprint(cloud({ provider: null }))).not.toBe(base);
  });
});

describe('healthState：真实连通结论', () => {
  const now = 1_700_000_000_000;

  it('从没验证过 = unknown', () => {
    expect(healthState(emptyHealth(), cloud(), now)).toBe('unknown');
  });

  it('没有方案也 = unknown', () => {
    const health = { fingerprint: aiFingerprint(cloud()), okAt: now, failAt: 0, failReason: '' };
    expect(healthState(health, cloud({ provider: null }), now)).toBe('unknown');
  });

  it('成功过一次 = ok', () => {
    const health = healthOnOk(cloud(), now);
    expect(healthState(health, cloud(), now + 1000)).toBe('ok');
  });

  it('失败比成功更近 = failed', () => {
    const ok = healthOnOk(cloud(), now - 5000);
    const failed = healthOnFail(ok, cloud(), 'HTTP 401', now);
    expect(healthState(failed, cloud(), now + 1000)).toBe('failed');
  });

  it('失败之后又成功 = 翻回 ok，并清掉失败原因', () => {
    const failed = healthOnFail(emptyHealth(), cloud(), 'HTTP 401', now);
    const ok = healthOnOk(cloud(), now + 1000);
    expect(healthState(ok, cloud(), now + 2000)).toBe('ok');
    expect(ok.failReason).toBe('');
    expect(failed.failReason).toBe('HTTP 401');
  });

  it('换了配置，旧的「已连通」立刻作废', () => {
    const health = healthOnOk(cloud(), now);
    expect(healthState(health, cloud({ model: 'deepseek-reasoner' }), now + 1000)).toBe('unknown');
  });

  it('太久没验证（超过 7 天）退回 unknown', () => {
    const health = healthOnOk(cloud(), now);
    expect(healthState(health, cloud(), now + HEALTH_STALE_MS - 1)).toBe('ok');
    expect(healthState(health, cloud(), now + HEALTH_STALE_MS + 1)).toBe('unknown');
  });
});

describe('healthOnFail：保留同一套参数的上次成功时间', () => {
  it('同一套参数失败，okAt 仍在（用于判断先后）', () => {
    const ok = healthOnOk(cloud(), 1000);
    const failed = healthOnFail(ok, cloud(), '超时', 2000);
    expect(failed.okAt).toBe(1000);
    expect(failed.failAt).toBe(2000);
  });

  it('换了参数再失败，不能继承旧参数的成功记录', () => {
    const ok = healthOnOk(cloud(), 1000);
    const failed = healthOnFail(ok, cloud({ model: 'other-model' }), '超时', 2000);
    expect(failed.okAt).toBe(0);
    expect(failed.fingerprint).toBe(aiFingerprint(cloud({ model: 'other-model' })));
  });
});

describe('存储与容错', () => {
  beforeEach(() => bucket.clear());

  it('读不到时返回空记录', () => {
    expect(readAiHealth()).toEqual(emptyHealth());
  });

  it('存进去能读出来', () => {
    const health = healthOnOk(cloud(), 1234);
    saveAiHealth(health);
    expect(readAiHealth()).toEqual(health);
  });

  it('坏数据不炸，字段逐项兜底', () => {
    bucket.set(AI_HEALTH_KEY, { fingerprint: 42, okAt: 'x', failAt: -1, failReason: 'a'.repeat(400) });
    const health = readAiHealth();
    expect(health.fingerprint).toBe('');
    expect(health.okAt).toBe(0);
    expect(health.failAt).toBe(0);
    expect(health.failReason.length).toBe(120);
  });

  it('normalizeHealth 接受 JSON 字符串以外的对象', () => {
    expect(normalizeHealth(null)).toEqual(emptyHealth());
    expect(normalizeHealth({ okAt: 1.9 })).toEqual({ fingerprint: '', okAt: 1, failAt: 0, failReason: '' });
  });
});
