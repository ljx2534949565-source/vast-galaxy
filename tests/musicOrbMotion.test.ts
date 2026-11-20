import { describe, expect, it } from 'vitest';
import {
  advanceOrbPhase,
  BLOB_PHASE_RATIO,
  clampOrbPosition,
  EMPTY_ORB_PULSE,
  nextOrbPulse,
  normalizeOrbAudio,
  type OrbPhase
} from '@/utils/musicOrbMotion';

describe('悬浮球拖动边界', () => {
  it('保留屏幕内的拖动位置', () => {
    expect(clampOrbPosition({ x: 120, y: 240 }, 390, 844, 54, 54)).toEqual({ x: 120, y: 240 });
  });

  it('不会拖出右边界或下边界', () => {
    expect(clampOrbPosition({ x: 999, y: 999 }, 390, 844, 54, 54)).toEqual({ x: 328, y: 782 });
  });

  it('不会拖出左边界或上边界', () => {
    expect(clampOrbPosition({ x: -50, y: -80 }, 390, 844, 54, 54)).toEqual({ x: 8, y: 8 });
  });

  it('非法存档位置回收到安全边角', () => {
    expect(clampOrbPosition({ x: NaN, y: Infinity }, 390, 844, 54, 54)).toEqual({ x: 8, y: 8 });
  });
});

describe('真实音频到悬浮球动效', () => {
  it('有声音时强度上升，安静时逐步回落', () => {
    const loud = nextOrbPulse(EMPTY_ORB_PULSE, { level: 0.9, bass: 0.8, beat: false });
    expect(loud.level).toBeGreaterThan(0.3);
    expect(loud.bass).toBeGreaterThan(0.3);
    const quiet = nextOrbPulse(loud, { level: 0, bass: 0, beat: false });
    expect(quiet.level).toBeLessThan(loud.level);
    expect(quiet.bass).toBeLessThan(loud.bass);
  });

  it('真实节拍立即出现并在后续帧衰减', () => {
    const hit = nextOrbPulse(EMPTY_ORB_PULSE, { level: 0.4, bass: 0.8, beat: true });
    expect(hit.beat).toBe(1);
    const decay = nextOrbPulse(hit, { level: 0.4, bass: 0.3, beat: false });
    expect(decay.beat).toBeGreaterThan(0);
    expect(decay.beat).toBeLessThan(1);
  });

  it('音频数据异常或静音时不会产生虚假律动', () => {
    expect(normalizeOrbAudio({ level: NaN, bass: Infinity, beat: false })).toEqual({
      level: 0,
      bass: 0,
      beat: false
    });
    const silent = nextOrbPulse(EMPTY_ORB_PULSE, { level: 0, bass: 0, beat: false });
    expect(silent).toEqual(EMPTY_ORB_PULSE);
  });

  it('输入超过范围时钳制到安全范围', () => {
    expect(normalizeOrbAudio({ level: 9, bass: -2, beat: true })).toEqual({
      level: 1,
      bass: 0,
      beat: true
    });
  });
});

/** 取两个角度之间的最短夹角，范围 [-180,180)。 */
function shortestTurn(from: number, to: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return diff < -180 ? diff + 360 : diff;
}

const MAX_BLOB_STEP = 5.2 * 2 * BLOB_PHASE_RATIO;

describe('悬浮球双层旋转相位', () => {
  it('两个相位各自累积并始终落在 [0,360)', () => {
    let phase: OrbPhase = { ring: 0, blob: 0 };
    for (let index = 0; index < 800; index++) {
      phase = advanceOrbPhase(phase, 1, 2);
      expect(phase.ring).toBeGreaterThanOrEqual(0);
      expect(phase.ring).toBeLessThan(360);
      expect(phase.blob).toBeGreaterThanOrEqual(0);
      expect(phase.blob).toBeLessThan(360);
    }
    // 800 帧后液态体已经转过多圈，但角度仍被收在区间内
    expect(phase.blob).not.toBe(0);
  });

  it('长时间满低频播放时液态体每帧只前进不超过一步，绝不跳回起点', () => {
    let phase: OrbPhase = { ring: 0, blob: 0 };
    let previous = phase.blob;
    let maxTurn = 0;
    let wraps = 0;
    for (let index = 0; index < 3000; index++) {
      // 帧率在 30~120fps 抖动，低频在 0.6~1 波动，覆盖真实播放的极端情况
      const frameScale = 0.5 + (index % 7) * 0.25;
      const bass = 0.6 + (index % 5) * 0.1;
      phase = advanceOrbPhase(phase, bass, frameScale);
      const turn = Math.abs(shortestTurn(previous, phase.blob));
      maxTurn = Math.max(maxTurn, turn);
      if (phase.blob < previous) wraps++;
      previous = phase.blob;
    }
    expect(wraps).toBeGreaterThan(10);
    expect(maxTurn).toBeLessThanOrEqual(MAX_BLOB_STEP + 1e-6);
    expect(maxTurn).toBeLessThan(180);
  });

  it('旧算法（环角度乘 0.55）确实会在跨圈时弹回，作为回归对照', () => {
    // 环角度从 -359.9 跨过 -360 归零，旧实现直接用 -ring*0.55：
    // 液态体在 197.9° 的"三分之二圈"位置被瞬间拽回 0°，最短圆周距离 162.1°。
    const before = (359.9 * BLOB_PHASE_RATIO) % 360;
    const after = (0 * BLOB_PHASE_RATIO) % 360;
    const jump = Math.abs(shortestTurn(before, after));
    expect(jump).toBeCloseTo(162.06, 1);
    // 同一段旋转改走新算法后，单帧只前进不到 3°
    const phase = advanceOrbPhase({ ring: 359.9, blob: before }, 1, 1);
    expect(Math.abs(shortestTurn(before, phase.blob))).toBeLessThanOrEqual(MAX_BLOB_STEP);
  });

  it('静音时两个相位都停住', () => {
    const phase: OrbPhase = { ring: 123, blob: 234 };
    expect(advanceOrbPhase(phase, 0, 2)).toEqual(phase);
    expect(advanceOrbPhase(phase, Number.NaN, 1)).toEqual(phase);
  });

  it('异常相位与异常帧长不会把角度带到区间外', () => {
    const broken = advanceOrbPhase({ ring: Number.NaN, blob: Infinity }, 1, Number.POSITIVE_INFINITY);
    expect(broken.ring).toBe(0);
    expect(broken.blob).toBeGreaterThanOrEqual(0);
    expect(broken.blob).toBeLessThan(360);
  });

  it('帧长被钳制，掉帧时不会突然大角度跳跃', () => {
    // 掉帧到 300ms，若不钳制会一步转 40° 以上
    const phase = advanceOrbPhase({ ring: 0, blob: 0 }, 1, 18);
    expect(Math.abs(shortestTurn(0, phase.blob))).toBeCloseTo(MAX_BLOB_STEP, 6);
  });
});
