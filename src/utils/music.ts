/**
 * 本地音乐的「曲库索引」。
 *
 * 这一版只记文件名、扩展名、大小和加入时间 —— 音频文件本身留在原处，
 * 既不复制也不上传（一首无损就几十 MB，塞进 localStorage 会直接撑爆）。
 * 真正的播放要靠 Media3 前台服务，还没接；所以这里刻意不存路径，
 * 免得重装或移动文件后留下一堆点不动的死条目。
 */

export const MUSIC_STORAGE_KEY = 'ky_v1_music';

/**
 * v4.6.0：手动删除的曲目会记进这份「忽略名单」。
 * 全量/增量扫描时先按它过滤，被删掉的歌下次就不会再冒出来。
 * 只存曲目的稳定 id（name+size 指纹），不碰文件本身。
 */
export const MUSIC_IGNORED_KEY = 'ky_v1_music_ignored';

/**
 * v4.7.0：手动歌单。歌单里只存曲目的 id（同一首歌的指纹），
 * 播放时再按 id 回曲库取 uri；曲目被删掉不会出现死链接，播放前会过滤。
 */
export const MUSIC_PLAYLISTS_KEY = 'ky_v1_music_playlists';

/**
 * v4.2.4：30 秒及以下的短音频视为音效，不进曲库。
 * 原生扫描插件 MusicScannerPlugin.java 里有一个同样的 30000 常量，两处要一起改。
 */
export const MIN_TRACK_MS = 30_000;

/** 系统文件选择器能选到的东西很杂，这里只放行常见音频后缀 */
export const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'wma', 'ape'] as const;

export interface MusicTrack {
  /** name + size 推出来的稳定 id，同一首歌重复扫到不会堆成两条 */
  id: string;
  name: string;
  /** 小写、不带点 */
  ext: string;
  /** 字节数；读不到时为 0 */
  size: number;
  addedAt: number;
  /**
   * v4.1.0：媒体库给的可读位置（content:// URI）。有了它下一步才能真正播放。
   * 旧版曲库没有这个字段，读档时缺省即可，不破坏老数据。
   */
  uri?: string;
  /** 时长（毫秒），媒体库读不到时为 0 */
  duration?: number;
}

export interface MusicLibrary {
  tracks: MusicTrack[];
  /** 最近一次扫描（全量或增量）的时间 */
  lastScanAt: number;
  /** 最近一次全量扫描的时间 */
  lastFullAt: number;
  lastMode: ScanMode;
}

export type ScanMode = 'full' | 'incremental' | '';

/** 手动歌单：只记曲目 id，播放时回曲库按 id 找 uri */
export interface Playlist {
  id: string;
  name: string;
  /** 曲目 id 列表，顺序即播放顺序 */
  trackIds: string[];
  createdAt: number;
}

export interface AudioFileLike {
  name: string;
  size: number;
  /** 原生扫描会给可读位置；H5 文件选择兜底时没有 */
  uri?: string;
  /** 时长（毫秒） */
  duration?: number;
  /** 媒体库里加入的时区时间；没有就用扫描时间 */
  addedAt?: number;
}

export interface MergeResult {
  tracks: MusicTrack[];
  added: number;
  skipped: number;
}

export interface RebuildResult {
  tracks: MusicTrack[];
  added: number;
  removed: number;
}

export interface LibraryStats {
  count: number;
  bytes: number;
  label: string;
}

export function emptyLibrary(): MusicLibrary {
  return { tracks: [], lastScanAt: 0, lastFullAt: 0, lastMode: '' };
}

function hash(text: string): string {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function isAudioName(name: string): boolean {
  return (AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** 同名同大小视为同一首：换了目录、换了手机都还能对上 */
export function trackId(name: string, size: number): string {
  return `tr_${hash(`${name.toLowerCase()}|${size}`)}`;
}

function normalizeTrack(value: unknown, at: number): MusicTrack | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MusicTrack>;
  if (typeof raw.name !== 'string') return null;
  const name = raw.name.trim();
  if (!name || !isAudioName(name)) return null;
  const size = Number(raw.size);
  const track: MusicTrack = {
    id: trackId(name, Number.isFinite(size) && size > 0 ? size : 0),
    name,
    ext: extensionOf(name),
    size: Number.isFinite(size) && size > 0 ? Math.round(size) : 0,
    addedAt: Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : at
  };
  // 媒体库给的可读位置：只认 content:// 或绝对路径，脏值不当曲目位置存
  if (typeof raw.uri === 'string' && /^(content:\/\/|\/)/.test(raw.uri.trim())) {
    track.uri = raw.uri.trim();
  }
  const duration = Number(raw.duration);
  if (Number.isFinite(duration) && duration > 0) {
    // v4.2.4：明确知道时长且 ≤30 秒的是音效，不进曲库。
    // 时长读不到（0 / 缺省）的照常保留——老曲库和 H5 选的歌都没有时长，不能被误删。
    if (duration <= MIN_TRACK_MS) return null;
    track.duration = Math.round(duration);
  }
  return track;
}

function sortTracks(tracks: MusicTrack[]): MusicTrack[] {
  // 按文件名排，数字按数值比（track 2 在 track 10 前面），列表才像曲库
  return [...tracks].sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true }));
}

/** 把文件选择器的结果转成曲目：非音频直接丢掉，不报错 */
export function tracksFromFiles(files: AudioFileLike[], at = Date.now()): MusicTrack[] {
  const tracks: MusicTrack[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const track = normalizeTrack(
      { name: file.name, size: file.size, addedAt: file.addedAt ?? at, uri: file.uri, duration: file.duration },
      at
    );
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return sortTracks(tracks);
}

/** 增量：只往库里加新条目，已有的原样留着 */
export function mergeTracks(existing: MusicTrack[], incoming: MusicTrack[], at = Date.now()): MergeResult {
  const kept = new Map(existing.map((track) => [track.id, track]));
  let added = 0;
  let skipped = 0;
  for (const track of incoming) {
    if (kept.has(track.id)) {
      skipped += 1;
      continue;
    }
    kept.set(track.id, { ...track, addedAt: at });
    added += 1;
  }
  return { tracks: sortTracks([...kept.values()]), added, skipped };
}

/** 全量：这次选中什么，曲库就是什么；没选中的旧条目会被移掉 */
export function rebuildLibrary(incoming: MusicTrack[], existing: MusicTrack[], at = Date.now()): RebuildResult {
  const before = new Set(existing.map((track) => track.id));
  let added = 0;
  for (const track of incoming) {
    if (!before.has(track.id)) added += 1;
  }
  const after = new Set(incoming.map((track) => track.id));
  const removed = existing.filter((track) => !after.has(track.id)).length;
  return { tracks: sortTracks(incoming.map((track) => ({ ...track, addedAt: track.addedAt || at }))), added, removed };
}

/** 增量扫描只对「已经有曲库」的情况有意义，首次不该出现 */
export function canIncremental(library: MusicLibrary): boolean {
  return library.tracks.length > 0;
}

export function libraryStats(library: MusicLibrary): LibraryStats {
  const bytes = library.tracks.reduce((sum, track) => sum + (Number.isFinite(track.size) ? track.size : 0), 0);
  const count = library.tracks.length;
  const label = count === 0 ? '还没有曲目' : `${count} 首 · ${formatBytes(bytes)}`;
  return { count, bytes, label };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1);
  return `${text} ${units[unit]}`;
}

/** 把 0~1000 的滑块值换算成当前曲目的毫秒位置，脏值和越界都安全收敛。 */
export function positionFromSlider(durationMs: number, sliderValue: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const value = Number.isFinite(sliderValue) ? sliderValue : 0;
  const ratio = Math.min(1, Math.max(0, value / 1000));
  return Math.round(durationMs * ratio);
}

/** 卡片上只显示月-日 时:分，年份对「刚扫过」没意义 */
export function formatScanAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '还没扫过';
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function scanResultText(mode: Exclude<ScanMode, ''>, result: { added: number; skipped?: number; removed?: number }): string {
  if (mode === 'full') {
    if (!result.added && !result.removed) return '曲库没有变化';
    const parts = [`重建完成：${result.added} 首新曲目`];
    if (result.removed) parts.push(`移除 ${result.removed} 首`);
    return parts.join('，');
  }
  if (!result.added) return result.skipped ? `${result.skipped} 首都已在库里` : '没有选中音频文件';
  const parts = [`新增 ${result.added} 首`];
  if (result.skipped) parts.push(`跳过 ${result.skipped} 首重复`);
  return parts.join('，');
}

export function readLibrary(): MusicLibrary {
  try {
    const raw = uni.getStorageSync(MUSIC_STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return emptyLibrary();
    const value = raw as Partial<MusicLibrary>;
    const list = Array.isArray(value.tracks) ? value.tracks : [];
    const tracks: MusicTrack[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      const track = normalizeTrack(item, 0);
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(track);
    }
    const lastScanAt = Number(value.lastScanAt);
    const lastFullAt = Number(value.lastFullAt);
    const mode = value.lastMode;
    return {
      tracks: sortTracks(tracks),
      lastScanAt: Number.isFinite(lastScanAt) ? lastScanAt : 0,
      lastFullAt: Number.isFinite(lastFullAt) ? lastFullAt : 0,
      lastMode: mode === 'full' || mode === 'incremental' ? mode : ''
    };
  } catch {
    return emptyLibrary();
  }
}

export function saveLibrary(library: MusicLibrary): void {
  try {
    uni.setStorageSync(MUSIC_STORAGE_KEY, library);
  } catch {
    // 存储满了也不该让扫描流程卡死；下一轮读到的仍是旧库
  }
}

/** 忽略名单：读回来时去重、丢掉非字符串，脏数据不影响扫描 */
export function readIgnored(): string[] {
  try {
    const raw = uni.getStorageSync(MUSIC_IGNORED_KEY);
    if (!Array.isArray(raw)) return [];
    const set = new Set<string>();
    for (const item of raw) {
      if (typeof item === 'string' && item) set.add(item);
    }
    return [...set];
  } catch {
    return [];
  }
}

export function saveIgnored(ids: string[]): void {
  try {
    uni.setStorageSync(MUSIC_IGNORED_KEY, [...new Set(ids)]);
  } catch {
    // 存不下也只影响「下次还扫不扫得回来」，不该让删除动作失败
  }
}

/** 把曲目从曲库移除，并把它的 id 记进忽略名单（返回新的曲库和名单） */
export function removeTracks(
  library: MusicLibrary,
  ids: string[],
  ignored: string[]
): { library: MusicLibrary; ignored: string[] } {
  const drop = new Set(ids);
  const nextLibrary: MusicLibrary = {
    ...library,
    tracks: library.tracks.filter((track) => !drop.has(track.id))
  };
  const nextIgnored = [...new Set([...ignored, ...ids])];
  saveLibrary(nextLibrary);
  saveIgnored(nextIgnored);
  return { library: nextLibrary, ignored: nextIgnored };
}

/** 扫描结果先过一遍忽略名单：被手动删掉的歌不再进库 */
export function filterIgnored(tracks: MusicTrack[], ignored: string[]): MusicTrack[] {
  if (!ignored.length) return tracks;
  const set = new Set(ignored);
  return tracks.filter((track) => !set.has(track.id));
}

// ---------- 手动歌单 ----------

/** 读档：丢掉脏条目、去重 id、给缺字段补默认值 */
export function readPlaylists(): Playlist[] {
  try {
    const raw = uni.getStorageSync(MUSIC_PLAYLISTS_KEY);
    if (!Array.isArray(raw)) return [];
    const seenId = new Set<string>();
    const list: Playlist[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const value = item as Partial<Playlist>;
      if (typeof value.id !== 'string' || !value.id || seenId.has(value.id)) continue;
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      if (!name) continue;
      const ids = new Set<string>();
      if (Array.isArray(value.trackIds)) {
        for (const id of value.trackIds) if (typeof id === 'string' && id) ids.add(id);
      }
      seenId.add(value.id);
      list.push({
        id: value.id,
        name,
        trackIds: [...ids],
        createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : 0
      });
    }
    return list;
  } catch {
    return [];
  }
}

export function savePlaylists(list: Playlist[]): void {
  try {
    uni.setStorageSync(MUSIC_PLAYLISTS_KEY, list);
  } catch {
    // 存不下不影响本次内存里的操作
  }
}

/** 生成一个不撞车的歌单 id；不依赖 crypto，H5 / 真机都能用 */
export function newPlaylistId(at = Date.now()): string {
  return `pl_${at.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createPlaylist(name: string, existing: Playlist[], at = Date.now()): Playlist[] {
  const clean = name.trim();
  if (!clean) return existing;
  const playlist: Playlist = { id: newPlaylistId(at), name: clean.slice(0, 24), trackIds: [], createdAt: at };
  return [...existing, playlist];
}

export function renamePlaylist(id: string, name: string, existing: Playlist[]): Playlist[] {
  const clean = name.trim();
  if (!clean) return existing;
  return existing.map((item) => (item.id === id ? { ...item, name: clean.slice(0, 24) } : item));
}

export function deletePlaylist(id: string, existing: Playlist[]): Playlist[] {
  return existing.filter((item) => item.id !== id);
}

/** 往歌单里加曲目，已存在的跳过，保持原顺序 */
export function addToPlaylist(id: string, trackIds: string[], existing: Playlist[]): Playlist[] {
  return existing.map((item) => {
    if (item.id !== id) return item;
    const set = new Set(item.trackIds);
    const added = trackIds.filter((tid) => {
      if (!tid || set.has(tid)) return false;
      set.add(tid);
      return true;
    });
    return added.length ? { ...item, trackIds: [...item.trackIds, ...added] } : item;
  });
}

export function removeFromPlaylist(id: string, trackIds: string[], existing: Playlist[]): Playlist[] {
  const drop = new Set(trackIds);
  return existing.map((item) =>
    item.id === id ? { ...item, trackIds: item.trackIds.filter((tid) => !drop.has(tid)) } : item
  );
}

/** 把歌单里的 id 换成曲库里真实存在的曲目，顺序与歌单一致；已删的歌自动略过 */
export function tracksOfPlaylist(playlist: Playlist, library: MusicLibrary): MusicTrack[] {
  const byId = new Map(library.tracks.map((track) => [track.id, track]));
  const result: MusicTrack[] = [];
  const seen = new Set<string>();
  for (const id of playlist.trackIds) {
    if (seen.has(id)) continue;
    const track = byId.get(id);
    if (track) {
      seen.add(id);
      result.push(track);
    }
  }
  return result;
}
