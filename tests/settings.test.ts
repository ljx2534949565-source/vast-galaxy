import { beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = new Map<string, unknown>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => (bucket.has(key) ? bucket.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => void bucket.set(key, value),
  removeStorageSync: (key: string) => void bucket.delete(key)
});

const { getSettings, saveSettings } = await import('@/utils/storage');

describe('答对自动下一题设置', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认关闭——自动翻页会改变答题节奏，得用户自己开', () => {
    expect(getSettings().autoNext).toBe(false);
  });

  it('打开后能读回，且不影响主题字段', () => {
    saveSettings({ theme: 'system', glassMode: 'fog', glass: 50, haptic: true, bgDim: 25, dimMode: 'preset', autoNext: true, direction: 'zh2en' });
    const saved = getSettings();
    expect(saved.autoNext).toBe(true);
    expect(saved.theme).toBe('system');
    expect(saved.bgDim).toBe(25);
    expect(saved.direction).toBe('zh2en');
  });

  it('旧存档没有这个字段时按关闭处理', () => {
    bucket.set('ky_v1_settings', { theme: 'light', bgDim: 'normal' });
    expect(getSettings().autoNext).toBe(false);
  });

  it('脏数据不会被当成开启', () => {
    bucket.set('ky_v1_settings', { theme: 'light', bgDim: 'normal', autoNext: 'yes' });
    expect(getSettings().autoNext).toBe(false);
  });
});

describe('背诵方向设置', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认是看英文选中文——和以前的行为一致', () => {
    expect(getSettings().direction).toBe('en2zh');
  });

  it('切成中→英之后能读回，且不碰其它字段', () => {
    saveSettings({ theme: 'system', glassMode: 'fog', glass: 50, haptic: true, bgDim: 75, dimMode: 'custom', autoNext: true, direction: 'zh2en' });
    const saved = getSettings();
    expect(saved.direction).toBe('zh2en');
    expect(saved.autoNext).toBe(true);
    expect(saved.bgDim).toBe(75);
  });

  it('老存档没有方向字段，按看英文选中文处理', () => {
    bucket.set('ky_v1_settings', { theme: 'dark', bgDim: 'normal', autoNext: false });
    expect(getSettings().direction).toBe('en2zh');
  });

  it('认不出的值一律回落到默认方向', () => {
    bucket.set('ky_v1_settings', { direction: 'ZH2EN' });
    expect(getSettings().direction).toBe('en2zh');
    bucket.set('ky_v1_settings', { direction: 1 });
    expect(getSettings().direction).toBe('en2zh');
  });
});

describe('背景与玻璃浓度滑块', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认落在滑轨正中', () => {
    expect(getSettings().bgDim).toBe(50);
  });

  it('旧版三档自动换算为滑块位置', () => {
    bucket.set('ky_v1_settings', { bgDim: 'soft' });
    expect(getSettings().bgDim).toBe(25);
    bucket.set('ky_v1_settings', { bgDim: 'normal' });
    expect(getSettings().bgDim).toBe(50);
    bucket.set('ky_v1_settings', { bgDim: 'strong' });
    expect(getSettings().bgDim).toBe(75);
  });

  it('新的数值刻度可以自由落在两端', () => {
    saveSettings({ theme: 'system', glassMode: 'fog', glass: 50, haptic: true, bgDim: 0, dimMode: 'custom', autoNext: false, direction: 'en2zh' });
    expect(getSettings().bgDim).toBe(0);
    saveSettings({ theme: 'system', glassMode: 'fog', glass: 50, haptic: true, bgDim: 100, dimMode: 'custom', autoNext: false, direction: 'en2zh' });
    expect(getSettings().bgDim).toBe(100);
  });

  it('越界数字会夹回 0–100，小数取整', () => {
    bucket.set('ky_v1_settings', { bgDim: 137 });
    expect(getSettings().bgDim).toBe(100);
    bucket.set('ky_v1_settings', { bgDim: -9 });
    expect(getSettings().bgDim).toBe(0);
    bucket.set('ky_v1_settings', { bgDim: 62.4 });
    expect(getSettings().bgDim).toBe(62);
  });

  it('脏值和旧版认不出的值回落默认', () => {
    bucket.set('ky_v1_settings', { bgDim: 'glass' });
    expect(getSettings().bgDim).toBe(50);
    bucket.set('ky_v1_settings', { bgDim: '' });
    expect(getSettings().bgDim).toBe(50);
    bucket.set('ky_v1_settings', { bgDim: null });
    expect(getSettings().bgDim).toBe(50);
  });
});

describe('深色模式三档', () => {
  beforeEach(() => {
    bucket.clear();
  });

  const write = (theme: unknown) =>
    saveSettings({ theme: theme as 'system', glassMode: 'fog', bgDim: 50, dimMode: 'preset', autoNext: false, direction: 'en2zh' });

  it('自动 / 浅色 / 深色都能存能读', () => {
    write('light');
    expect(getSettings().theme).toBe('light');
    write('dark');
    expect(getSettings().theme).toBe('dark');
    write('system');
    expect(getSettings().theme).toBe('system');
  });

  it('老存档里的手动值原样认回来，不会被强行改回自动', () => {
    bucket.set('ky_v1_settings', { theme: 'dark', bgDim: 'normal' });
    expect(getSettings().theme).toBe('dark');
  });

  it('认不出的值回到自动', () => {
    bucket.set('ky_v1_settings', { theme: 'AUTO', bgDim: 'normal' });
    expect(getSettings().theme).toBe('system');
    bucket.set('ky_v1_settings', { theme: 1, bgDim: 'normal' });
    expect(getSettings().theme).toBe('system');
  });
});

describe('三档预设与滑块两种操控方式', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认是预设模式，落在「标准」50', () => {
    const settings = getSettings();
    expect(settings.dimMode).toBe('preset');
    expect(settings.bgDim).toBe(50);
  });

  it('旧版三档字符串迁移为预设模式', () => {
    bucket.set('ky_v1_settings', { bgDim: 'soft' });
    expect(getSettings().dimMode).toBe('preset');
    bucket.set('ky_v1_settings', { bgDim: 'strong' });
    expect(getSettings().bgDim).toBe(75);
    expect(getSettings().dimMode).toBe('preset');
  });

  it('v2.4.x 的数字刻度迁移为手动模式', () => {
    bucket.set('ky_v1_settings', { bgDim: 37 });
    const settings = getSettings();
    expect(settings.bgDim).toBe(37);
    expect(settings.dimMode).toBe('custom');
  });

  it('显式写入的模式优先于推断', () => {
    bucket.set('ky_v1_settings', { bgDim: 80, dimMode: 'preset' });
    expect(getSettings().dimMode).toBe('preset');
    bucket.set('ky_v1_settings', { bgDim: 50, dimMode: 'custom' });
    expect(getSettings().dimMode).toBe('custom');
  });

  it('认不出的模式按旧数据推断', () => {
    bucket.set('ky_v1_settings', { bgDim: 'glass', dimMode: 'auto' });
    expect(getSettings().dimMode).toBe('preset');
  });
});

describe('雾化与玻璃拆成两个滑块', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('两个值默认都是 50，各自独立', () => {
    const settings = getSettings();
    expect(settings.bgDim).toBe(50);
    expect(settings.glass).toBe(50);
  });

  it('老存档只有一个 bgDim：玻璃按同一个刻度补齐，观感不变', () => {
    bucket.set('ky_v1_settings', { bgDim: 72, autoNext: false });
    const settings = getSettings();
    expect(settings.bgDim).toBe(72);
    expect(settings.glass).toBe(72);
  });

  it('写入后两个滑块互不覆盖', () => {
    saveSettings({ theme: 'system', glassMode: 'fog', bgDim: 12, glass: 88, dimMode: 'custom', autoNext: false, haptic: true, direction: 'en2zh' });
    const settings = getSettings();
    expect(settings.bgDim).toBe(12);
    expect(settings.glass).toBe(88);
  });

  it('玻璃的脏值回落默认，而不是拖累雾化', () => {
    bucket.set('ky_v1_settings', { bgDim: 30, glass: 'glass' });
    const settings = getSettings();
    expect(settings.bgDim).toBe(30);
    expect(settings.glass).toBe(50);
  });
});

describe('触感反馈开关', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认开启——老用户升级后手感不该突然消失', () => {
    expect(getSettings().haptic).toBe(true);
  });

  it('关掉后能读回 false', () => {
    saveSettings({ theme: 'system', glassMode: 'fog', bgDim: 50, glass: 50, dimMode: 'preset', autoNext: false, haptic: false, direction: 'en2zh' });
    expect(getSettings().haptic).toBe(false);
  });

  it('脏数据不会被当成关闭', () => {
    bucket.set('ky_v1_settings', { haptic: 'off' });
    expect(getSettings().haptic).toBe(true);
  });
});

describe('玻璃质感切换', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认是雾玻璃，和升级前的观感一致', () => {
    expect(getSettings().glassMode).toBe('fog');
  });

  it('切到液态玻璃后能读回', () => {
    saveSettings({ theme: 'system', glassMode: 'liquid', bgDim: 50, glass: 60, dimMode: 'preset', autoNext: false, haptic: true, direction: 'en2zh' });
    const settings = getSettings();
    expect(settings.glassMode).toBe('liquid');
    // 质感与透明度互不干扰
    expect(settings.glass).toBe(60);
  });

  it('脏值回到雾玻璃，不会留一个不存在的模式', () => {
    bucket.set('ky_v1_settings', { glassMode: 'crystal', glass: 40 });
    expect(getSettings().glassMode).toBe('fog');
    expect(getSettings().glass).toBe(40);
  });

  it('老存档没有这个字段时也按雾玻璃处理', () => {
    bucket.set('ky_v1_settings', { bgDim: 30, glass: 30, dimMode: 'preset' });
    expect(getSettings().glassMode).toBe('fog');
  });
});

describe('实验性功能总开关', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认关闭——新东西不该在升级后自己冒出来', () => {
    expect(getSettings().experimental).toBe(false);
  });

  it('打开后能读回，且不影响主题与触感', () => {
    saveSettings({
      theme: 'dark', glassMode: 'liquid', glass: 75, haptic: false,
      bgDim: 25, dimMode: 'preset', autoNext: false, direction: 'en2zh', experimental: true
    });
    const saved = getSettings();
    expect(saved.experimental).toBe(true);
    expect(saved.theme).toBe('dark');
    expect(saved.haptic).toBe(false);
  });

  it('脏数据不会被当成开启', () => {
    bucket.set('ky_v1_settings', { theme: 'system', experimental: 'yes' });
    expect(getSettings().experimental).toBe(false);
  });

  it('老存档没有这个字段，按关闭处理', () => {
    bucket.set('ky_v1_settings', { theme: 'light', autoNext: true });
    expect(getSettings().experimental).toBe(false);
    expect(getSettings().autoNext).toBe(true);
  });
});

describe('turnBlur 已彻底移除（v3.7.1）', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('设置对象里不再有这个字段', () => {
    expect('turnBlur' in getSettings()).toBe(false);
  });

  it('老存档里残留 true 也不会被读回来，其他字段照常', () => {
    bucket.set('ky_v1_settings', { theme: 'light', experimental: true, turnBlur: true });
    const saved = getSettings();
    expect('turnBlur' in saved).toBe(false);
    expect(saved.experimental).toBe(true);
    expect(saved.theme).toBe('light');
  });

  it('重新保存一次之后，存档里的残留字段被整体覆盖掉', () => {
    bucket.set('ky_v1_settings', { theme: 'light', turnBlur: true });
    saveSettings({ ...getSettings(), theme: 'dark' });
    const raw = bucket.get('ky_v1_settings') as Record<string, unknown>;
    expect(raw.turnBlur).toBeUndefined();
    expect(raw.theme).toBe('dark');
  });
});

describe('答题音效设置（v3.10）', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认关闭，答对答错都是第一种', () => {
    const s = getSettings();
    expect(s.sound).toBe(false);
    expect(s.correctSound).toBe('warm_pop');
    expect(s.wrongSound).toBe('muted_double');
  });

  it('保存后能读出开启状态和选择', () => {
    saveSettings({ ...getSettings(), sound: true, correctSound: 'triple_chime', wrongSound: 'soft_wood_tap' });
    const s = getSettings();
    expect(s.sound).toBe(true);
    expect(s.correctSound).toBe('triple_chime');
    expect(s.wrongSound).toBe('soft_wood_tap');
  });

  it('认不出的音效名回落到默认，不吞掉开启状态', () => {
    bucket.set('ky_v1_settings', { sound: true, correctSound: 'hacked', wrongSound: 'xxx' });
    const s = getSettings();
    expect(s.sound).toBe(true);
    expect(s.correctSound).toBe('warm_pop');
    expect(s.wrongSound).toBe('muted_double');
  });
});

describe('玻璃质感总开关（v3.10.1）', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('默认开启——老用户升级后观感不变', () => {
    expect(getSettings().glassEffect).toBe(true);
  });

  it('关掉后能读回，且不碰玻璃浓度那些字段', () => {
    saveSettings({ ...getSettings(), glassEffect: false, glass: 75, bgDim: 50 });
    const s = getSettings();
    expect(s.glassEffect).toBe(false);
    expect(s.glass).toBe(75);
    expect(s.bgDim).toBe(50);
  });

  it('老存档没有这个字段时按开启处理', () => {
    bucket.set('ky_v1_settings', { theme: 'light', glassMode: 'fog' });
    expect(getSettings().glassEffect).toBe(true);
  });

  it('只有明确的 false 才算关闭，脏值一律按开启', () => {
    bucket.set('ky_v1_settings', { glassEffect: 'no' });
    expect(getSettings().glassEffect).toBe(true);
    bucket.set('ky_v1_settings', { glassEffect: 0 });
    expect(getSettings().glassEffect).toBe(true);
    bucket.set('ky_v1_settings', { glassEffect: false });
    expect(getSettings().glassEffect).toBe(false);
  });
});

describe('控件渐变主题色设置', () => {
  beforeEach(() => {
    bucket.clear();
  });

  it('老存档默认星云紫，升级后观感不变', () => {
    bucket.set('ky_v1_settings', { theme: 'light', bgDim: 50 });
    expect(getSettings().accent).toBe('violet');
  });

  it('选择后能保存读回，不影响深浅色和玻璃设置', () => {
    saveSettings({ ...getSettings(), accent: 'rose', theme: 'dark', glass: 66 });
    const saved = getSettings();
    expect(saved.accent).toBe('rose');
    expect(saved.theme).toBe('dark');
    expect(saved.glass).toBe(66);
  });

  it('不存在的主题名和已删除的灰色回到默认，不把非法颜色写进界面', () => {
    bucket.set('ky_v1_settings', { accent: 'hacked' });
    expect(getSettings().accent).toBe('violet');
    bucket.set('ky_v1_settings', { accent: 'slate' });
    expect(getSettings().accent).toBe('violet');
  });
});
