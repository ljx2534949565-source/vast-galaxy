import { describe, expect, it } from 'vitest';
import { POSE, dampBeyond, poseTransform, settleMs, shouldCommit, spanMs, TURN_RULE } from '@/utils/tabMotion';

const W = 393;

/** 从 transform 字符串里掏出数字，断言用（注意 translate3d 里的 3 别被当成数值） */
function parse(t: string) {
  const [x, y, z] = t.match(/translate3d\(([^)]+)\)/)![1].split(',').map((v) => parseFloat(v));
  return {
    x,
    y,
    z,
    rotate: parseFloat(t.match(/rotateY\(([^)]+)\)/)![1]),
    scale: parseFloat(t.match(/scale\(([^)]+)\)/)![1])
  };
}

describe('poseTransform：旋转木马的摆位', () => {
  it('正对镜头时是干净的零位', () => {
    expect(poseTransform(0, W)).toBe('translate3d(0px, 0, 0px) rotateY(0deg) scale(1)');
  });

  it('页面在左边时右边缘朝向观众（正角度），不能转反', () => {
    expect(parse(poseTransform(-1, W)).rotate).toBe(POSE.angle);
    expect(parse(poseTransform(1, W)).rotate).toBe(-POSE.angle);
    expect(parse(poseTransform(-0.4, W)).rotate).toBeCloseTo(POSE.angle * 0.4, 4);
  });

  it('横向位移跟手指走，方向和位置一致（中间段一页略小于一屏，让两页贴住）', () => {
    expect(parse(poseTransform(-0.5, W)).x).toBe((-W / 2) * POSE.spread);
    expect(parse(poseTransform(0.5, W)).x).toBe((W / 2) * POSE.spread);
    expect(parse(poseTransform(-0.3, W)).x).toBe((-W * 0.3) * POSE.spread);
  });

  it('终点必须把旧页完全推出屏幕：透视会缩水，位移要大于一屏', () => {
    const end = Math.abs(parse(poseTransform(-1, W)).x);
    expect(end).toBeCloseTo(W * (POSE.spread + POSE.tail), 1);
    expect(end).toBeGreaterThan(W);
    // 补位移只发生在最后 12%：0.88 之前必须还是标准 spread，别提前推
    expect(parse(poseTransform(-0.88, W)).x).toBe(-W * 0.88 * POSE.spread);
    const a = Math.abs(parse(poseTransform(-0.9, W)).x);
    const b = Math.abs(parse(poseTransform(-0.91, W)).x);
    expect(b - a).toBeLessThan(W * 0.03);
  });

  it('缩放必须连续：手指每动 0.8px 都要有变化（两位小数只剩五级台阶）', () => {
    for (let i = 1; i < 12; i++) {
      const p = i / 20;
      const q = p + 2 / W; // 约 0.8px 手指
      expect(parse(poseTransform(p, W)).scale).not.toBe(parse(poseTransform(q, W)).scale);
    }
  });

  it('越往侧面越退、越小，且两侧对称', () => {
    const near = parse(poseTransform(0.2, W));
    const far = parse(poseTransform(0.9, W));
    expect(near.z).toBeGreaterThan(far.z);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(parse(poseTransform(-0.9, W)).scale).toBe(far.scale);
    expect(parse(poseTransform(-0.9, W)).z).toBe(far.z);
    expect(parse(poseTransform(-0.9, W)).x).toBe(-far.x);
  });

  it('缩放有下限，页面不会缩成一条线', () => {
    expect(parse(poseTransform(20, W)).scale).toBe(0.6);
  });

  it('不出 -0 这种脏值（会影响字符串比较和测试）', () => {
    expect(poseTransform(-0.001, W)).not.toContain('-0px');
    expect(poseTransform(-0.001, W)).not.toContain('rotateY(-0deg)');
  });
});

describe('dampBeyond：到头之后的阻尼', () => {
  it('默认只跟两成', () => {
    expect(dampBeyond(100)).toBe(20);
    expect(dampBeyond(-100)).toBe(-20);
  });
  it('手指走多远都不会真的翻过去', () => {
    const W = 393;
    expect(dampBeyond(W * 3) / W).toBeLessThan(1);
  });
});

describe('shouldCommit：松手判定', () => {
  it('拖过半屏一定翻（慢也算）', () => {
    expect(shouldCommit(0.5, 0)).toBe(true);
    expect(shouldCommit(0.3, 0)).toBe(true);
  });

  it('刚动一点又没速度，弹回去', () => {
    expect(shouldCommit(0.1, 0)).toBe(false);
    expect(shouldCommit(0.2, 0.05)).toBe(false);
  });

  it('甩得够快就翻，不用拖很远', () => {
    expect(shouldCommit(TURN_RULE.flickAt + 0.01, TURN_RULE.flickSpeed + 0.05)).toBe(true);
  });

  it('位移太小连甩都不算', () => {
    expect(shouldCommit(TURN_RULE.flickAt - 0.02, 3)).toBe(false);
  });

  it('没拖动 / 反向都不翻', () => {
    expect(shouldCommit(0, 5)).toBe(false);
    expect(shouldCommit(-0.4, 5)).toBe(false);
  });
});

describe('收尾时长', () => {
  it('走得越远收得越久，但都在 220~380ms', () => {
    expect(settleMs(0)).toBe(220);
    expect(settleMs(1)).toBe(380);
    expect(settleMs(0.5)).toBeGreaterThan(settleMs(0.2));
  });
  it('跨格多给一点时间', () => {
    expect(spanMs(1)).toBe(280);
    expect(spanMs(2)).toBeGreaterThan(spanMs(1));
  });
});
