import { beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = new Map<string, unknown>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => (bucket.has(key) ? bucket.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => void bucket.set(key, value),
  removeStorageSync: (key: string) => void bucket.delete(key)
});

const {
  clearBackground,
  deleteWallpaper,
  getBackground,
  getWallpapers,
  initStorage,
  replaceWallpaperData,
  saveBackground,
  useWallpaper,
  useWallpaperById,
  wallpaperUsage
} = await import('@/utils/storage');

const userItems = () => getWallpapers();
const names = () => getWallpapers().map((item) => item.name);

const PHOTO_A = 'data:image/jpeg;base64,QUFBQQ==';
const PHOTO_B = 'data:image/jpeg;base64,QkJCQg==';
const PHOTO_C = 'data:image/jpeg;base64,Q0NDQw==';

describe('历史壁纸', () => {
  beforeEach(() => bucket.clear());

  it('旧版只有当前背景时自动迁入历史，不丢用户原来的图', () => {
    saveBackground(PHOTO_A);
    initStorage();
    expect(userItems().map((item) => item.dataUrl)).toEqual([PHOTO_A]);
    expect(getBackground()).toBe(PHOTO_A);
  });

  it('首次启动图库是空的，不会预置任何壁纸', () => {
    initStorage();
    expect(getBackground()).toBe('');
    expect(getWallpapers()).toEqual([]);
  });

  it('老存档里指向内置测试壁纸的条目会在启动时清掉，当前背景回到默认渐变', () => {
    const legacy = '/static/wallpapers/miku.jpg';
    bucket.set('ky_v1_wallpapers', [
      { id: 'builtin_miku', name: 'Miku', dataUrl: legacy, createdAt: 0, lastUsedAt: 0, builtin: true },
      { dataUrl: PHOTO_A, name: '壁纸 1', createdAt: 100, lastUsedAt: 100 }
    ]);
    bucket.set('ky_v1_background', legacy);
    initStorage();
    expect(getWallpapers().map((item) => item.dataUrl)).toEqual([PHOTO_A]);
    expect(getBackground()).toBe('');
  });

  it('当前背景仍是内置壁纸但图库已经没这条时，也不会把死链写回历史', () => {
    bucket.set('ky_v1_background', '/static/wallpapers/miku.jpg');
    initStorage();
    expect(getBackground()).toBe('');
    expect(getWallpapers()).toEqual([]);
  });

  it('连续导入会保留所有图片，最近使用的排最前', () => {
    useWallpaper(PHOTO_A, 100);
    useWallpaper(PHOTO_B, 200);
    useWallpaper(PHOTO_C, 300);
    expect(userItems().map((item) => item.dataUrl)).toEqual([PHOTO_C, PHOTO_B, PHOTO_A]);
    expect(getBackground()).toBe(PHOTO_C);
  });

  it('名字跟着图片走：切来切去、换顺序都不改名', () => {
    useWallpaper(PHOTO_A, 100);
    useWallpaper(PHOTO_B, 200);
    useWallpaper(PHOTO_C, 300);
    // 图库按最近使用排序，所以显示顺序是 C、B、A，但名字是导入时定下的
    expect(names()).toEqual(['壁纸 3', '壁纸 2', '壁纸 1']);
    const idA = getWallpapers().find((item) => item.dataUrl === PHOTO_A)!.id;
    // 让 A 变成最近使用的一张，排到最前，但名字必须还是「壁纸 1」
    useWallpaperById(idA, 400);
    expect(getWallpapers()[0].dataUrl).toBe(PHOTO_A);
    expect(getWallpapers()[0].name).toBe('壁纸 1');
    expect(names()).toEqual(['壁纸 1', '壁纸 3', '壁纸 2']);
  });

  it('删掉中间一张后，其余壁纸不会重新编号，新导入的拿下一个空号', () => {
    useWallpaper(PHOTO_A, 100);
    useWallpaper(PHOTO_B, 200);
    useWallpaper(PHOTO_C, 300);
    const idB = getWallpapers().find((item) => item.dataUrl === PHOTO_B)!.id;
    deleteWallpaper(idB);
    expect(names()).toEqual(['壁纸 3', '壁纸 1']);
    useWallpaper('data:image/jpeg;base64,RERERQ==', 400);
    expect(names()).toEqual(['壁纸 4', '壁纸 3', '壁纸 1']);
  });

  it('老档没有名字时按导入顺序补，之后保持稳定', () => {
    bucket.set('ky_v1_wallpapers', [
      { dataUrl: PHOTO_B, createdAt: 200, lastUsedAt: 200 },
      { dataUrl: PHOTO_A, createdAt: 100, lastUsedAt: 100 }
    ]);
    expect(names()).toEqual(['壁纸 2', '壁纸 1']);
    useWallpaperById(getWallpapers()[0].id, 500);
    expect(getWallpapers().find((item) => item.dataUrl === PHOTO_B)!.name).toBe('壁纸 2');
  });

  it('重复导入同一张图只更新时间，不制造重复条目', () => {
    useWallpaper(PHOTO_A, 100);
    useWallpaper(PHOTO_B, 200);
    useWallpaper(PHOTO_A, 300);
    expect(getWallpapers()).toHaveLength(2);
    expect(getWallpapers()[0].dataUrl).toBe(PHOTO_A);
    expect(getWallpapers()[0].createdAt).toBe(100);
  });

  it('点历史条目即可快捷切换，并记住这次使用', () => {
    useWallpaper(PHOTO_A, 100);
    useWallpaper(PHOTO_B, 200);
    const id = getWallpapers().find((item) => item.dataUrl === PHOTO_A)!.id;
    expect(useWallpaperById(id, 300)).toBe(PHOTO_A);
    expect(getBackground()).toBe(PHOTO_A);
    expect(getWallpapers()[0].id).toBe(id);
  });

  it('停用当前背景只回默认渐变，历史原图仍在', () => {
    useWallpaper(PHOTO_A);
    clearBackground();
    expect(getBackground()).toBe('');
    expect(getWallpapers().map((item) => item.dataUrl)).toEqual([PHOTO_A]);
  });

  it('删除非当前壁纸不影响正在使用的背景', () => {
    useWallpaper(PHOTO_A, 100);
    useWallpaper(PHOTO_B, 200);
    const id = getWallpapers().find((item) => item.dataUrl === PHOTO_A)!.id;
    expect(deleteWallpaper(id)).toBe(PHOTO_B);
    expect(getBackground()).toBe(PHOTO_B);
    expect(getWallpapers().map((item) => item.dataUrl)).toEqual([PHOTO_B]);
  });

  it('删除正在使用的壁纸才回默认背景，其他历史继续保留', () => {
    useWallpaper(PHOTO_A, 100);
    useWallpaper(PHOTO_B, 200);
    const id = getWallpapers()[0].id;
    expect(deleteWallpaper(id)).toBe('');
    expect(getBackground()).toBe('');
    expect(getWallpapers().map((item) => item.dataUrl)).toEqual([PHOTO_A]);
  });

  it('坏数据和非图片字段不会混进图库', () => {
    bucket.set('ky_v1_wallpapers', [{ dataUrl: 'https://example.com/a.jpg' }, null, { dataUrl: PHOTO_A, createdAt: 10 }]);
    expect(getWallpapers()).toHaveLength(1);
    expect(getWallpapers()[0].dataUrl).toBe(PHOTO_A);
    expect(() => useWallpaper('not-an-image')).toThrow('壁纸格式不正确');
  });
});

describe('壁纸本地存储配额（v3.3.2）', () => {
  beforeEach(() => bucket.clear());

  it('当前背景只存 id 引用，不再把整张图复制一份', () => {
    useWallpaper(PHOTO_A, 100);
    const raw = bucket.get('ky_v1_background');
    expect(typeof raw).toBe('string');
    expect(String(raw).startsWith('wp:')).toBe(true);
    expect(getBackground()).toBe(PHOTO_A);
  });

  it('老存档里直接存整图的背景仍能读出来', () => {
    bucket.set('ky_v1_background', PHOTO_A);
    expect(getBackground()).toBe(PHOTO_A);
  });

  it('单独存背景但没进历史时不会把图弄丢', () => {
    saveBackground(PHOTO_A);
    expect(getBackground()).toBe(PHOTO_A);
    initStorage();
    expect(userItems().map((i) => i.dataUrl)).toEqual([PHOTO_A]);
  });

  it('删掉正在使用的壁纸后，背景回默认且不留悬空引用', () => {
    useWallpaper(PHOTO_A, 100);
    const id = getWallpapers()[0].id;
    expect(deleteWallpaper(id)).toBe('');
    expect(getBackground()).toBe('');
    expect(bucket.get('ky_v1_background') === undefined || bucket.get('ky_v1_background') === '').toBe(true);
  });

  it('压缩历史壁纸后 id / 名字稳定，当前背景跟到新图', () => {
    useWallpaper(PHOTO_A, 100);
    const before = getWallpapers()[0];
    const smaller = 'data:image/webp;base64,QUFB';
    replaceWallpaperData([{ id: before.id, dataUrl: smaller }]);
    const after = getWallpapers()[0];
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
    expect(after.dataUrl).toBe(smaller);
    expect(getBackground()).toBe(smaller);
  });

  it('用量估算包含历史与背景，且当前图只存了一份', () => {
    useWallpaper(PHOTO_A, 100);
    const usage = wallpaperUsage();
    expect(usage.count).toBe(1);
    expect(usage.chars).toBeGreaterThan(0);
    const bgRaw = String(bucket.get('ky_v1_background') ?? '');
    expect(bgRaw.length).toBeLessThan(PHOTO_A.length);
  });
});
