/**
 * 本地音乐播放的原生能力封装。
 *
 * 真机走 MusicPlayerPlugin（ExoPlayer）：播放 content:// 曲目，App 内切板块不停。
 * H5 调试环境没有这个插件，降级成 <audio> 播放（仅能播浏览器能读到的文件），
 * 保证界面在无原生层时也能点、能看状态，不至于报错。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { MusicTrack } from '@/utils/music';
import { playModeFromCode, PLAY_MODE_CODE, type PlayMode } from '@/utils/playMode';

export type { PlayMode } from '@/utils/playMode';

export interface AudioLevelSample {
  level: number;
  bass: number;
  beat: boolean;
}

export interface PlayerState {
  playing: boolean;
  index: number;
  count: number;
  /** 毫秒 */
  position: number;
  /** 毫秒；0 表示未知 */
  duration: number;
  title: string;
  /** 当前播放模式 */
  mode: PlayMode;
}

export const emptyPlayerState: PlayerState = {
  playing: false,
  index: -1,
  count: 0,
  position: 0,
  duration: 0,
  title: '',
  mode: 'order'
};

interface MusicPlayerPluginApi {
  play(options: { tracks: Array<{ uri: string; name: string; duration: number }>; startIndex: number }): Promise<PlayerState>;
  pause(): Promise<PlayerState>;
  resume(): Promise<PlayerState>;
  next(): Promise<PlayerState>;
  previous(): Promise<PlayerState>;
  seek(options: { position: number }): Promise<PlayerState>;
  setMode(options: { mode: number }): Promise<PlayerState>;
  setVolume(options: { volume: number }): Promise<void>;
  getState(): Promise<PlayerState>;
  stop(): Promise<PlayerState>;
  addListener(eventName: 'playerState', listenerFunc: (state: PlayerState) => void): Promise<{ remove: () => void }>;
  addListener(eventName: 'audioLevel', listenerFunc: (sample: AudioLevelSample) => void): Promise<{ remove: () => void }>;
}

const MusicPlayer = registerPlugin<MusicPlayerPluginApi>('MusicPlayer');

export function nativePlayerAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 原生回包是整数编码，H5 内部直接用字符串；两种都要认。
 * 之前只按整数解析，H5 切换模式后会被归一化回“顺序”，模式按钮看起来像没反应。
 */
function normalizeMode(value: unknown): PlayMode {
  if (value === 'order' || value === 'shuffle' || value === 'one') return value;
  return playModeFromCode(value);
}

function normalizeState(s: PlayerState | null | undefined): PlayerState {
  const value = s ?? emptyPlayerState;
  return {
    playing: value.playing === true,
    index: Number.isFinite(value.index) ? Number(value.index) : -1,
    count: Number.isFinite(value.count) ? Number(value.count) : 0,
    position: Number.isFinite(value.position) ? Math.max(0, Number(value.position)) : 0,
    duration: Number.isFinite(value.duration) ? Math.max(0, Number(value.duration)) : 0,
    title: String(value.title ?? ''),
    mode: normalizeMode((value as { mode?: unknown }).mode)
  };
}

/** H5 兜底记住的模式，真机不用它 */
let h5Mode: PlayMode = 'order';
let h5State: PlayerState = { ...emptyPlayerState };
/** H5 也保留当前列表，让悬浮球双击下一曲在调试端走完整条真实交互链。 */
let h5Tracks: MusicTrack[] = [];
const h5StateListeners = new Set<(state: PlayerState) => void>();

function updateH5State(next: PlayerState): PlayerState {
  h5State = normalizeState(next);
  const snapshot = { ...h5State };
  for (const listener of h5StateListeners) listener(snapshot);
  return snapshot;
}

/** H5 兜底用的单个 <audio>；真机不用它 */
let h5Audio: HTMLAudioElement | null = null;
/** H5 同样使用 Web Audio 的真实输出数据，不用定时器假装律动。 */
let h5AudioContext: AudioContext | null = null;
let h5Analyser: AnalyserNode | null = null;
let h5Source: MediaElementAudioSourceNode | null = null;
let h5TimeData: Uint8Array | null = null;
let h5FrequencyData: Uint8Array | null = null;
let h5BassAverage = 0;
let h5LastBeatAt = 0;

/** H5 也用真实 timeupdate 刷新进度；seek 后由同一事件接上实际播放位置。 */
function syncH5Progress() {
  if (!h5Audio || currentIndex < 0) return;
  const target = h5Tracks[currentIndex];
  updateH5State({
    ...h5State,
    playing: !h5Audio.paused && !h5Audio.ended,
    index: currentIndex,
    count: h5Tracks.length,
    position: Math.round(Math.max(0, h5Audio.currentTime || 0) * 1000),
    duration: Number.isFinite(h5Audio.duration) ? Math.round(Math.max(0, h5Audio.duration) * 1000) : 0,
    title: target?.name ?? h5State.title,
    mode: h5Mode
  });
}

function ensureH5Audio(): HTMLAudioElement {
  if (h5Audio) return h5Audio;
  const audio = new Audio();
  audio.preload = 'auto';
  h5Audio = audio;
  for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended']) {
    audio.addEventListener(event, syncH5Progress);
  }
  return audio;
}

function setupH5Analyser() {
  if (!h5Audio) return;
  if (h5Analyser) {
    void h5AudioContext?.resume();
    return;
  }
  const AudioContextCtor = window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  try {
    const context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.55;
    const source = context.createMediaElementSource(h5Audio);
    source.connect(analyser);
    analyser.connect(context.destination);
    h5AudioContext = context;
    h5Analyser = analyser;
    h5Source = source;
    h5TimeData = new Uint8Array(analyser.fftSize);
    h5FrequencyData = new Uint8Array(analyser.frequencyBinCount);
    void context.resume();
  } catch {
    // 浏览器不支持分析时保持普通 <audio> 播放，不能为了动画弄坏声音。
  }
}

function clampLevel(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** 供悬浮球在 H5 动画帧里直接读取真实音频；真机走原生 audioLevel 事件。 */
export function readH5AudioLevel(): AudioLevelSample {
  if (!h5Audio || !h5Analyser || !h5TimeData || !h5FrequencyData || h5Audio.paused) {
    h5BassAverage = 0;
    return { level: 0, bass: 0, beat: false };
  }
  h5Analyser.getByteTimeDomainData(h5TimeData);
  h5Analyser.getByteFrequencyData(h5FrequencyData);
  let energy = 0;
  for (const value of h5TimeData) {
    const sample = (value - 128) / 128;
    energy += sample * sample;
  }
  const level = clampLevel(Math.sqrt(energy / h5TimeData.length) * 4.2);
  const hzPerBin = h5AudioContext ? h5AudioContext.sampleRate / h5Analyser.fftSize : 200;
  const bassBins = Math.max(1, Math.min(h5FrequencyData.length, Math.ceil(180 / hzPerBin)));
  let bassSum = 0;
  for (let index = 0; index < bassBins; index++) bassSum += h5FrequencyData[index];
  const bass = clampLevel((bassSum / bassBins / 255) * 1.6);
  h5BassAverage = h5BassAverage <= 0 ? bass : h5BassAverage * 0.9 + bass * 0.1;
  const now = Date.now();
  const beat = bass > 0.16 && bass > h5BassAverage * 1.18 && now - h5LastBeatAt > 160;
  if (beat) h5LastBeatAt = now;
  return { level, bass, beat };
}

/** 开始播放一组曲目，从 startIndex 起 */
export async function playTracks(tracks: MusicTrack[], startIndex: number): Promise<PlayerState> {
  if (nativePlayerAvailable()) {
    const payload = tracks
      .filter((track): track is MusicTrack & { uri: string } => typeof track.uri === 'string' && track.uri.length > 0)
      .map((track) => ({ uri: track.uri, name: track.name, duration: track.duration || 0 }));
    if (!payload.length) throw new Error('这些曲目没有可读取的文件位置，请重新扫描');
    return normalizeState(await MusicPlayer.play({ tracks: payload, startIndex }));
  }
  // H5 兜底：播放选中的一首，同时记住列表供上一曲 / 下一曲使用
  const target = tracks[startIndex];
  if (!target?.uri || ! ('Audio' in window)) throw new Error('当前环境不支持播放');
  h5Tracks = [...tracks];
  const audio = ensureH5Audio();
  currentIndex = startIndex;
  audio.src = target.uri;
  setupH5Analyser();
  await audio.play();
  return updateH5State({
    playing: true,
    index: startIndex,
    count: tracks.length,
    position: 0,
    duration: Math.round((h5Audio.duration || 0) * 1000),
    title: target.name,
    mode: h5Mode
  });
}

export async function pausePlayback(): Promise<PlayerState> {
  if (nativePlayerAvailable()) return normalizeState(await MusicPlayer.pause());
  if (h5Audio) h5Audio.pause();
  return updateH5State({ ...h5State, playing: false, index: currentIndex });
}

export async function resumePlayback(): Promise<PlayerState> {
  if (nativePlayerAvailable()) return normalizeState(await MusicPlayer.resume());
  if (h5Audio) await h5Audio.play();
  return updateH5State({ ...h5State, playing: true, index: currentIndex });
}

function stepH5Track(direction: -1 | 1): Promise<PlayerState> {
  if (!h5Tracks.length) return Promise.resolve({ ...h5State });
  const count = h5Tracks.length;
  let nextIndex: number;
  if (h5Mode === 'shuffle' && count > 1) {
    nextIndex = Math.floor(Math.random() * (count - 1));
    if (nextIndex >= currentIndex) nextIndex += 1;
  } else {
    const base = currentIndex >= 0 ? currentIndex : 0;
    nextIndex = (base + direction + count) % count;
  }
  return playTracks(h5Tracks, nextIndex);
}

export async function nextTrack(): Promise<PlayerState> {
  if (nativePlayerAvailable()) return normalizeState(await MusicPlayer.next());
  return stepH5Track(1);
}

export async function previousTrack(): Promise<PlayerState> {
  if (nativePlayerAvailable()) return normalizeState(await MusicPlayer.previous());
  return stepH5Track(-1);
}

export async function seekTo(positionMs: number): Promise<PlayerState> {
  // 统一收敛成有限整数再交给原生：NaN / Infinity / 小数都不会污染原生参数。
  const target = Number.isFinite(positionMs) ? Math.max(0, Math.round(positionMs)) : 0;
  if (nativePlayerAvailable()) return normalizeState(await MusicPlayer.seek({ position: target }));
  if (h5Audio) h5Audio.currentTime = target / 1000;
  return updateH5State({ ...h5State, index: currentIndex, position: target });
}

/** 切换播放模式：顺序 / 随机 / 单曲循环 */
export async function setPlaybackMode(mode: PlayMode): Promise<PlayerState> {
  h5Mode = mode;
  if (nativePlayerAvailable()) return normalizeState(await MusicPlayer.setMode({ mode: PLAY_MODE_CODE[mode] }));
  return updateH5State({ ...h5State, index: currentIndex, mode: h5Mode });
}

export async function getPlayerState(): Promise<PlayerState> {
  if (nativePlayerAvailable()) return normalizeState(await MusicPlayer.getState());
  return { ...h5State };
}

export async function stopPlayback(): Promise<void> {
  if (nativePlayerAvailable()) {
    await MusicPlayer.stop();
    return;
  }
  if (h5Audio) {
    h5Audio.pause();
    h5Audio.src = '';
  }
  currentIndex = -1;
  h5Tracks = [];
  updateH5State({ ...emptyPlayerState });
}

/** 订阅播放状态；H5 也同步给独立悬浮球，保证预览行为与真机一致。 */
export async function onPlayerState(callback: (state: PlayerState) => void): Promise<() => void> {
  if (!nativePlayerAvailable()) {
    h5StateListeners.add(callback);
    return () => h5StateListeners.delete(callback);
  }
  const handle = await MusicPlayer.addListener('playerState', (state) => callback(normalizeState(state)));
  return () => {
    void handle.remove();
  };
}

/** 订阅原生真实 PCM 分析结果；H5 由 readH5AudioLevel() 在动画帧中采样。 */
export async function onAudioLevel(callback: (sample: AudioLevelSample) => void): Promise<() => void> {
  if (!nativePlayerAvailable()) return () => undefined;
  const handle = await MusicPlayer.addListener('audioLevel', (sample) => {
    callback({
      level: clampLevel(Number(sample?.level)),
      bass: clampLevel(Number(sample?.bass)),
      beat: sample?.beat === true
    });
  });
  return () => {
    void handle.remove();
  };
}

// H5 兜底时记住当前曲目下标，让暂停/恢复的返回状态带上它
let currentIndex = -1;
