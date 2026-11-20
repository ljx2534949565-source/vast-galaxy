import { beforeEach, describe, expect, it, vi } from 'vitest';

const correct = vi.fn();
const wrong = vi.fn();
const tap = vi.fn();
const celebrate = vi.fn();
const sound = vi.fn();
const vibrate = vi.fn();

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ correct, wrong, tap, celebrate, sound })
}));

describe('playCorrectFeedback', () => {
  beforeEach(() => {
    correct.mockReset();
    wrong.mockReset();
    vibrate.mockReset();
    vi.stubGlobal('navigator', { vibrate });
  });

  it('原生插件可用时走原生，不触碰网页 API', async () => {
    correct.mockResolvedValue({ mode: 'amplitude' });
    const { playCorrectFeedback } = await import('@/utils/feedback');

    await expect(playCorrectFeedback()).resolves.toBe('native');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('原生调用失败时回落到网页震动，而不是静默吞掉', async () => {
    correct.mockRejectedValue(new Error('"StudyFeedback.correct()" is not implemented'));
    vibrate.mockReturnValue(true);
    const { playCorrectFeedback } = await import('@/utils/feedback');

    await expect(playCorrectFeedback()).resolves.toBe('web');
    // v2.6.0 对调后：答对走轻快三连击
    expect(vibrate).toHaveBeenCalledWith([28, 62, 28, 62, 34]);
  });

  it('原生与网页都不可用时返回 none，且不抛异常', async () => {
    correct.mockRejectedValue(new Error('no vibrator'));
    vibrate.mockReturnValue(false);
    const { playCorrectFeedback } = await import('@/utils/feedback');

    await expect(playCorrectFeedback()).resolves.toBe('none');
  });

  it('原生调用同步抛错时也能兜住', async () => {
    correct.mockImplementation(() => {
      throw new Error('bridge missing');
    });
    vibrate.mockReturnValue(true);
    const { playCorrectFeedback } = await import('@/utils/feedback');

    await expect(playCorrectFeedback()).resolves.toBe('web');
  });
});

describe('playWrongFeedback', () => {
  beforeEach(() => {
    correct.mockReset();
    wrong.mockReset();
    vibrate.mockReset();
    vi.stubGlobal('navigator', { vibrate });
  });

  it('走的是 wrong 方法，不会误调 correct', async () => {
    wrong.mockResolvedValue({ mode: 'amplitude' });
    const { playWrongFeedback } = await import('@/utils/feedback');

    await expect(playWrongFeedback()).resolves.toBe('native');
    expect(wrong).toHaveBeenCalledTimes(1);
    expect(correct).not.toHaveBeenCalled();
  });

  it('回落网页震动时是一顿一沉的两段节奏', async () => {
    wrong.mockRejectedValue(new Error('not implemented'));
    vibrate.mockReturnValue(true);
    const { playWrongFeedback } = await import('@/utils/feedback');

    await expect(playWrongFeedback()).resolves.toBe('web');
    // 对调后：答错用原来答对的两段加重，和「答错像答对」的反馈对不上
    expect(vibrate).toHaveBeenCalledWith([45, 55, 70]);
  });
});

describe('总开关与新增手感', () => {
  beforeEach(() => {
    correct.mockReset();
    wrong.mockReset();
    tap.mockReset();
    celebrate.mockReset();
    vibrate.mockReset();
    vi.stubGlobal('navigator', { vibrate });
  });

  it('关掉总开关后，任何一条链路都不再震动', async () => {
    const { playCorrectFeedback, playWrongFeedback, playTapFeedback, setHapticEnabled } = await import('@/utils/feedback');
    setHapticEnabled(false);
    correct.mockResolvedValue({});
    wrong.mockResolvedValue({});
    await expect(playCorrectFeedback()).resolves.toBe('none');
    await expect(playWrongFeedback()).resolves.toBe('none');
    await expect(playTapFeedback()).resolves.toBe('none');
    expect(correct).not.toHaveBeenCalled();
    expect(wrong).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    setHapticEnabled(true);
  });

  it('轻触走 tap 方法，用于设置里的开关', async () => {
    tap.mockResolvedValue({});
    const { playTapFeedback, setHapticEnabled } = await import('@/utils/feedback');
    setHapticEnabled(true);
    await expect(playTapFeedback()).resolves.toBe('native');
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('庆祝震动是一串连击 + 长震，不会退化成单下', async () => {
    celebrate.mockResolvedValue({});
    const { playCelebrateFeedback, setHapticEnabled } = await import('@/utils/feedback');
    setHapticEnabled(true);
    await expect(playCelebrateFeedback()).resolves.toBe('native');
    expect(celebrate).toHaveBeenCalledTimes(1);
  });
});

describe('答题音效（v3.10）', () => {
  beforeEach(() => {
    sound.mockReset();
    sound.mockResolvedValue({ played: true });
  });

  it('总开关默认关：不开就不播放，也不调用原生', async () => {
    const { playCorrectSound, setSoundEnabled } = await import('@/utils/feedback');
    setSoundEnabled(false);
    await playCorrectSound();
    expect(sound).not.toHaveBeenCalled();
  });

  it('打开后答对播放选中的答对音效', async () => {
    const { playCorrectSound, setSoundEnabled, setSoundChoice } = await import('@/utils/feedback');
    setSoundEnabled(true);
    setSoundChoice('correct', 'triple_chime');
    await playCorrectSound();
    expect(sound).toHaveBeenCalledWith({ name: 'correct_04_triple_chime' });
  });

  it('打开后答错播放选中的答错音效', async () => {
    const { playWrongSound, setSoundEnabled, setSoundChoice } = await import('@/utils/feedback');
    setSoundEnabled(true);
    setSoundChoice('wrong', 'soft_wood_tap');
    await playWrongSound();
    expect(sound).toHaveBeenCalledWith({ name: 'wrong_03_soft_wood_tap' });
  });

  it('未知音效名回落到默认，不会传空名字给原生', async () => {
    const { setSoundChoice, previewSound } = await import('@/utils/feedback');
    setSoundChoice('correct', 'no_such_sound');
    await previewSound('no_such_sound');
    expect(sound).not.toHaveBeenCalled();
  });

  it('试听忽略总开关：关着也能听到选中音效', async () => {
    const { setSoundEnabled, setSoundChoice, previewSound } = await import('@/utils/feedback');
    setSoundEnabled(false);
    setSoundChoice('wrong', 'muted_double');
    await previewSound('muted_double');
    expect(sound).toHaveBeenCalledWith({ name: 'wrong_02_muted_double' });
  });

  it('原生播放报错时静默吞掉，不影响答题流程', async () => {
    sound.mockRejectedValue(new Error('no sound pool'));
    const { setSoundEnabled, playWrongSound } = await import('@/utils/feedback');
    setSoundEnabled(true);
    await expect(playWrongSound()).resolves.toBeUndefined();
  });
});
