import { describe, expect, it } from 'vitest';
import { nextPlayMode, playModeFromCode, PLAY_MODE_CODE } from '@/utils/playMode';

describe('播放模式映射', () => {
  it('前端模式与原生整数一一对应', () => {
    expect(PLAY_MODE_CODE.order).toBe(0);
    expect(PLAY_MODE_CODE.shuffle).toBe(1);
    expect(PLAY_MODE_CODE.one).toBe(2);
  });

  it('原生整数还原成模式，越界与旧数据按顺序处理', () => {
    expect(playModeFromCode(0)).toBe('order');
    expect(playModeFromCode(1)).toBe('shuffle');
    expect(playModeFromCode(2)).toBe('one');
    expect(playModeFromCode(99)).toBe('order');
    expect(playModeFromCode(undefined)).toBe('order');
    expect(playModeFromCode('1')).toBe('order');
  });

  it('轮转顺序：顺序 → 随机 → 单曲 → 顺序', () => {
    expect(nextPlayMode('order')).toBe('shuffle');
    expect(nextPlayMode('shuffle')).toBe('one');
    expect(nextPlayMode('one')).toBe('order');
  });
});
