export interface OrbPoint {
  x: number;
  y: number;
}

export interface OrbAudioSample {
  level: number;
  bass: number;
  beat: boolean;
}

export interface OrbPulse {
  level: number;
  bass: number;
  beat: number;
}

export const EMPTY_ORB_PULSE: OrbPulse = { level: 0, bass: 0, beat: 0 };

/** 内层液态体的角速度相对断续环的比例，慢一点才像液体在晃。 */
export const BLOB_PHASE_RATIO = 0.55;

export interface OrbPhase {
  /** 断续环角度，整圈等价，可以自由取模。 */
  ring: number;
  /** 内层液态体角度，必须自己累积，不能从环的角度换算。 */
  blob: number;
}

function clamp01(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

/** 把角度收进 [0,360)，避免长时间播放后数值越滚越大。 */
function wrapDegrees(value: number): number {
  const base = Number.isFinite(value) ? value : 0;
  const wrapped = base % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * 推进悬浮球的两层旋转。
 *
 * 断续环是 360° 周期图案，跨圈时角度归零看不出来；内层液态体按 0.55 倍速旋转，
 * 如果仍用「环角度 × 0.55」，一圈只转 198°，跨圈时会从 198° 直接弹回 0°，
 * 肉眼看就是转到大半圈突然复位。所以两个相位各自累积、各自取模。
 */
export function advanceOrbPhase(phase: OrbPhase, bass: number, frameScale = 1): OrbPhase {
  const scale = Number.isFinite(frameScale) ? Math.min(2, Math.max(0.5, frameScale)) : 1;
  const spin = clamp01(bass) * 5.2 * scale;
  const current = phase ?? { ring: 0, blob: 0 };
  return {
    ring: wrapDegrees(current.ring - spin),
    blob: wrapDegrees(current.blob + spin * BLOB_PHASE_RATIO)
  };
}

/** 把悬浮球限制在当前可视区域内，屏幕旋转后也不会丢到屏幕外。 */
export function clampOrbPosition(
  point: OrbPoint,
  viewportWidth: number,
  viewportHeight: number,
  orbWidth: number,
  orbHeight: number,
  margin = 8
): OrbPoint {
  const maxX = Math.max(margin, viewportWidth - orbWidth - margin);
  const maxY = Math.max(margin, viewportHeight - orbHeight - margin);
  const x = Number.isFinite(point.x) ? point.x : margin;
  const y = Number.isFinite(point.y) ? point.y : margin;
  return {
    x: Math.min(maxX, Math.max(margin, x)),
    y: Math.min(maxY, Math.max(margin, y))
  };
}

export function normalizeOrbAudio(sample: Partial<OrbAudioSample> | null | undefined): OrbAudioSample {
  return {
    level: clamp01(sample?.level),
    bass: clamp01(sample?.bass),
    beat: sample?.beat === true
  };
}

/** 上升快、回落慢；节拍单独衰减，避免音频回调频率影响观感。 */
export function nextOrbPulse(current: OrbPulse, input: Partial<OrbAudioSample>): OrbPulse {
  const sample = normalizeOrbAudio(input);
  const levelRate = sample.level > current.level ? 0.42 : 0.12;
  const bassRate = sample.bass > current.bass ? 0.48 : 0.14;
  return {
    level: clamp01(current.level + (sample.level - current.level) * levelRate),
    bass: clamp01(current.bass + (sample.bass - current.bass) * bassRate),
    beat: sample.beat ? 1 : clamp01(current.beat * 0.82)
  };
}
