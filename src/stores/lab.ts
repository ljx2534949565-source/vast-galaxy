import { defineStore } from 'pinia';
import {
  canUseCloud,
  defaultAiConfig,
  isValidApiBase,
  isValidApiKey,
  normalizeApiBase,
  normalizeApiKey,
  normalizeModel,
  providerLabel,
  readAiConfig,
  saveAiConfig,
  switchProvider,
  type AiConfig,
  type AiProvider,
  type CheckResult
} from '@/utils/ai';
import {
  emptyHealth,
  healthOnFail,
  healthOnOk,
  healthState,
  readAiHealth,
  saveAiHealth,
  type AiHealth
} from '@/utils/aiHealth';
import {
  CHAT_KEEP,
  clearChat,
  readChat,
  readSystemPrompt,
  saveChat,
  saveSystemPrompt,
  type ChatTurn
} from '@/utils/chat';
import {
  addToPlaylist,
  canIncremental,
  createPlaylist,
  deletePlaylist,
  emptyLibrary,
  filterIgnored,
  libraryStats,
  mergeTracks,
  readIgnored,
  readLibrary,
  readPlaylists,
  rebuildLibrary,
  removeFromPlaylist,
  removeTracks,
  renamePlaylist,
  saveLibrary,
  savePlaylists,
  tracksFromFiles,
  type AudioFileLike,
  type MusicLibrary,
  type Playlist
} from '@/utils/music';

export interface ScanOutcome {
  mode: 'full' | 'incremental';
  added: number;
  skipped: number;
  removed: number;
}

/**
 * 两个实验功能的运行时状态。
 *
 * 只做「配置 + 索引」：AI 不发请求，音乐不播放。
 * 这样设置页能真的把流程跑一遍，而不用先赌上包体和权限。
 */
export const useLabStore = defineStore('lab', {
  state: () => ({
    ai: defaultAiConfig() as AiConfig,
    music: emptyLibrary() as MusicLibrary,
    /** 手动删除的曲目 id：全量/增量扫描时自动跳过这些歌 */
    ignored: [] as string[],
    /** 手动歌单：只存曲目 id，播放时回曲库取位置 */
    playlists: [] as Playlist[],
    /** 对话记录：跨板块切换不丢，重启后从本机读回来 */
    chat: [] as ChatTurn[],
    /** 这套云端参数通没通：带配置指纹，换 Key / 换地址就自动作废 */
    health: emptyHealth() as AiHealth,
    /** 本地模型：用户选中的 gguf 路径与名字（只存本机，启动后需重新加载进引擎） */
    localModelPath: '' as string,
    localModelName: '' as string,
    /** 本地模型当前是否已加载进推理引擎（内存态，不落盘） */
    localLoaded: false as boolean,
    /** 用户勾选过「以后不再显示」本地性能警告后，看教程不再弹那个警告 */
    localWarnHidden: false as boolean,
    /** 系统提示词（助教人设）：本地和云端共用这一份，设置页可改，落盘 */
    systemPrompt: '' as string,
    /** 是否在每轮回答后自动生成「你可能还想问」两条追问；默认开，设置页可关，落盘 */
    followUpsEnabled: true as boolean,
    ready: false,
    /** 文件选择器开着的时候挡住重复点击 */
    scanning: false
  }),
  getters: {
    aiReady: (state) => state.ai.provider !== null,
    aiLabel: (state) => providerLabel(state.ai.provider),
    cloudReady: (state) => canUseCloud(state.ai),
    hasLibrary: (state) => state.music.tracks.length > 0,
    /** 当前参数的连通结论：unknown / ok / failed */
    aiHealthState: (state) => healthState(state.health, state.ai),
    /** 增量扫描只在已经扫过一次之后才出现 */
    incrementalAvailable: (state) => canIncremental(state.music),
    stats: (state) => libraryStats(state.music)
  },
  actions: {
    init() {
      if (this.ready) return;
      this.ai = readAiConfig();
      this.music = readLibrary();
      this.ignored = readIgnored();
      this.playlists = readPlaylists();
      this.chat = readChat();
      this.health = readAiHealth();
      // 本地模型路径只记名字和路径；模型本身是否加载是内存态，重启后要用户重新加载
      try {
        this.localModelPath = String(uni.getStorageSync('ky_v1_local_model_path') || '');
        this.localModelName = String(uni.getStorageSync('ky_v1_local_model_name') || '');
      } catch {
        this.localModelPath = '';
        this.localModelName = '';
      }
      try {
        this.localWarnHidden = uni.getStorageSync('ky_v1_local_warn_hidden') === true;
      } catch {
        this.localWarnHidden = false;
      }
      this.systemPrompt = readSystemPrompt();
      // 追问开关：显式存过 false 才关，其余（没存过 / 读不到 / 旧版本）一律默认开
      try {
        this.followUpsEnabled = uni.getStorageSync('ky_v1_follow_ups_enabled') !== false;
      } catch {
        this.followUpsEnabled = true;
      }
      this.ready = true;
    },
    /** 记住用户选中的 gguf（路径可能随系统整理变化，下次加载失败会提示重选） */
    setLocalModel(path: string, name: string) {
      this.localModelPath = path;
      this.localModelName = name;
      this.localLoaded = false;
      try {
        uni.setStorageSync('ky_v1_local_model_path', path);
        uni.setStorageSync('ky_v1_local_model_name', name);
      } catch { /* 存不下就只留内存 */ }
    },
    setLocalLoaded(loaded: boolean) {
      this.localLoaded = loaded;
    },
    /** 用户勾选「以后不再显示」本地性能警告 */
    hideLocalWarn() {
      this.localWarnHidden = true;
      try {
        uni.setStorageSync('ky_v1_local_warn_hidden', true);
      } catch { /* 存不下就只留内存 */ }
    },
    /** 保存系统提示词；传空串恢复默认 */
    setSystemPrompt(text: string) {
      this.systemPrompt = saveSystemPrompt(text);
    },
    /** 开/关「每轮回答后自动生成追问」；关闭时清掉已有的追问按钮 */
    setFollowUpsEnabled(on: boolean) {
      this.followUpsEnabled = on === true;
      if (!this.followUpsEnabled) {
        this.chat = this.chat.map((turn) => (turn.followUps ? { ...turn, followUps: undefined } : turn));
        saveChat(this.chat);
      }
      try {
        uni.setStorageSync('ky_v1_follow_ups_enabled', this.followUpsEnabled);
      } catch { /* 存不下就只留内存 */ }
    },
    /** 模型真的回了一句话：记下「这套参数是通的」 */
    markAiOk(at = Date.now()) {
      this.health = healthOnOk(this.ai, at);
      saveAiHealth(this.health);
    },
    /** 请求失败：结论翻成「连接失败」，下一次成功会自动翻回来 */
    markAiFail(reason: string, at = Date.now()) {
      this.health = healthOnFail(this.health, this.ai, reason, at);
      saveAiHealth(this.health);
    },
    /** 用户执意选本地：清掉云端参数，等他自己去放模型 */
    chooseLocal(at = Date.now()) {
      this.ai = switchProvider(this.ai, 'local', at);
      saveAiConfig(this.ai);
    },
    /** 云端：先开联网，再由 saveCloud 落 Key；顺序反了会出现「有 Key 但没网」 */
    setNetwork(on: boolean) {
      this.ai = { ...this.ai, network: on === true };
      saveAiConfig(this.ai);
    },
    saveCloud(key: string, base: string, model: string): CheckResult {
      const keyCheck = isValidApiKey(key);
      if (!keyCheck.ok) return keyCheck;
      const baseCheck = isValidApiBase(base);
      if (!baseCheck.ok) return baseCheck;
      this.ai = {
        ...switchProvider(this.ai, 'cloud'),
        network: this.ai.network,
        apiKey: normalizeApiKey(key),
        apiBase: normalizeApiBase(base),
        model: normalizeModel(model)
      };
      saveAiConfig(this.ai);
      return { ok: true, reason: '' };
    },
    markGuideRead(at = Date.now()) {
      this.ai = { ...this.ai, guideAt: at };
      saveAiConfig(this.ai);
    },
    /** 换方案 = 回到「请选择实现方案」，两套参数一起清掉 */
    resetProvider() {
      this.ai = { ...defaultAiConfig(), decidedAt: 0 };
      saveAiConfig(this.ai);
    },
    setProvider(provider: AiProvider, at = Date.now()) {
      this.ai = switchProvider(this.ai, provider, at);
      saveAiConfig(this.ai);
    },
    /**
     * 扫描曲库。full 重建、incremental 只并新歌；
     * 库里还是空的时候传 incremental 会自动按 full 处理，避免出现「增量扫完仍是空」。
     */
    scan(files: AudioFileLike[], mode: 'full' | 'incremental'): ScanOutcome {
      const at = Date.now();
      // 手动删掉的歌先滤掉，再入库；否则下次全量扫描又把它们请回来
      const incoming = filterIgnored(tracksFromFiles(files, at), this.ignored);
      const effective: 'full' | 'incremental' = mode === 'incremental' && this.music.tracks.length ? 'incremental' : 'full';
      if (effective === 'full') {
        const result = rebuildLibrary(incoming, this.music.tracks, at);
        this.music = {
          tracks: result.tracks,
          lastScanAt: at,
          lastFullAt: at,
          lastMode: 'full'
        };
        saveLibrary(this.music);
        return { mode: 'full', added: result.added, skipped: 0, removed: result.removed };
      }
      const result = mergeTracks(this.music.tracks, incoming, at);
      this.music = {
        tracks: result.tracks,
        lastScanAt: at,
        lastFullAt: this.music.lastFullAt,
        lastMode: 'incremental'
      };
      saveLibrary(this.music);
      return { mode: 'incremental', added: result.added, skipped: result.skipped, removed: 0 };
    },
    /** 手动删除曲目：从曲库移除 + 记进忽略名单，下次扫描不再扫回来 */
    deleteTracks(ids: string[]) {
      const result = removeTracks(this.music, ids, this.ignored);
      this.music = result.library;
      this.ignored = result.ignored;
      // 已删的歌也从所有歌单里摘掉，免得歌单点开是空的
      this.playlists = this.playlists.map((list) => ({
        ...list,
        trackIds: list.trackIds.filter((id) => !ids.includes(id))
      }));
      savePlaylists(this.playlists);
    },
    /** 新建歌单，返回新歌单 id 方便界面立刻选中 */
    addPlaylist(name: string): string {
      const before = new Set(this.playlists.map((item) => item.id));
      const next = createPlaylist(name, this.playlists);
      const created = next.find((item) => !before.has(item.id));
      this.playlists = next;
      savePlaylists(next);
      return created?.id ?? '';
    },
    renamePlaylist(id: string, name: string) {
      this.playlists = renamePlaylist(id, name, this.playlists);
      savePlaylists(this.playlists);
    },
    removePlaylist(id: string) {
      this.playlists = deletePlaylist(id, this.playlists);
      savePlaylists(this.playlists);
    },
    addTracksToPlaylist(id: string, trackIds: string[]) {
      this.playlists = addToPlaylist(id, trackIds, this.playlists);
      savePlaylists(this.playlists);
    },
    removeTracksFromPlaylist(id: string, trackIds: string[]) {
      this.playlists = removeFromPlaylist(id, trackIds, this.playlists);
      savePlaylists(this.playlists);
    },
    clearLibrary() {
      this.music = emptyLibrary();
      saveLibrary(this.music);
    },
    /**
     * 追加一条。这里不能用 trimChat 之后的数组直接覆盖 state：
     * 刚落下的 assistant 气泡内容还是空的，会被 trimChat 当成脏数据丢掉，
     * 于是逐字填入时就写到了上一条用户消息上。
     */
    appendChat(turn: ChatTurn) {
      const next = [...this.chat, turn].slice(-CHAT_KEEP);
      while (next.length && next[0].role !== 'user') next.shift();
      this.chat = next;
      saveChat(next);
    },
    /** 最后一条的正文改掉（逐字吐字、失败改错都用它），不新增气泡 */
    patchLastChat(patch: Partial<ChatTurn>) {
      if (!this.chat.length) return;
      const next = [...this.chat];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      this.chat = next;
      saveChat(this.chat);
    },
    resetChat() {
      this.chat = [];
      clearChat();
    }
  }
});
