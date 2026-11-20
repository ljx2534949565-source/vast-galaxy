import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const bucket = new Map<string, unknown>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => (bucket.has(key) ? bucket.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => void bucket.set(key, value),
  removeStorageSync: (key: string) => void bucket.delete(key)
});

const { useLabStore } = await import('@/stores/lab');

const FOLLOW_KEY = 'ky_v1_follow_ups_enabled';

describe('追问建议开关', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    bucket.clear();
  });

  it('默认开启——没存过 / 读不到都当开', () => {
    const lab = useLabStore();
    lab.init();
    expect(lab.followUpsEnabled).toBe(true);
  });

  it('显式存过 false 才是关闭', () => {
    bucket.set(FOLLOW_KEY, false);
    const lab = useLabStore();
    lab.init();
    expect(lab.followUpsEnabled).toBe(false);
  });

  it('关掉后写进本机，再初始化仍是关', () => {
    const lab = useLabStore();
    lab.init();
    lab.setFollowUpsEnabled(false);
    expect(bucket.get(FOLLOW_KEY)).toBe(false);

    setActivePinia(createPinia());
    const again = useLabStore();
    again.init();
    expect(again.followUpsEnabled).toBe(false);
  });

  it('关掉时清掉已有回答上的追问，重新打开不影响', () => {
    const lab = useLabStore();
    lab.init();
    lab.chat = [
      { role: 'user', content: 'affect 和 effect 区别？', at: 1 },
      { role: 'assistant', content: 'affect 是动词…', at: 2, followUps: ['能举个例子吗？', '还有近义词吗？'] }
    ];
    lab.setFollowUpsEnabled(false);
    expect(lab.chat[1].followUps).toBeUndefined();

    lab.chat[1].followUps = ['重新生成的追问'];
    lab.setFollowUpsEnabled(true);
    expect(lab.chat[1].followUps).toEqual(['重新生成的追问']);
  });
});
