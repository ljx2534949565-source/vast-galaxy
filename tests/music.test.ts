import { beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = new Map<string, unknown>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => (bucket.has(key) ? bucket.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => void bucket.set(key, value),
  removeStorageSync: (key: string) => void bucket.delete(key)
});

const {
  MUSIC_STORAGE_KEY,
  MUSIC_IGNORED_KEY,
  MUSIC_PLAYLISTS_KEY,
  MIN_TRACK_MS,
  addToPlaylist,
  canIncremental,
  createPlaylist,
  deletePlaylist,
  emptyLibrary,
  extensionOf,
  filterIgnored,
  formatBytes,
  formatScanAt,
  isAudioName,
  libraryStats,
  mergeTracks,
  positionFromSlider,
  readIgnored,
  readLibrary,
  readPlaylists,
  rebuildLibrary,
  removeFromPlaylist,
  removeTracks,
  renamePlaylist,
  saveIgnored,
  saveLibrary,
  savePlaylists,
  scanResultText,
  trackId,
  tracksFromFiles,
  tracksOfPlaylist
} = await import('@/utils/music');

const file = (name: string, size: number) => ({ name, size });

describe('本地音乐曲库', () => {
  beforeEach(() => bucket.clear());

  it('只认常见音频后缀，大小写都算', () => {
    expect(extensionOf('Track 01.MP3')).toBe('mp3');
    expect(extensionOf('no-ext')).toBe('');
    expect(extensionOf('trailing.')).toBe('');
    expect(isAudioName('a.flac')).toBe(true);
    expect(isAudioName('a.m4a')).toBe(true);
    expect(isAudioName('cover.jpg')).toBe(false);
    expect(isAudioName('notes.txt')).toBe(false);
  });

  it('同名同大小算同一首，换目录不会堆出两条', () => {
    expect(trackId('a.mp3', 100)).toBe(trackId('A.MP3', 100));
    expect(trackId('a.mp3', 100)).not.toBe(trackId('a.mp3', 101));
  });

  it('选进来的杂文件直接丢掉，不报错也不占位', () => {
    const tracks = tracksFromFiles([file('a.mp3', 100), file('readme.txt', 10), file('b.flac', 200)]);
    expect(tracks.map((track) => track.name)).toEqual(['a.mp3', 'b.flac']);
    expect(tracks[0].ext).toBe('mp3');
    expect(tracks[0].size).toBe(100);
  });

  it('列表按文件名排，数字按数值比（Track 2 在 Track 10 前面）', () => {
    const tracks = tracksFromFiles([file('Track 10.mp3', 1), file('Track 2.mp3', 1), file('Track 1.mp3', 1)]);
    expect(tracks.map((track) => track.name)).toEqual(['Track 1.mp3', 'Track 2.mp3', 'Track 10.mp3']);
  });

  it('增量只加新歌，重复的原样跳过', () => {
    const existing = tracksFromFiles([file('a.mp3', 100)]);
    const incoming = tracksFromFiles([file('a.mp3', 100), file('b.mp3', 200)]);
    const result = mergeTracks(existing, incoming, 1000);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.tracks.map((track) => track.name)).toEqual(['a.mp3', 'b.mp3']);
    expect(result.tracks[0].addedAt).toBe(existing[0].addedAt);
    expect(result.tracks[1].addedAt).toBe(1000);
  });

  it('全量是重建：没选中的旧条目会被移掉，并如实报数', () => {
    const existing = tracksFromFiles([file('a.mp3', 100), file('b.mp3', 200)]);
    const incoming = tracksFromFiles([file('b.mp3', 200), file('c.mp3', 300)]);
    const result = rebuildLibrary(incoming, existing, 2000);
    expect(result.tracks.map((track) => track.name)).toEqual(['b.mp3', 'c.mp3']);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
  });

  it('增量扫描只在库里已经有歌时才该出现', () => {
    expect(canIncremental(emptyLibrary())).toBe(false);
    expect(canIncremental({ ...emptyLibrary(), tracks: tracksFromFiles([file('a.mp3', 1)]) })).toBe(true);
  });

  it('统计条给出首数与合计大小', () => {
    const library = { ...emptyLibrary(), tracks: tracksFromFiles([file('a.mp3', 1048576), file('b.mp3', 2097152)]) };
    const stats = libraryStats(library);
    expect(stats.count).toBe(2);
    expect(stats.bytes).toBe(3145728);
    expect(stats.label).toBe('2 首 · 3.0 MB');
    expect(libraryStats(emptyLibrary()).label).toBe('还没有曲目');
  });

  it('大小换算不会出现 0.0 或者超长小数', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(3670016)).toBe('3.5 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
  });

  it('时间只显示月-日 时:分，没扫过时给一句人话', () => {
    expect(formatScanAt(0)).toBe('还没扫过');
    const at = new Date(2026, 10, 14, 2, 30).getTime();
    expect(formatScanAt(at)).toBe('11-14 02:30');
  });

  it('扫描结果文案分场景，别一律「完成」', () => {
    expect(scanResultText('full', { added: 3, removed: 2 })).toBe('重建完成：3 首新曲目，移除 2 首');
    expect(scanResultText('full', { added: 0, removed: 0 })).toBe('曲库没有变化');
    expect(scanResultText('incremental', { added: 2, skipped: 1 })).toBe('新增 2 首，跳过 1 首重复');
    expect(scanResultText('incremental', { added: 0, skipped: 5 })).toBe('5 首都已在库里');
    expect(scanResultText('incremental', { added: 0, skipped: 0 })).toBe('没有选中音频文件');
  });

  it('读档时丢掉非音频、重复和非法的条目', () => {
    bucket.set(MUSIC_STORAGE_KEY, {
      tracks: [
        { name: 'a.mp3', size: 100, addedAt: 5 },
        { name: 'readme.txt', size: 10 },
        { name: 'a.mp3', size: 100 },
        { name: 42 },
        null
      ],
      lastScanAt: 'yesterday',
      lastFullAt: 1700000000000,
      lastMode: 'incremental'
    });
    const library = readLibrary();
    expect(library.tracks).toHaveLength(1);
    expect(library.tracks[0].name).toBe('a.mp3');
    expect(library.lastScanAt).toBe(0);
    expect(library.lastFullAt).toBe(1700000000000);
    expect(library.lastMode).toBe('incremental');
  });

  it('存档往返一致；没存过时是空库', () => {
    expect(readLibrary().tracks).toEqual([]);
    const library = {
      tracks: tracksFromFiles([file('x.ogg', 2048)]),
      lastScanAt: 1000,
      lastFullAt: 1000,
      lastMode: 'full' as const
    };
    saveLibrary(library);
    expect(readLibrary()).toEqual(library);
  });

  it('媒体库给的 uri 和时长跟着曲目存下来，读档后还在', () => {
    const scanned = tracksFromFiles([
      { name: 'song.mp3', size: 100, uri: 'content://media/external/audio/media/42', duration: 233000 }
    ]);
    expect(scanned[0].uri).toBe('content://media/external/audio/media/42');
    expect(scanned[0].duration).toBe(233000);
    saveLibrary({ ...emptyLibrary(), tracks: scanned, lastMode: 'full' });
    const read = readLibrary().tracks[0];
    expect(read.uri).toBe('content://media/external/audio/media/42');
    expect(read.duration).toBe(233000);
  });

  it('旧曲库没有 uri 也能读；脏位置不写成曲目路径', () => {
    bucket.set(MUSIC_STORAGE_KEY, {
      tracks: [
        { name: 'old.mp3', size: 100 },
        { name: 'bad.mp3', size: 200, uri: 'javascript:alert(1)', duration: -5 }
      ]
    });
    const tracks = readLibrary().tracks;
    expect(tracks[0].uri).toBeUndefined();
    expect(tracks[1].uri).toBeUndefined();
    expect(tracks[1].duration).toBeUndefined();
  });

  it('30 秒及以下的短音频（音效）不入曲库，边界与读不到时长分开处理', () => {
    const tracks = tracksFromFiles([
      { name: 'effect-short.mp3', size: 100, duration: 3000 },       // 3 秒：过滤
      { name: 'effect-boundary.mp3', size: 100, duration: MIN_TRACK_MS }, // 正好 30 秒：过滤
      { name: 'song.mp3', size: 100, duration: MIN_TRACK_MS + 1 },  // 30 秒 + 1ms：保留
      { name: 'long.flac', size: 100, duration: 200000 },           // 正常歌：保留
      { name: 'no-duration.mp3', size: 100 }                        // 没时长字段：保留
    ]);
    expect(tracks.map((track) => track.name)).toEqual(['long.flac', 'no-duration.mp3', 'song.mp3']);
  });

  it('旧存档里已扫进来的短音效，读档时自动清掉，正常歌不受影响', () => {
    bucket.set(MUSIC_STORAGE_KEY, {
      tracks: [
        { name: 'old-effect.mp3', size: 100, duration: 5000 },       // 已存的音效：读档过滤
        { name: 'old-song.mp3', size: 200, duration: 180000 },       // 已存的歌：保留
        { name: 'legacy.mp3', size: 300 }                            // 老曲库无时长：保留
      ]
    });
    expect(readLibrary().tracks.map((track) => track.name)).toEqual(['legacy.mp3', 'old-song.mp3']);
  });

  it('同名同大小但换了 uri，增量扫描不会把已存的位置覆盖掉', () => {
    const existing = tracksFromFiles([
      { name: 'a.mp3', size: 100, uri: 'content://media/external/audio/media/1', duration: 120000 }
    ]);
    const incoming = tracksFromFiles([{ name: 'a.mp3', size: 100, uri: 'content://media/external/audio/media/2' }]);
    const result = mergeTracks(existing, incoming, 1000);
    expect(result.added).toBe(0);
    expect(result.tracks[0].uri).toBe('content://media/external/audio/media/1');
  });

  describe('播放进度换算', () => {
    it('滑块按当前曲时长换算到真实毫秒，不会固定回起点', () => {
      expect(positionFromSlider(226000, 500)).toBe(113000);
      expect(positionFromSlider(226000, 750)).toBe(169500);
      expect(positionFromSlider(226000, 0)).toBe(0);
    });

    it('进度输入越界或时长未知时安全收敛', () => {
      expect(positionFromSlider(226000, -10)).toBe(0);
      expect(positionFromSlider(226000, 1200)).toBe(226000);
      expect(positionFromSlider(0, 500)).toBe(0);
      expect(positionFromSlider(Number.NaN, 500)).toBe(0);
      expect(positionFromSlider(226000, Number.NaN)).toBe(0);
    });
  });

  describe('手动删除 + 忽略名单', () => {
    it('读档去重去脏；没存过时是空名单', () => {
      expect(readIgnored()).toEqual([]);
      bucket.set(MUSIC_IGNORED_KEY, ['tr_a', 'tr_a', '', 42, null, 'tr_b']);
      expect(readIgnored()).toEqual(['tr_a', 'tr_b']);
    });

    it('移除曲目会把它从曲库删掉、同时写进忽略名单，并落盘', () => {
      const library = { ...emptyLibrary(), tracks: tracksFromFiles([file('a.mp3', 100), file('b.mp3', 200)]) };
      const removedId = library.tracks[0].id;
      const result = removeTracks(library, [removedId], []);
      expect(result.library.tracks.map((track) => track.name)).toEqual(['b.mp3']);
      expect(result.ignored).toEqual([removedId]);
      expect(readLibrary().tracks.map((track) => track.name)).toEqual(['b.mp3']);
      expect(readIgnored()).toEqual([removedId]);
    });

    it('扫描结果按忽略名单过滤；名单为空时原样返回', () => {
      const scanned = tracksFromFiles([file('a.mp3', 100), file('b.mp3', 200)]);
      expect(filterIgnored(scanned, [])).toBe(scanned);
      expect(filterIgnored(scanned, [scanned[0].id]).map((track) => track.name)).toEqual(['b.mp3']);
    });

    it('删除后再全量扫描，被删的歌不会回来；其他歌照常重建', () => {
      const first = tracksFromFiles([file('old.mp3', 100), file('keep.mp3', 200)]);
      let library = { ...emptyLibrary(), tracks: [...first], lastMode: 'full' as const };
      const removed = removeTracks(library, [trackId('old.mp3', 100)], []);
      library = removed.library;
      // 下一轮媒体库仍返回 old + keep，但 old 在忽略名单里
      const rescanned = tracksFromFiles([file('old.mp3', 100), file('keep.mp3', 200), file('new.mp3', 300)]);
      const incoming = filterIgnored(rescanned, removed.ignored);
      const rebuilt = rebuildLibrary(incoming, library.tracks, 3000);
      expect(rebuilt.tracks.map((track) => track.name)).toEqual(['keep.mp3', 'new.mp3']);
      expect(rebuilt.added).toBe(1);
    });
  });

  describe('手动歌单', () => {
    it('读档丢掉脏歌单、去重 id、给缺字段补默认值', () => {
      bucket.set(MUSIC_PLAYLISTS_KEY, [
        { id: 'p1', name: '跑步', trackIds: ['t1', 't1', '', 42], createdAt: 100 },
        { id: 'p1', name: '重复 id', trackIds: [] },
        { id: 'p2', name: '  ' },
        { name: '没 id' },
        null
      ]);
      const list = readPlaylists();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('跑步');
      expect(list[0].trackIds).toEqual(['t1']);
      expect(list[0].createdAt).toBe(100);
    });

    it('新建 / 重命名 / 删除歌单，并落盘', () => {
      let list = createPlaylist('  跑步歌单  ', [], 1000);
      const id = list[0].id;
      expect(list[0].name).toBe('跑步歌单');
      list = renamePlaylist(id, '骑车', list);
      expect(list[0].name).toBe('骑车');
      list = deletePlaylist(id, list);
      expect(list).toHaveLength(0);
      savePlaylists(list);
      expect(readPlaylists()).toEqual([]);
    });

    it('加曲目去重、保持顺序；移除只摘指定的', () => {
      let list = createPlaylist('A', [], 1);
      const id = list[0].id;
      list = addToPlaylist(id, ['t1', 't2', 't1'], list);
      expect(list[0].trackIds).toEqual(['t1', 't2']);
      list = addToPlaylist(id, ['t3'], list);
      expect(list[0].trackIds).toEqual(['t1', 't2', 't3']);
      list = removeFromPlaylist(id, ['t2'], list);
      expect(list[0].trackIds).toEqual(['t1', 't3']);
    });

    it('播放歌单按歌单顺序取曲库里的歌，已删的歌自动略过', () => {
      const library = { ...emptyLibrary(), tracks: tracksFromFiles([file('a.mp3', 100), file('b.mp3', 200), file('c.mp3', 300)]) };
      let list = createPlaylist('顺序', [], 1);
      const id = list[0].id;
      // 故意按 c、a 顺序加入，b 不在歌单；再塞一个曲库里没有的死 id
      list = addToPlaylist(id, [trackId('c.mp3', 300), trackId('a.mp3', 100), 'dead-id'], list);
      expect(tracksOfPlaylist(list[0], library).map((track) => track.name)).toEqual(['c.mp3', 'a.mp3']);
    });

    it('删除曲目后，歌单里对应的 id 也会被清掉', () => {
      const tracks = tracksFromFiles([file('a.mp3', 100), file('b.mp3', 200)]);
      const library = { ...emptyLibrary(), tracks };
      let list = createPlaylist('A', [], 1);
      list = addToPlaylist(list[0].id, [tracks[0].id, tracks[1].id], list);
      const result = removeTracks(library, [tracks[0].id], []);
      const cleaned = list.map((p) => ({ ...p, trackIds: p.trackIds.filter((id) => id !== tracks[0].id) }));
      expect(tracksOfPlaylist(cleaned[0], result.library).map((track) => track.name)).toEqual(['b.mp3']);
    });
  });
});
