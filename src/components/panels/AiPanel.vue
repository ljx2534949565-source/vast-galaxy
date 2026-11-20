<template>
  <view class="ai-page">
    <!-- 顶部一行固定在屏幕上：聊天从它下面滚过去，它不会跟着消失 -->
    <view class="ai-head" :class="{ 'is-solid': scrolled, 'is-chat': view === 'chat' }">
      <view class="top-bar">
        <button v-if="view === 'chat'" class="icon-button back-button" aria-label="返回模型页" @click="backToModels">
          <AppIcon name="back" :size="22" />
        </button>
        <view class="top-heading">
          <view class="top-title">{{ view === 'chat' ? 'AI 对话' : 'AI' }}</view>
          <view class="top-subtitle" :class="{ 'is-alert': headStatus.tone === 'alert', 'is-ok': headStatus.tone === 'ok' }">{{ headStatus.text }}</view>
        </view>
        <view class="top-actions">
          <button v-if="view === 'chat' && lab.chat.length" class="icon-button" aria-label="清空对话" @click="askClear">
            <AppIcon name="trash" :size="21" />
          </button>
          <button class="icon-button" aria-label="设置" @click="openSettings">
            <AppIcon name="gear" :size="22" />
          </button>
        </view>
      </view>
    </view>

    <!-- ═══ 一级：模型页 ═══
         v3.9.12：不再按"已选哪套方案"只显示一张卡，而是云端 / 本地两张平级卡片
         常驻同屏。每张卡片自己管状态、自己带「开始对话」按钮，点谁就进谁的对话。 -->
    <view v-if="view === 'models'" class="page-content model-home">

      <!-- ── 上：云端模型卡片 ── -->
      <view class="glass-card provider-card cloud-provider fade-up">
        <view class="provider-head">
          <view class="provider-badge is-cloud">
            <AppIcon name="cloud" :size="18" />
            <text>云端模型</text>
          </view>
          <text class="provider-status" :class="cloudStatus.tone ? 'is-' + cloudStatus.tone : ''">{{ cloudStatus.short }}</text>
        </view>
        <view class="provider-title">{{ cloudStatus.title }}</view>
        <view class="provider-copy">{{ cloudStatus.hint }}</view>

        <!-- 云端配置入口：没连通时给一个明确的设置入口，随时可点 -->
        <button class="provider-config" @click="openKey">
          <AppIcon name="gear" :size="16" />
          <text>{{ cloudConfigured ? '修改云端配置' : '填写 API Key / 联网' }}</text>
        </button>

        <button class="primary-button enter-chat-btn" :disabled="!cloudStatus.ready" @click="startChat('cloud')">
          <text>{{ cloudStatus.ready ? '开始对话' : '未就绪' }}</text>
          <AppIcon name="send" :size="17" />
        </button>
      </view>

      <!-- ── 下：本地模型卡片 ── -->
      <view class="glass-card provider-card local-provider fade-up">
        <view class="provider-head">
          <view class="provider-badge is-local">
            <AppIcon name="cpu" :size="18" />
            <text>本地模型</text>
          </view>
          <text class="provider-status" :class="localStatus.tone ? 'is-' + localStatus.tone : ''">{{ localStatus.short }}</text>
        </view>
        <view class="provider-title">{{ localStatus.title }}</view>
        <view class="provider-copy">{{ localStatus.hint }}</view>

        <!-- 本地卡片自带电源开关：关掉就卸模型省性能 -->
        <view class="provider-switch-row">
          <view class="switch-label">
            <text class="switch-name">本地引擎</text>
            <text class="switch-state" :class="{ 'is-on': lab.localLoaded }">
              {{ lab.localLoaded ? '运行中 · 占运行内存' : '已关闭 · 不占性能' }}
            </text>
          </view>
          <button
            class="engine-toggle"
            :class="{ 'is-on': lab.localLoaded, 'is-busy': loadingModel }"
            :disabled="loadingModel"
            role="switch"
            :aria-checked="lab.localLoaded ? 'true' : 'false'"
            aria-label="本地模型开关"
            @click="toggleEngine"
          >
            <view class="engine-knob" />
          </button>
        </view>

        <!-- 本地还没加载时的动作区：选文件 / 看教程 -->
        <template v-if="!lab.localLoaded">
          <button class="provider-config" :disabled="loadingModel" @click="pickFromFile">
            <AppIcon name="folder" :size="16" />
            <text>{{ loadingModel ? '正在加载，请稍候…' : (lab.localModelPath ? '重新选择模型文件' : '选择本地模型文件 .gguf') }}</text>
          </button>
          <view v-if="loadError" class="load-error">{{ loadError }}</view>
          <button class="provider-config is-quiet" @click="openGuide">
            <AppIcon name="book" :size="16" />
            <text>看部署教程</text>
          </button>
        </template>

        <!-- 已存模型副本管理 -->
        <view class="stored-section">
          <view class="stored-head">
            <text class="stored-title">手机里已存的模型</text>
            <text v-if="storedTotal" class="stored-total">共 {{ storedTotal }}</text>
            <button class="stored-refresh" :disabled="storedLoading" @click="refreshStored">刷新</button>
          </view>
          <template v-if="stored.length">
            <view v-for="file in stored" :key="file.path" class="stored-item" :class="{ 'is-active': file.active }">
              <view class="stored-meta">
                <text class="stored-name">{{ file.name }}</text>
                <text class="stored-sub">{{ formatModelSize(file.size) }}<text v-if="file.active" class="stored-active-tag"> · 当前使用中</text></text>
              </view>
              <button
                v-if="!file.active"
                class="stored-use"
                :disabled="loadingModel || !!switchingTo"
                @click="switchToStored(file)"
              >
                {{ switchingTo === file.name ? '切换中' : '用这个' }}
              </button>
              <button class="stored-del" :disabled="deleting" @click="askDeleteStored(file)">
                <AppIcon name="trash" :size="16" />
              </button>
            </view>
            <view class="stored-hint">点「用这个」就能换一个模型开启（不用先关引擎，也不用重新选文件）。卸载只是关掉引擎不删文件；这里删除才会真正腾出空间。源文件在「下载」目录里的不受影响。</view>
          </template>
          <view v-else class="stored-empty">
            {{ storedLoading ? '正在读取…' : '还没有存过模型副本' }}
          </view>
        </view>

        <button class="primary-button enter-chat-btn" :disabled="!localStatus.ready" @click="startChat('local')">
          <text>{{ localStatus.ready ? '开始对话' : '未加载模型' }}</text>
          <AppIcon name="send" :size="17" />
        </button>
      </view>
    </view>

    <!-- ═══ 二级：对话页（只聊天，不放模型开关） ═══ -->
    <view v-else class="page-content chat-view">
      <view v-if="!lab.chat.length" class="suggest fade-up">
        <view class="suggest-title">可以这样问</view>
        <button v-for="item in suggestions" :key="item" class="suggest-item" @click="ask(item)">
          <text class="suggest-text">{{ item }}</text>
          <AppIcon name="send" :size="15" />
        </button>
      </view>

      <view class="thread">
        <view v-for="(turn, index) in lab.chat" :key="index" class="turn" :class="turn.role">
          <view class="turn-avatar" :class="turn.role">
            <AppIcon :name="turn.role === 'user' ? 'pen' : 'spark'" :size="15" />
          </view>
          <view
            class="bubble"
            :class="[turn.role, { 'is-failed': turn.failed }]"
            @touchstart="onBubblePressStart"
            @touchmove="onBubblePressMove"
            @touchend="onBubblePressEnd"
            @touchcancel="onBubblePressEnd"
          >
            <!-- 助教回答渲染 Markdown（表格/列表/加粗等）；用户消息保持纯文本 -->
            <view v-if="turn.role === 'assistant'" class="bubble-text md-body" v-html="renderMarkdown(turn.content)" />
            <text v-else class="bubble-text">{{ turn.content }}</text>
            <view v-if="turn.failed" class="bubble-actions">
              <button class="retry" @click="retry">重发</button>
              <button class="retry is-ghost" @click="openKey">改接入参数</button>
            </view>
          </view>
          <!-- 回答朗读：非失败的助教回答下面挂一个小喇叭，点了用本地 TTS 读，再点停 -->
          <button
            v-if="turn.role === 'assistant' && !turn.failed && turn.content"
            class="speak-btn"
            :class="{ 'is-speaking': speakingIndex === index }"
            :aria-label="speakingIndex === index ? '停止朗读' : '朗读这条回答'"
            @click.stop="toggleSpeak(index)"
            @touchstart.stop
          >
            <AppIcon name="volume" :size="15" />
            <text>{{ speakingIndex === index ? '停止' : '朗读' }}</text>
          </button>
          <!-- 模型生成的「你可能还想问」：只在最新一条 AI 回复下显示；
               用户一发下一句（出现更新的消息），旧回答的追问就自动收起 -->
          <view
            v-if="lab.followUpsEnabled && index === lab.chat.length - 1 && turn.role === 'assistant' && !turn.failed && turn.followUps && turn.followUps.length"
            class="followups"
          >
            <view class="followups-title">你可能还想问</view>
            <button
              v-for="q in turn.followUps"
              :key="q"
              class="followup-item"
              @click.stop="useFollowUp(q)"
              @touchstart.stop
            >
              <text class="followup-text">{{ q }}</text>
              <AppIcon name="send" :size="13" />
            </button>
          </view>
        </view>

        <!-- 首字到达前只显示这一条「正在思考」；首字一到就收起，改由上面的回答气泡逐字显示 -->
        <view v-if="waiting && !firstToken" class="turn assistant">
          <view class="turn-avatar assistant"><AppIcon name="spark" :size="15" /></view>
          <view class="bubble assistant is-waiting">
            <text class="thinking-text">正在思考</text>
            <view class="dot" /><view class="dot" /><view class="dot" />
          </view>
        </view>
      </view>
    </view>

    <!-- 输入条：只在二级对话页显示 -->
    <view v-if="view === 'chat' && status.ready" class="composer">
      <view class="composer-inner glass-card">
        <textarea
          v-model="draft"
          class="composer-input"
          :maxlength="MAX_INPUT"
          :disabled="waiting"
          :focus="composerFocused"
          auto-height
          :show-confirm-bar="false"
          placeholder="问词、问句子，或贴一段阅读…"
          placeholder-class="composer-ph"
          confirm-type="send"
          @blur="composerFocused = false"
          @confirm="submit"
        />
        <button class="send" :class="{ 'is-ready': canSend }" :disabled="!canSend" aria-label="发送" @click="submit">
          <AppIcon name="send" :size="19" />
        </button>
      </view>
      <view class="composer-hint">{{ composerHint }}</view>
    </view>

    <AiSetupDialog v-model="setupOpen" :start="setupStart" @local="onLocal" @saved="onSaved" />

    <ConfirmDialog
      v-if="clearOpen"
      :model-value="true"
      title="清空对话"
      content="这台手机上的对话记录会被删掉，API Key 和接入方案不受影响。"
      confirm-text="清空"
      cancel-text="留着"
      :danger="true"
      @confirm="doClear"
      @cancel="clearOpen = false"
    />

    <ConfirmDialog
      v-if="unloadOpen"
      :model-value="true"
      title="关闭本地模型"
      :content="`关闭 ${lab.localModelName || '本地模型'}，释放它占用的运行内存。只是关掉引擎，模型文件仍留在手机里、不会删除，下次打开开关就能重新加载。`"
      confirm-text="关闭模型"
      cancel-text="继续用"
      :danger="true"
      @confirm="doUnload"
      @cancel="unloadOpen = false"
    />

    <ConfirmDialog
      v-if="deleteTarget"
      :model-value="true"
      title="删除本地模型"
      :content="`把 ${deleteTarget.name} 从手机里彻底删除，腾出 ${formatModelSize(deleteTarget.size)} 空间。你在「下载」目录里自己放的源文件不会被删，下次还能重新选。`"
      confirm-text="删除释放空间"
      cancel-text="留着"
      :danger="true"
      @confirm="doDeleteStored"
      @cancel="deleteTarget = null"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import AiSetupDialog from '@/components/AiSetupDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { useLabStore } from '@/stores/lab';
import { useProgressStore } from '@/stores/progress';
import words from '@/data/wordsData';
import { useTTS } from '@/composables/useTTS';
import { isValidApiKey, maskApiKey } from '@/utils/ai';
import { onSystemBack, setChatActive } from '@/utils/backNav';
import {
  CHAT_CONTEXT,
  FOLLOWUP_PROMPT,
  MAX_INPUT,
  parseFollowUps,
  readSystemPrompt,
  requestFollowUps,
  saveChat,
  type ChatTurn
} from '@/utils/chat';
import { playTapFeedback } from '@/utils/feedback';
import { renderMarkdown } from '@/utils/markdown';
import { cancelCloudStream, streamChat } from '@/utils/cloudStream';
import { deleteStoredModel, formatModelSize, generate, generateStream as localGenerateStream, listStoredModels, loadModel, pickModel as pickModelFile, modelStatus, unloadModel, type StoredModel } from '@/utils/localModel';

const lab = useLabStore();
const progress = useProgressStore();

/** 两级界面：models=一级（云端/本地两张卡片各自进入对话），chat=二级（只对话） */
const view = ref<'models' | 'chat'>('models');
/** 当前这一轮对话用哪个模型：点哪张卡片的「开始对话」就设为谁。
 *  和 lab.ai.provider（默认接入方案）解耦，两张卡片可以随时切换、互不干扰。 */
const activeProvider = ref<'cloud' | 'local'>(lab.ai.provider === 'local' ? 'local' : 'cloud');

const draft = ref('');
const composerFocused = ref(false); // 点追问时把文字填进输入框后主动聚焦，方便直接改或发送
const waiting = ref(false);
const streaming = ref(false);
const firstToken = ref(false); // 本地流式是否已吐出第一个字：用来收起「正在思考」气泡

/* ── 回答朗读（本地系统 TTS）── */
const { speak, stop: stopTTS } = useTTS();
const speakingIndex = ref<number | null>(null); // 正在朗读哪一条回答，null=没在读

const setupOpen = ref(false);
const setupStart = ref<'plan' | 'key' | 'warn'>('plan');
const clearOpen = ref(false);
const unloadOpen = ref(false);

/* ── 本地模型：加载 / 开关 / 状态 ── */
const loadingModel = ref(false);
const loadError = ref('');

/* ── 已存模型副本管理（释放存储空间） ── */
const stored = ref<StoredModel[]>([]);
const storedLoading = ref(false);
const deleting = ref(false);
const deleteTarget = ref<StoredModel | null>(null);
const storedTotal = computed(() => {
  const bytes = stored.value.reduce((sum, f) => sum + f.size, 0);
  return formatModelSize(bytes);
});

async function refreshStored() {
  storedLoading.value = true;
  stored.value = await listStoredModels();
  storedLoading.value = false;
}

function askDeleteStored(file: StoredModel) {
  deleteTarget.value = file;
}

async function doDeleteStored() {
  const file = deleteTarget.value;
  deleteTarget.value = null;
  if (!file) return;
  deleting.value = true;
  const ok = await deleteStoredModel(file.name);
  deleting.value = false;
  if (!ok) {
    uni.showToast({ title: '删除失败，稍后再试', icon: 'none' });
    return;
  }
  // 删的是当前选中的模型：清掉内存态，让开关引导重新选文件
  if (file.name === lab.localModelName) {
    lab.setLocalModel('', '');
    lab.setLocalLoaded(false);
  }
  await refreshStored();
  uni.showToast({ title: '已删除，空间已释放', icon: 'success' });
}

async function loadFromPath(path: string, name: string, alreadyLoading = false) {
  // v3.9.9 修复：pickFromFile 已提前置 loading（覆盖复制阶段），
  // 若这里再因 loadingModel=true 直接 return，就永远走不到加载 → 卡在「正在加载」。
  // alreadyLoading=true 表示调用方已经管了 loading，跳过这个并发守卫。
  if ((!alreadyLoading && loadingModel.value) || !path) return;
  loadingModel.value = true;
  loadError.value = '';
  lab.setLocalModel(path, name);
  const res = await loadModel(path);
  loadingModel.value = false;
  if (res.ok) {
    lab.setLocalLoaded(true);
    void refreshStored();
    await scrollToEnd();
    uni.showToast({ title: '本地模型已就绪', icon: 'success' });
  } else {
    lab.setLocalLoaded(false);
    loadError.value = res.error || '加载失败，确认选中的是 Q4_K_M 量化的 .gguf 模型，且手机内存够用';
  }
}

/** 从「手机里已存的模型」里点选一个切换过去：直接用它的私有真实路径加载，原生会先卸掉旧的 */
const switchingTo = ref('');
async function switchToStored(file: StoredModel) {
  if (loadingModel.value || switchingTo.value) return;
  if (file.active) return; // 已经在使用，不用切
  void playTapFeedback();
  switchingTo.value = file.name;
  await loadFromPath(file.path, file.name);
  switchingTo.value = '';
}

/** 打开系统文件选择器，让用户自己挑 gguf（唯一入口，不再自动扫描文件夹） */
async function pickFromFile() {
  if (loadingModel.value) return;
  // v3.9.9：选文件后原生会把模型复制进私有目录（几 GB 可能要好几秒），
  // 提前置 loading，选完文件到加载完成的整段时间都显示加载态，避免误以为卡死。
  loadingModel.value = true;
  loadError.value = '';
  let res: { cancelled?: boolean; path?: string; name?: string };
  try {
    res = await pickModelFile();
  } catch (e) {
    loadingModel.value = false;
    loadError.value = (e as Error)?.message || '读取文件失败';
    return;
  }
  if (res.cancelled || !res.path) {
    loadingModel.value = false;
    return;
  }
  const name = res.name || '本地模型';
  // 复制已在原生完成，path 是私有真实路径。传 alreadyLoading=true，
  // 否则 loadFromPath 的并发守卫会看到 loadingModel=true 而直接 return，卡在「正在加载」。
  await loadFromPath(res.path, name, true);
}

/** 顶部电源开关：已开启→弹卸载确认；已关闭→重新加载上次文件或去选文件 */
function toggleEngine() {
  if (loadingModel.value) return;
  void playTapFeedback();
  if (lab.localLoaded) {
    unloadOpen.value = true;
    return;
  }
  if (lab.localModelPath) {
    void loadFromPath(lab.localModelPath, lab.localModelName || '本地模型');
  } else {
    void pickFromFile();
  }
}

async function doUnload() {
  unloadOpen.value = false;
  await unloadModel();
  lab.setLocalLoaded(false);
  uni.showToast({ title: '已关闭本地模型', icon: 'none' });
}

/** 云端是否已配好（联网 + Key 有效）——和 lab.ai.provider 无关，独立判断 */
const cloudConfigured = computed(() => lab.ai.network && isValidApiKey(lab.ai.apiKey).ok);

/** 云端卡片状态：联网 + Key 即可用；连通结论由真实请求喂出来 */
const cloudStatus = computed(() => {
  const ai = lab.ai;
  if (!ai.network) {
    return { ready: false, tone: '', short: '待联网', title: '联网还没打开', hint: '云端要把你问的那句话发到接口，得先联网。点下面的配置按钮填 Key 时会引导你打开。', head: '联网开关关着' };
  }
  if (!isValidApiKey(ai.apiKey).ok) {
    return { ready: false, tone: '', short: '待配置', title: '还差一个 API Key', hint: '填一次就存在本机，之后不用再输。支持 DeepSeek 等 OpenAI 兼容接口。', head: '还没填 API Key' };
  }
  const health = lab.aiHealthState;
  if (health === 'ok') return { ready: true, tone: 'ok', short: '已连通', title: '云端模型已就绪', hint: `${ai.model} · 已连通。点开始对话，问词问句都行。`, head: `${ai.model} · 已连通` };
  if (health === 'failed') return { ready: true, tone: 'alert', short: '上次没连上', title: '云端模型已就绪', hint: `${ai.model} · 上次没连上，可以直接重试。`, head: `${ai.model} · 上次没连上` };
  return { ready: true, tone: '', short: '未验证连通', title: '云端模型已就绪', hint: `${ai.model} · 未验证连通。点开始对话试一句。`, head: `${ai.model} · 未验证连通` };
});

/** 本地卡片状态：只看引擎有没有加载起来 */
const localStatus = computed(() => {
  if (lab.localLoaded) {
    return { ready: true, tone: 'ok', short: '已加载', title: '本地模型已就绪', hint: `${lab.localModelName || '已加载'} · 离线可用。点开始对话，不用联网。`, head: `${lab.localModelName || '本地模型'} · 离线可用` };
  }
  if (lab.localModelPath) {
    return { ready: false, tone: '', short: '待加载', title: '模型还没加载', hint: '点下面的按钮重新加载你上次选的模型。', head: '本地模型未加载' };
  }
  return { ready: false, tone: '', short: '未导入', title: '还没选模型文件', hint: '点下面的按钮，在文件管理里选 .gguf 模型。模型只在你手机里跑，不联网、不上传。', head: '本地模型未导入' };
});

/** 当前这一轮对话所用模型的状态：输入条显隐、自动退回守卫都看它 */
const status = computed(() => (activeProvider.value === 'local' ? localStatus.value : cloudStatus.value));

/** 顶部副标题：对话页显示当前模型的一句话状态，模型页给两卡总览 */
const headStatus = computed(() => {
  if (view.value === 'chat') {
    const s = activeProvider.value === 'local' ? localStatus.value : cloudStatus.value;
    return { tone: s.tone, text: s.head };
  }
  const c = cloudStatus.value.ready ? '云端可用' : '云端待配置';
  const l = localStatus.value.ready ? '本地已加载' : '本地未加载';
  return { tone: '', text: `${c} · ${l}` };
});

// 对话页期间若当前模型被关掉/Key 被清（比如在设置里改了），自动退回模型页，
// 免得停在一个没法输入的空对话页。
watch(
  () => status.value.ready,
  (ready) => {
    if (!ready && view.value === 'chat') view.value = 'models';
  }
);

/** 本地推理：把系统人设 + 最近历史 + 当前问题拼成一个 prompt，交给模型一次生成 */
function buildLocalPrompt(chat: ChatTurn[]): string {
  const lines = [lab.systemPrompt || readSystemPrompt(), ''];
  for (const turn of chat.slice(-CHAT_CONTEXT)) {
    lines.push(`${turn.role === 'user' ? '用户' : '助教'}：${turn.content}`);
  }
  lines.push('助教：');
  return lines.join('\n');
}

/**
 * 云端真·流式：原生 SSE 插件逐块吐字，界面边收边显示（和本地模型一致的观感）。
 * 首字到达才落下回答气泡、收起「正在思考」；失败把错误留在气泡上可重发。
 * 若接口不支持 stream，原生层会 reject，这里降级提示用户换支持流式的服务。
 */
async function streamCloudReply(): Promise<boolean> {
  let index = -1;
  let gotAny = false;
  streaming.value = true;
  const res = await streamChat(lab.ai, lab.chat, lab.systemPrompt || readSystemPrompt(), (piece, full) => {
    if (!gotAny) {
      gotAny = true;
      firstToken.value = true;
      lab.appendChat({ role: 'assistant', content: full, at: Date.now() });
      index = lab.chat.length - 1;
    } else if (index >= 0) {
      lab.chat[index].content = full;
    }
    void scrollToEnd();
  });
  streaming.value = false;

  if (!res.ok || (!gotAny && !res.text)) {
    const message = res.error || '没拿到回答，换个问法再试。';
    if (index < 0) {
      firstToken.value = true;
      lab.appendChat({ role: 'assistant', content: message, at: Date.now(), failed: true });
    } else {
      lab.chat[index].content = message;
      lab.chat[index].failed = true;
    }
    saveChat(lab.chat);
    await scrollToEnd();
    return false;
  }
  // 兜底：增量事件没收到（老接口），至少把最终全文填进去
  if (!gotAny) {
    firstToken.value = true;
    lab.appendChat({ role: 'assistant', content: res.text || '（无内容）', at: Date.now() });
  } else if (res.text && index >= 0) {
    lab.chat[index].content = res.text;
  }
  // 真的收到回答才算连通
  lab.markAiOk();
  saveChat(lab.chat);
  await scrollToEnd();
  return true;
}

/**
 * 本地流式请求：先落一条空气泡，模型每吐一块就填进气泡，边生成边显示。
 * 返回是否成功；失败时把错误留在那条气泡上（标红、可重发）。
 */
async function streamLocalReply(): Promise<boolean> {
  if (!lab.localLoaded) {
    firstToken.value = true;
    lab.appendChat({ role: 'assistant', content: '本地模型还没加载，先点下方按钮加载。', at: Date.now(), failed: true });
    await scrollToEnd();
    return false;
  }
  // 先把提示词按「还没插入回答气泡」的聊天记录算好，避免把空气泡算进上下文
  const prompt = buildLocalPrompt(lab.chat);
  let index = -1;
  streaming.value = true;

  let gotAny = false;
  const res = await runLocalExclusive(() => localGenerateStream(prompt, (_piece, full) => {
    if (!gotAny) {
      // 第一个字到达：收起「正在思考」，此刻才落下真正的回答气泡
      gotAny = true;
      firstToken.value = true;
      lab.appendChat({ role: 'assistant', content: full, at: Date.now() });
      index = lab.chat.length - 1;
    } else {
      lab.chat[index].content = full;
    }
    // 每块进来都轻轻滚一下，让新字始终露出来；streaming 时 scrollToEnd 不拦截
    void scrollToEnd();
  }));
  streaming.value = false;

  if (!res.ok || (!gotAny && !res.text)) {
    // 首字都没等到：没有回答气泡，就补一条错误气泡
    if (index < 0) {
      lab.appendChat({ role: 'assistant', content: res.error || '模型没返回内容，换个问法再试。', at: Date.now(), failed: true });
    } else {
      lab.chat[index].content = res.error || '模型没返回内容，换个问法再试。';
      lab.chat[index].failed = true;
    }
    firstToken.value = true;
    saveChat(lab.chat);
    await scrollToEnd();
    return false;
  }
  // 兜底：万一增量事件没收到（老引擎/异常），至少把最终全文填进去
  if (!gotAny) {
    firstToken.value = true;
    lab.appendChat({ role: 'assistant', content: res.text || '（无内容）', at: Date.now() });
  } else if (res.text) {
    lab.chat[index].content = res.text;
  }
  saveChat(lab.chat);
  await scrollToEnd();
  return true;
}

const canSend = computed(() => !waiting.value && draft.value.trim().length > 0);
const composerHint = computed(() =>
  waiting.value ? '正在等回答…' : `Enter 发送 · 最多 ${MAX_INPUT} 字 · 只发你写的这句`
);

/** 空状态的四条示例：最后一条会跟着错题本变 */
const suggestions = computed(() => {
  const list = [
    '帮我区分 affect 和 effect，各给一个例句',
    '用 abandon 写一个考研阅读风格的句子',
    'principle 老是记不住，给个记得住的办法'
  ];
  const wrong = progress.mistakes
    .slice(-3)
    .map((item) => words.find((word) => word.id === item.wordId)?.word ?? '')
    .filter(Boolean);
  if (wrong.length) list.push(`讲讲我错过的这几个词：${wrong.join('、')}`);
  return list;
});

/** 点某张卡片的「开始对话」：记住用哪个模型，再进对话页接着上次聊 */
async function startChat(which: 'cloud' | 'local') {
  void playTapFeedback();
  const ok = which === 'local' ? localStatus.value.ready : cloudStatus.value.ready;
  if (!ok) return;
  activeProvider.value = which;
  view.value = 'chat';
  await scrollToEnd();
}

/** 二级 → 一级：返回模型页 */
function backToModels() {
  if (view.value !== 'chat') return;
  stopSpeaking();
  void cancelCloudStream();
  void playTapFeedback();
  view.value = 'models';
}

/* ── 回答朗读：点喇叭用本地系统 TTS 读，再点一次停 ── */
/** 去掉回答里的 Markdown 标记，免得把星号、井号也读出来 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[a-zA-Z]*\n?/g, '')       // 代码块围栏
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接保留文字
    .replace(/[*_~`#>`]/g, '')              // 强调/标题/引用符号
    .replace(/^\s*[-+]\s+/gm, '')           // 列表符号
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function toggleSpeak(index: number) {
  void playTapFeedback();
  // 正在读这一条 → 停
  if (speakingIndex.value === index) {
    stopSpeaking();
    return;
  }
  const turn = lab.chat[index];
  if (!turn || turn.role !== 'assistant' || turn.failed) return;
  const text = stripMarkdown(turn.content);
  if (!text) return;
  speakingIndex.value = index;
  try {
    await speak(text);
  } catch {
    // 失败时 useTTS 已弹提示，这里把按钮状态复位
    speakingIndex.value = null;
  }
}

function stopSpeaking() {
  if (speakingIndex.value === null) return;
  stopTTS();
  speakingIndex.value = null;
}

// 把「是否停在二级对话页」同步给原生：只有这时系统返回键才该退回一级、而不是退出 App。
// 原生据此在 onBackPressed 里决定是否拦截；切到别的面板/卸载时也要清成 false。
watch(() => view.value, (v) => setChatActive(v === 'chat'), { immediate: true });

/** 面板右上角齿轮：与主页齿轮一致，直接进入总设置 */
function openSettings() {
  void playTapFeedback();
  uni.navigateTo({ url: '/pages/settings/settings' });
}

/** 首次还没选方案时，从引导卡弹出方案列表 */
function openSetup() {
  void playTapFeedback();
  setupStart.value = 'plan';
  setupOpen.value = true;
}

function openKey() {
  setupStart.value = 'key';
  setupOpen.value = true;
}

/** 看部署教程：第一次先弹性能警告（带「以后不再显示」），勾选过就直接进教程 */
function openGuide() {
  void playTapFeedback();
  if (lab.localWarnHidden) {
    uni.navigateTo({ url: '/pages/ai-guide/ai-guide' });
    return;
  }
  setupStart.value = 'warn';
  setupOpen.value = true;
}

function turnOnNetwork() {
  lab.setNetwork(true);
  void playTapFeedback();
}

function onLocal(dontShow: boolean) {
  if (dontShow) lab.hideLocalWarn();
  uni.navigateTo({ url: '/pages/ai-guide/ai-guide' });
}

function onSaved() {
  uni.showToast({ title: `已保存 ${maskApiKey(lab.ai.apiKey)}`, icon: 'none' });
}

async function submit() {
  const text = draft.value.trim();
  if (!text || waiting.value) return;
  draft.value = '';
  await ask(text);
}

async function ask(text: string) {
  if (waiting.value) return;
  stopSpeaking(); // 开新一轮问答先停掉上一条的朗读
  firstToken.value = false;
  lab.appendChat({ role: 'user', content: text, at: Date.now() });
  await scrollToEnd();
  waiting.value = true;

  // 本地：真·流式，边生成边往外吐字；云端：原生 SSE 流式（不支持时明确降级）
  // 看的是「这一轮对话用哪个模型」，不是默认方案 —— 两张卡片可随时切换
  if (activeProvider.value === 'local') {
    const ok = await streamLocalReply();
    waiting.value = false;
    if (ok) void generateFollowUpsFor(lab.chat.length - 1);
    return;
  }

  const ok = await streamCloudReply();
  waiting.value = false;
  if (!ok) {
    lab.markAiFail('');
    return;
  }
  void generateFollowUpsFor(lab.chat.length - 1);
}

/* ── 本地推理串行锁 ──
 * 原生层所有 generate 共用一个单线程 worker，localToken 事件是全局广播的。
 * 同一时刻只能有一个生成任务在跑，否则追问和主回答的增量会串台。 */
let localGenChain: Promise<unknown> = Promise.resolve();
function runLocalExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = localGenChain.then(task, task);
  localGenChain = result.catch(() => undefined);
  return result;
}

/* ── 追问建议：每轮回答落盘后，后台让当前模型猜两条用户可能接着问的话 ──
 * 不阻塞对话：answer 完成后才发起，失败就静默不显示。
 * followUpSeq 防止用户连续提问时，旧一轮的追问结果覆盖到新一轮气泡上。 */
let followUpSeq = 0;

async function generateFollowUpsFor(index: number) {
  // 用户在设置页关掉追问建议后，不再额外请求模型
  if (!lab.followUpsEnabled) return;
  const turn = lab.chat[index];
  if (!turn || turn.role !== 'assistant' || turn.failed) return;
  const seq = ++followUpSeq;
  // 只带到这条回答为止的历史，别把后面新消息也算进去
  const context = lab.chat.slice(0, index + 1);

  let list: string[] = [];
  // 最近的用户提问与回答原文，用来剔除模型照抄式复述
  const exclude = context.filter((t) => t.role === 'user' || t.role === 'assistant').map((t) => t.content);
  try {
    if (activeProvider.value === 'local') {
      if (!lab.localLoaded) return;
      // 本地：拼一个独立的追问 prompt，一次性生成（本地流式监听只服务于主回答气泡）。
      // 本地模型是纯文本补全、不区分 system/user，所以指令放最前、历史居中、命令收尾。
      const lines = [`${FOLLOWUP_PROMPT}`, '', '对话记录：'];
      for (const t of context.slice(-CHAT_CONTEXT)) {
        lines.push(`${t.role === 'user' ? '用户' : '助教'}：${t.role === 'assistant' ? t.content.slice(0, 400) : t.content}`);
      }
      lines.push('', '用户接下来可能追问的两个新问题（只输出两行问题）：');
      const res = await runLocalExclusive(() => generate(lines.join('\n')));
      if (res.ok) list = parseFollowUps(res.text, exclude);
    } else {
      list = await requestFollowUps(lab.ai, context);
    }
  } catch {
    // 追问只是锦上添花，失败就当没生成，不影响主对话
    return;
  }

  // 序号变了说明用户又发了新问题，丢弃这次过期结果
  if (seq !== followUpSeq) return;
  // 追问只服务最新一条回答：生成期间用户已经发了下一句，就别再写回去了
  if (index !== lab.chat.length - 1) return;
  const target = lab.chat[index];
  if (!target || target.role !== 'assistant' || target.failed || target.at !== turn.at) return;
  if (!list.length) return;
  target.followUps = list;
  saveChat(lab.chat);
  void scrollToEnd();
}

/** 让输入框拿到焦点（uni-app 的 focus 是受控属性，先降后升才能重复触发） */
async function focusComposer() {
  composerFocused.value = false;
  await nextTick();
  composerFocused.value = true;
}

/** 点追问：把文字填进输入框并聚焦，用户自己决定发不发 */
function useFollowUp(text: string) {
  if (waiting.value) return;
  void playTapFeedback();
  stopSpeaking();
  draft.value = text;
  void focusComposer();
}

/** 失败的那条退回去，重发上一条用户消息 */
async function retry() {
  const last = lab.chat[lab.chat.length - 1];
  if (!last?.failed) return;
  const question = [...lab.chat].reverse().find((turn) => turn.role === 'user');
  if (!question) return;
  lab.chat = lab.chat.slice(0, -1);
  firstToken.value = false;
  waiting.value = true;

  // 本地重发同样走真·流式
  if (activeProvider.value === 'local') {
    const ok = await streamLocalReply();
    waiting.value = false;
    if (ok) void generateFollowUpsFor(lab.chat.length - 1);
    return;
  }

  const ok = await streamCloudReply();
  waiting.value = false;
  if (!ok) {
    lab.markAiFail('');
    return;
  }
  void generateFollowUpsFor(lab.chat.length - 1);
}

function askClear() {
  clearOpen.value = true;
}

function doClear() {
  clearOpen.value = false;
  stopSpeaking();
  void cancelCloudStream();
  lab.resetChat();
  void playTapFeedback();
}

/** 聊天滚动宿主：只有 keyboard-chat（AI 聊天锁窗）时是 .page-content 内部容器，
 *  平时是 window。设置页弹窗虽然也会弹键盘，但不锁窗，仍走 window。 */
function chatScrollHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const chat = document.documentElement.classList.contains('keyboard-chat');
  return chat ? document.querySelector<HTMLElement>('.ai-page .page-content') : null;
}

function scrollChatToBottom(smooth: boolean) {
  const host = chatScrollHost();
  if (host) {
    host.scrollTo({ top: host.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  } else {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }
}

async function scrollToEnd() {
  await nextTick();
  if (typeof window === 'undefined' || streaming.value) return;
  scrollChatToBottom(true);
}

/* ── 长按气泡复制 ──
   WebView 自己弹不弹选择菜单由系统决定，网页这边只能把「可选中」打开（见
   .bubble-text 的 user-select）。万一某些机型仍然不给选，长按 900ms 且
   一个字符都没选中时，退一步把整条复制下来 —— 两条路都走通，用户总能拿到文字。 */
let pressTimer = 0;
let pressX = 0;
let pressY = 0;

function bubbleOf(target: EventTarget | null): HTMLElement | null {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== 'function') return null;
  return element.closest<HTMLElement>('.bubble-text');
}

function onBubblePressStart(event: TouchEvent) {
  const bubble = bubbleOf(event.target);
  const touch = event.touches?.[0];
  if (!bubble || !touch) return;
  pressX = touch.clientX;
  pressY = touch.clientY;
  window.clearTimeout(pressTimer);
  pressTimer = window.setTimeout(() => {
    pressTimer = 0;
    // 系统已经选中了文字：菜单是它的，别插手
    const selected = window.getSelection?.()?.toString().trim() ?? '';
    if (selected) return;
    const text = bubble.textContent?.trim() ?? '';
    if (text) void copyBubble(text);
  }, 900);
}

/** 手指一动就当成滚动/选择，撤销兜底，免得滚页面时误弹「已复制」 */
function onBubblePressMove(event: TouchEvent) {
  if (!pressTimer) return;
  const touch = event.touches?.[0];
  if (!touch) return;
  if (Math.abs(touch.clientX - pressX) > 8 || Math.abs(touch.clientY - pressY) > 8) {
    window.clearTimeout(pressTimer);
    pressTimer = 0;
  }
}

function onBubblePressEnd() {
  if (!pressTimer) return;
  window.clearTimeout(pressTimer);
  pressTimer = 0;
}

async function copyBubble(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      uni.showToast({ title: '已复制这条回答', icon: 'none', duration: 1200 });
      return;
    }
  } catch {
    // 浏览器不给写剪贴板时退回 uni 的实现
  }
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制这条回答', icon: 'none', duration: 1200 })
  });
}

/** 键盘弹出前用户看到的窗口滚动位置。v3.5.4 起不再一弹键盘就跳到最底部：
 *  点输入框之前在看哪一段，弹出后就把内部容器滚到同一段；收起后把窗口滚回去。 */
let restoreScrollY = 0;
function onKeyboardChange(event: Event) {
  const detail = (event as CustomEvent<{ open?: boolean; chat?: boolean; scrollBefore?: number }>).detail ?? {};
  if (detail.open) {
    // 只在聊天锁窗切换时接管滚动；设置页弹窗不碰 window，免得把首页滚走
    if (!detail.chat) return;
    restoreScrollY = Math.max(0, Math.round(Number(detail.scrollBefore) || 0));
    requestAnimationFrame(() => {
      const host = chatScrollHost();
      // 不再 host.scrollTop = host.scrollHeight；原样还原弹出前的位置。
      if (host) host.scrollTop = restoreScrollY;
    });
    return;
  }
  // 收起：浏览器会把 window.scrollY 清成 0，还回弹出前那一段
  if (restoreScrollY > 0) {
    const y = restoreScrollY;
    restoreScrollY = 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }
}

/* 顶栏静止时完全开放；一滚动才给标题垫一块圆角小玻璃，挡住滚上来的内容。
   用 rAF 合并，滚动时每帧最多判断一次，不碰布局。 */
const scrolled = ref(false);
let scrollTick = 0;
function readScroll() {
  scrollTick = 0;
  scrolled.value = window.scrollY > 6 || document.documentElement.scrollTop > 6;
}
function onScroll() {
  if (scrollTick) return;
  scrollTick = window.requestAnimationFrame(readScroll);
}

// 用户在 AI 面板内按了安卓系统返回键：若在二级对话页就退回一级，不在则不管（交回原生按默认处理）。
let removeSystemBack: (() => void) | null = null;

onMounted(() => {
  window.addEventListener('keyboardchange', onKeyboardChange);
  window.addEventListener('scroll', onScroll, { passive: true });
  readScroll();
  removeSystemBack = onSystemBack(() => backToModels());
  // 本地卡片常驻：问引擎真实状态（面板切走再切回时，引擎可能还活着但 UI 状态丢了）
  // 并总是刷新已存模型副本列表，供下方卡片管理。
  void modelStatus().then((s) => {
    lab.setLocalLoaded(s.loaded === true);
  });
  void refreshStored();
});
onUnmounted(() => {
  window.removeEventListener('keyboardchange', onKeyboardChange);
  window.removeEventListener('scroll', onScroll);
  if (removeSystemBack) removeSystemBack();
  removeSystemBack = null;
  setChatActive(false); // 离开面板务必清标记，否则系统返回键会被错误拦截
  stopTTS(); // 离开面板停掉朗读，别让声音留在后台
  void cancelCloudStream(); // 离开面板掐掉可能在跑的云端流
  if (scrollTick) window.cancelAnimationFrame(scrollTick);
  scrollTick = 0;
});
</script>

<style scoped>
.ai-page { padding-bottom: 320rpx; }

/* ── 固定顶栏 ──
   放在 .page-content 外面：橡皮筋给 .page-content 挂 transform 时它不跟着走，
   position:fixed 也不会被降级成相对「会滚的祖先」定位。 */
.ai-head {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 45;
  padding: calc(max(var(--inset-top, 0px), env(safe-area-inset-top, 0px)) + 18rpx) 28rpx 26rpx;
  /* 整条只有按钮可点，空白处让手指穿透去滚聊天 */
  pointer-events: none;
}
/* 顶栏是开放式的（v3.6.3）：静止时从头到脚没有任何背板。
   v3.5.7~v3.6.2 那条"雾"之所以怎么调都有一条大直角，是因为
   backdrop-filter 的模糊区域永远是一个矩形，而 mask 在安卓 WebView 上
   不裁剪模糊结果 —— 用户看到的"边"其实是「清晰 → 模糊」的交界线，
   把白色从 0.94 降到 0.62 只是让板子变淡，线还在。
   现在完全不模糊：只在滚动之后，才在顶部淡入一条纯色渐变（两端同色不同
   透明度，画到底边时已经是全透明，结构上不存在"边"），用来压一压滚上去
   的内容。静止时它 opacity: 0，用户第一眼看过去就是纯壁纸。 */
.ai-head::before {
  content: '';
  position: absolute;
  /* 铺到顶栏底边之外 45px：前 60% 基本是实的（把字下面的内容压住），
     后 40% 一路化到全透明 —— 有遮挡但不存在"边" */
  inset: 0 0 -45px 0;
  z-index: 0;
  background: var(--head-veil);
  pointer-events: none;
  opacity: 0;
  transition: opacity 220ms ease;
}
.ai-head.is-solid::before { opacity: 1; }
.ai-head .top-title,
.ai-head .top-subtitle {
  /* 字直接压在壁纸上；一层极轻的光晕让它和照片分得开 */
  text-shadow: 0 1rpx 2rpx var(--head-glow), 0 0 18rpx var(--head-glow);
}
.ai-head .top-bar {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 820px;
  margin: 0 auto !important;
  align-items: flex-end;
  pointer-events: none;
}
.ai-head .top-actions { pointer-events: auto; }
/* 二级对话页聊天式顶栏：标题组（AI 对话 + 模型状态）绝对居中，
   返回键贴左、清空/设置贴右，像微信那样中间是标题、两侧是操作 ——
   标题不占 flex 空间，就不会被 margin-left:auto 的按钮组挤到返回键旁边。 */
.top-heading { min-width: 0; }
.ai-head.is-chat .top-heading {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
  /* 两侧按钮留位，超长模型名省略而不是压到按钮上 */
  max-width: calc(100% - 400rpx);
}
.ai-head.is-chat .top-title,
.ai-head.is-chat .top-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
}
.ai-head .back-button {
  margin-bottom: 2rpx;
  align-self: flex-end;
  /* 顶栏整条为了滚动穿透设成 none，返回键必须单独开回来，否则点了没反应（摆设） */
  pointer-events: auto;
}
/* 内容从顶栏下面开始，第一条不会被压住 */
.ai-page .page-content { padding-top: 176rpx; }

/* ── 一级模型页：云端 / 本地 两张平级卡片（v3.9.12） ── */
.model-home { display: flex; flex-direction: column; gap: 22rpx; }
.provider-card { padding: 30rpx; }
.provider-head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.provider-badge {
  display: inline-flex; align-items: center; gap: 8rpx;
  padding: 6rpx 16rpx; border-radius: 999rpx;
  font-size: 19rpx; font-weight: 750; letter-spacing: 1rpx;
}
.provider-badge.is-local { background: rgba(var(--accent-rgb), .14); color: var(--accent-ink); }
.provider-badge.is-cloud { background: rgba(56, 178, 172, .16); color: #2f9c96; }
.provider-status { flex: none; font-size: 19rpx; font-weight: 700; color: var(--text-secondary); }
.provider-status.is-ok { color: #3aa675; }
.provider-status.is-alert { color: #d9556d; }
.provider-title { margin-top: 16rpx; color: var(--text); font-size: 34rpx; font-weight: 780; line-height: 1.35; }
.provider-copy { margin-top: 10rpx; color: var(--text-secondary); font-size: 22rpx; line-height: 1.65; }
.provider-config {
  display: flex; align-items: center; justify-content: center; gap: 10rpx;
  width: 100%; margin-top: 20rpx; padding: 16rpx 0;
  border-radius: 14rpx; border: 1rpx solid var(--line);
  background: var(--surface-soft); color: var(--accent-ink);
  font-size: 22rpx; font-weight: 700; line-height: 1.4;
}
.provider-config::after { border: 0; }
.provider-config:active { opacity: .75; }
/* 原生 button 在 disabled 时会被套一层灰白底/灰字，显式覆盖回主题色，只降透明度 */
.provider-config[disabled] { opacity: .65; background: var(--surface-soft) !important; color: var(--accent-ink) !important; border-color: var(--line) !important; -webkit-text-fill-color: var(--accent-ink) !important; }
.provider-config.is-quiet { margin-top: 10rpx; color: var(--text-secondary); font-weight: 600; }
.provider-card .enter-chat-btn { margin-top: 20rpx; }
.provider-card .enter-chat-btn[disabled] { opacity: .5; }
.provider-switch-row { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx; padding: 16rpx 18rpx; border-radius: 16rpx; background: var(--surface-soft); }
.switch-label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
.switch-name { color: var(--text); font-size: 23rpx; font-weight: 700; }
.switch-state { color: var(--text-secondary); font-size: 19rpx; }
.switch-state.is-on { color: #3aa675; }

/* ── 一级模型页：就绪入口卡（保留兼容，当前版本未用） ── */
.ready-card { padding: 32rpx 30rpx; }
.ready-badge {
  display: inline-flex; align-items: center; gap: 8rpx;
  padding: 6rpx 16rpx; border-radius: 999rpx;
  font-size: 19rpx; font-weight: 750; letter-spacing: 1rpx;
}
.ready-badge.is-local { background: rgba(var(--accent-rgb), .14); color: var(--accent-ink); }
.ready-badge.is-cloud { background: rgba(56, 178, 172, .16); color: #2f9c96; }
.ready-title { margin-top: 18rpx; color: var(--text); font-size: 36rpx; font-weight: 780; line-height: 1.35; }
.ready-copy { margin-top: 12rpx; color: var(--text-secondary); font-size: 23rpx; line-height: 1.65; }
.enter-chat-btn {
  display: flex; align-items: center; justify-content: center; gap: 10rpx;
  width: 100%; margin-top: 28rpx;
}
.ready-resume,
.ready-switch {
  display: block; width: 100%; margin: 16rpx 0 0; padding: 14rpx 0;
  border: 0; background: transparent; color: var(--text-secondary);
  font-size: 21rpx; line-height: 1.5; text-align: center;
}
.ready-resume::after,
.ready-switch::after { border: 0; }
.ready-resume { color: var(--accent-ink); font-weight: 650; }
.ready-resume:active,
.ready-switch:active { opacity: .7; }

.ai-page .top-bar .icon-button {
  width: 66rpx;
  height: 66rpx;
  margin: 0;
  border-radius: 50%;
  border-color: transparent;
  background: var(--surface-soft);
  box-shadow: none;
  color: var(--text-secondary);
}
.ai-page .top-bar .icon-button::before { display: none; }
.top-actions { display: flex; align-items: center; gap: 10rpx; margin-left: auto; }

/* ── 引导卡：三种「还不能聊」的状态共用一套排版 ── */
.intro { padding: 30rpx; }
.intro-badge {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(var(--accent-rgb), .14);
  color: var(--accent-ink);
  font-size: 19rpx;
  font-weight: 750;
  letter-spacing: 1rpx;
}
.intro-badge.is-local { background: rgba(var(--accent-rgb), .14); color: var(--accent-ink); }
.intro-badge.is-cloud { background: rgba(56, 178, 172, .16); color: #2f9c96; }
.intro-title { margin-top: 16rpx; color: var(--text); font-size: 32rpx; font-weight: 760; line-height: 1.4; }
.intro-copy { margin-top: 12rpx; color: var(--text-secondary); font-size: 23rpx; line-height: 1.68; }
.intro-cta { margin-top: 24rpx; }

.option-list { display: flex; flex-direction: column; gap: 12rpx; margin-top: 22rpx; }
.option { display: flex; align-items: center; gap: 14rpx; padding: 16rpx 18rpx; border-radius: 20rpx; background: var(--surface-soft); }
.option-icon { flex: none; width: 56rpx; height: 56rpx; display: flex; align-items: center; justify-content: center; border-radius: 16rpx; background: var(--surface-strong); }
.option-icon.is-local { color: var(--accent-ink); }
.option-icon.is-cloud { color: #2f9c96; }
.option-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3rpx; }
.option-name { color: var(--text); font-size: 23rpx; font-weight: 700; }
.option-desc { color: var(--text-secondary); font-size: 20rpx; line-height: 1.5; }

.action-row { display: flex; gap: 12rpx; margin-top: 24rpx; }
.action-row .primary-button, .action-row .secondary-button { flex: 1; min-height: 84rpx; font-size: 24rpx; }

/* ── 本地模型选择 ── */
.inline-em { color: var(--text); font-weight: 700; }
.pick-file-models { display: flex; align-items: center; justify-content: center; gap: 10rpx; width: 100%; margin-top: 22rpx; padding: 20rpx 0; border-radius: 16rpx; background: linear-gradient(135deg, var(--accent), var(--accent-2)); border: 0; color: var(--accent-contrast); font-size: 24rpx; font-weight: 700; line-height: 1.4; box-shadow: 6rpx 10rpx 22rpx var(--glow); }
.pick-file-models::after { border: 0; }
.pick-file-models:active { transform: scale(.985); }
.pick-file-models[disabled] { opacity: .6; }
.load-error { margin-top: 14rpx; padding: 14rpx 16rpx; border-radius: 12rpx; background: rgba(217, 85, 109, .12); color: #d9556d; font-size: 20rpx; line-height: 1.6; }

/* ── 已存模型副本管理 ── */
.stored-section { margin-top: 26rpx; padding-top: 22rpx; border-top: 1rpx solid var(--line); }
.stored-head { display: flex; align-items: center; gap: 12rpx; }
.stored-title { color: var(--text); font-size: 22rpx; font-weight: 700; }
.stored-total { color: var(--text-secondary); font-size: 19rpx; }
.stored-refresh { margin: 0 0 0 auto; padding: 6rpx 18rpx; border-radius: 999rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--accent-ink); font-size: 19rpx; font-weight: 700; line-height: 1.5; }
.stored-refresh::after { border: 0; }
.stored-refresh[disabled] { opacity: .5; }
.stored-item { display: flex; align-items: center; gap: 12rpx; margin-top: 14rpx; padding: 14rpx 16rpx; border-radius: 14rpx; background: var(--surface-soft); border: 1rpx solid transparent; }
.stored-item.is-active { border-color: rgba(var(--accent-rgb), .5); }
.stored-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
.stored-name { color: var(--text); font-size: 20rpx; font-weight: 650; word-break: break-all; }
.stored-sub { color: var(--text-secondary); font-size: 18rpx; }
.stored-active-tag { color: var(--accent-ink); font-weight: 700; }
.stored-use { flex: none; display: flex; align-items: center; justify-content: center; height: 60rpx; margin: 0; padding: 0 18rpx; border-radius: 14rpx; border: 1rpx solid rgba(var(--accent-rgb), .55); background: rgba(var(--accent-rgb), .14); color: var(--accent-ink); font-size: 19rpx; font-weight: 650; line-height: 1; }
.stored-use::after { border: 0; }
/* disabled 保持主题色，只降透明度，避免原生灰白 */
.stored-use[disabled] { opacity: .55; background: rgba(var(--accent-rgb), .14) !important; color: var(--accent-ink) !important; border-color: rgba(var(--accent-rgb), .55) !important; -webkit-text-fill-color: var(--accent-ink) !important; }
.stored-del { flex: none; display: flex; align-items: center; justify-content: center; width: 60rpx; height: 60rpx; margin: 0; border-radius: 14rpx; border: 0; background: rgba(217, 85, 109, .12); color: #d9556d; }
.stored-del::after { border: 0; }
.stored-del[disabled] { opacity: .5; }
.stored-hint { margin-top: 14rpx; color: var(--text-secondary); font-size: 18rpx; line-height: 1.6; }
.stored-empty { margin-top: 16rpx; color: var(--text-secondary); font-size: 19rpx; text-align: center; padding: 16rpx 0; }

/* ── 云端配置入口：独立的平级卡片 ── */
.cloud-card { margin-top: 18rpx; padding: 8rpx 12rpx; }
.alt-provider { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 12rpx; }
.alt-provider:active { opacity: .8; }
.alt-icon { flex: none; width: 60rpx; height: 60rpx; display: flex; align-items: center; justify-content: center; border-radius: 18rpx; background: var(--surface-strong); color: #2f9c96; }
.alt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
.alt-head { display: flex; align-items: center; gap: 12rpx; }
.alt-title { color: var(--text); font-size: 25rpx; font-weight: 750; }
.alt-tag { padding: 2rpx 12rpx; border-radius: 999rpx; background: rgba(56, 178, 172, .16); color: #2f9c96; font-size: 17rpx; font-weight: 700; }
.alt-desc { color: var(--text-secondary); font-size: 19rpx; line-height: 1.5; }
.alt-arrow { flex: none; color: var(--text-secondary); font-size: 40rpx; line-height: 1; }

/* ── 顶部本地模型电源开关 ── */
.engine-switch { display: flex; align-items: center; gap: 16rpx; margin-bottom: 18rpx; padding: 20rpx 22rpx; }
.engine-icon { flex: none; width: 60rpx; height: 60rpx; display: flex; align-items: center; justify-content: center; border-radius: 18rpx; background: rgba(var(--accent-rgb), .16); color: var(--accent-ink); }
.engine-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5rpx; }
.engine-name { color: var(--text); font-size: 25rpx; font-weight: 750; }
.engine-state { color: var(--text-secondary); font-size: 19rpx; }
.engine-state.is-on { color: #3aa675; }
.engine-toggle { flex: none; width: 96rpx; height: 56rpx; margin: 0; padding: 4rpx; box-sizing: border-box; border: 0; border-radius: 999rpx; background: var(--surface-strong); box-shadow: inset 0 0 0 1rpx var(--line); display: flex; align-items: center; transition: background 200ms ease; }
.engine-toggle::after { border: 0; }
.engine-toggle.is-on { background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
.engine-toggle.is-busy { opacity: .6; }
.engine-knob { width: 48rpx; height: 48rpx; border-radius: 50%; background: #fff; box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, .28); transition: transform 200ms cubic-bezier(.22, 1, .32, 1); }
.engine-toggle.is-on .engine-knob { transform: translateX(40rpx); }

/* ── 快捷提问 ── */
.suggest { display: flex; flex-direction: column; gap: 12rpx; margin-top: 8rpx; }
.suggest-title { padding-left: 6rpx; color: var(--text-secondary); font-size: 20rpx; font-weight: 700; letter-spacing: 2rpx; }
.suggest-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  width: 100%;
  margin: 0;
  padding: 20rpx 22rpx;
  border-radius: 20rpx;
  border: 1rpx solid var(--line);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  line-height: 1.5;
}
.suggest-item::after { border: 0; }
.suggest-item:active { transform: scale(.988); border-color: var(--accent-ink); }
.suggest-text { flex: 1; font-size: 23rpx; }
.suggest-item .app-icon { color: var(--accent-ink); opacity: .7; }

/* ── 对话 ── */
.thread { display: flex; flex-direction: column; gap: 18rpx; margin-top: 10rpx; }
.turn { display: flex; gap: 12rpx; align-items: flex-start; }
.turn.user { flex-direction: row-reverse; }
/* 助教消息允许换行，好把「朗读」小按钮放到气泡下面（对齐气泡左边缘：48rpx 头像 + 12rpx 间距） */
.turn.assistant { flex-wrap: wrap; }
.speak-btn {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin: 2rpx 0 0 60rpx;
  padding: 8rpx 16rpx;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
  background: var(--surface-soft);
  color: var(--text-secondary);
  font-size: 19rpx;
  font-weight: 650;
  line-height: 1.3;
}
.speak-btn::after { border: 0; }
.speak-btn:active { opacity: .7; }
.speak-btn.is-speaking { color: #d9556d; border-color: rgba(217, 85, 109, .4); }

/* 模型生成的「你可能还想问」：跟喇叭一样对齐气泡左边缘，占满整行 */
.followups {
  width: calc(100% - 60rpx);
  margin: 10rpx 0 6rpx 60rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  animation: fade-up-in 240ms ease-out both;
}
.followups-title {
  padding-left: 4rpx;
  color: var(--text-secondary);
  font-size: 19rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}
.followup-item {
  display: flex;
  align-items: center;
  gap: 10rpx;
  width: 100%;
  margin: 0;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  border: 1rpx solid rgba(var(--accent-rgb), .38);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  line-height: 1.5;
}
.followup-item::after { border: 0; }
.followup-item:active { transform: scale(.99); border-color: var(--accent-ink); }
.followup-text { flex: 1; font-size: 22rpx; color: var(--accent-ink); }
.followup-item .app-icon { color: var(--accent-ink); opacity: .8; }
@keyframes fade-up-in {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.turn-avatar {
  flex: none;
  width: 48rpx;
  height: 48rpx;
  margin-top: 4rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
  background: var(--surface-strong);
  color: var(--text-secondary);
}
.turn-avatar.assistant { color: var(--accent-ink); }
.bubble {
  max-width: 78%;
  padding: 18rpx 22rpx;
  border-radius: 22rpx;
  font-size: 24rpx;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.bubble.user {
  border-top-right-radius: 8rpx;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: var(--accent-contrast);
  box-shadow: 6rpx 10rpx 22rpx var(--glow);
}
.bubble.assistant {
  border-top-left-radius: 8rpx;
  border: 1rpx solid var(--line);
  background: var(--surface);
  color: var(--text);
}
.bubble.is-failed { border-color: rgba(217, 85, 109, .4); }
/* 气泡正文必须可选：长按能选中一段再复制。uni-app 的 text 默认继承到的
   是不可选，长按只会触发滚动，选不中也复制不了（v3.5.6 修）。
   touch-callout 也一并放开，否则部分 WebView 连选择手柄都不给。 */
.bubble-text {
  display: block;
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
.retry {
  margin: 12rpx 0 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-ink);
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.4;
}
.retry::after { border: 0; }
.bubble-actions { display: flex; align-items: center; gap: 20rpx; margin-top: 12rpx; }
.bubble-actions .retry { margin-top: 0; }
.retry.is-ghost { color: var(--text-secondary); font-weight: 600; }
.bubble.is-waiting { display: flex; align-items: center; gap: 8rpx; padding: 22rpx; }
.thinking-text { font-size: 26rpx; color: var(--text-secondary); letter-spacing: 1rpx; }
.dot { width: 10rpx; height: 10rpx; border-radius: 50%; background: var(--text-secondary); opacity: .4; animation: blink 1.1s infinite; }
.dot:nth-child(2) { animation-delay: .16s; }
.dot:nth-child(3) { animation-delay: .32s; }
@keyframes blink { 0%, 70%, 100% { opacity: .25; transform: translateY(0); } 35% { opacity: .9; transform: translateY(-3rpx); } }

/* ── 输入条 ── */
.composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(152rpx + max(var(--inset-bottom, 0px), env(safe-area-inset-bottom, 0px)));
  /* 键盘弹出/收起时输入条平滑跟到键盘上沿（键盘态由全局规则改写 bottom） */
  transition: bottom 180ms ease;
  z-index: 55;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 28rpx;
  pointer-events: none;
}
.composer-inner {
  pointer-events: auto;
  display: flex;
  align-items: flex-end;
  gap: 10rpx;
  width: 100%;
  max-width: 820px;
  padding: 10rpx 10rpx 10rpx 22rpx;
  border-radius: 26rpx;
}
.composer-input {
  flex: 1;
  min-height: 60rpx;
  max-height: 220rpx;
  padding: 14rpx 0;
  color: var(--text);
  font-size: 24rpx;
  line-height: 1.6;
}
.composer-ph { color: var(--text-secondary); opacity: .6; }
.composer .send {
  flex: none;
  width: 70rpx;
  height: 70rpx;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 20rpx;
  background: var(--surface-strong);
  color: var(--text-secondary);
  line-height: 1;
  transition: background 160ms ease, color 160ms ease, transform 120ms ease;
}
.composer .send::after { border: 0; }
.composer .send.is-ready { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); box-shadow: 6rpx 8rpx 18rpx var(--glow); }
.composer .send:disabled { opacity: .55; }
.composer .send:active { transform: scale(.94); }
.composer-hint { margin-top: 8rpx; color: var(--text-secondary); font-size: 18rpx; opacity: .7; }

/* ── 助教回答的 Markdown 排版（v-html 注入，需用 :deep 命中） ── */
.md-body :deep(.md-p) { margin: 0 0 12rpx; line-height: 1.7; }
.md-body :deep(.md-p:last-child) { margin-bottom: 0; }
.md-body :deep(strong) { font-weight: 800; color: var(--accent-ink); }
.md-body :deep(em) { font-style: italic; }
.md-body :deep(.md-inline-code) {
  padding: 2rpx 8rpx; margin: 0 2rpx; border-radius: 6rpx;
  background: var(--surface-soft); color: var(--accent-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 22rpx;
}
.md-body :deep(.md-pre) {
  margin: 12rpx 0; padding: 16rpx 18rpx; border-radius: 14rpx;
  background: var(--surface-soft); overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 21rpx; line-height: 1.6;
}
.md-body :deep(.md-pre code) { white-space: pre; }
.md-body :deep(ul), .md-body :deep(ol) { margin: 8rpx 0; padding-left: 40rpx; }
.md-body :deep(li) { margin: 6rpx 0; line-height: 1.65; }
.md-body :deep(.md-h) { margin: 12rpx 0 8rpx; font-weight: 800; line-height: 1.4; }
.md-body :deep(h1) { font-size: 32rpx; }
.md-body :deep(h2) { font-size: 29rpx; }
.md-body :deep(h3) { font-size: 26rpx; }
.md-body :deep(.md-quote) {
  margin: 10rpx 0; padding: 10rpx 18rpx; border-left: 5rpx solid var(--accent);
  background: var(--surface-soft); color: var(--text-secondary); border-radius: 0 10rpx 10rpx 0;
}
.md-body :deep(.md-hr) { margin: 16rpx 0; border: 0; border-top: 1rpx solid var(--line); }
.md-body :deep(a) { color: var(--accent-ink); text-decoration: underline; }
/* 表格：横向可滚，表头带底色，列间加分隔线 */
.md-body :deep(.md-table) {
  width: 100%; max-width: 100%; margin: 12rpx 0; border-collapse: collapse;
  font-size: 22rpx; line-height: 1.5; display: block; overflow-x: auto;
  overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y;
}
.md-body :deep(.md-table th), .md-body :deep(.md-table td) {
  padding: 10rpx 14rpx; border: 1rpx solid var(--line);
  text-align: left; white-space: nowrap;
}
.md-body :deep(.md-table th) { background: var(--surface-strong); color: var(--accent-ink); font-weight: 750; }
.md-body :deep(.md-table tbody tr:nth-child(even)) { background: var(--surface-soft); }

/* 对话比列表更需要短行：手机收在 820；平板按可用宽度放宽，但不铺满整屏。 */
html .ai-page .page-content { max-width: 820px; }
html.is-tablet .ai-page .page-content { max-width: 1040px; }
html.is-tablet.is-wide .ai-page .page-content { max-width: 1120px; }
html.is-tablet .ai-head .top-bar { max-width: 1040px; }
html.is-tablet.is-wide .ai-head .top-bar { max-width: 1120px; }
html.is-tablet .composer-inner { max-width: 1040px; }
html.is-tablet.is-wide .composer-inner { max-width: 1120px; }
html.is-tablet .bubble { max-width: 82%; }
/* 平板一屏能放下两列建议，少滚一段 */
html.is-wide .suggest { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14rpx; }
html.is-wide .suggest-title { grid-column: 1 / -1; }
@media (max-width: 360px) {
  .bubble { max-width: 82%; }
}
</style>
