<template>
  <view v-if="modelValue" class="ai-mask" @click="close">
    <view class="ai-panel" @click.stop>
      <view class="ai-top">
        <view class="ai-step">{{ stepLabel }}</view>
        <button class="ai-close" aria-label="关闭" @click="close"><AppIcon name="close" :size="15" /></button>
      </view>

      <!-- ① 第一次点进来：先选路 -->
      <template v-if="step === 'plan'">
        <view class="ai-title">请选择实现方案</view>
        <view class="ai-sub">两条路最后都通向同一个输入框，选完随时可以换。</view>

        <view class="plan-list">
          <button class="plan" @click="step = 'warn'">
            <view class="plan-icon"><AppIcon name="cpu" :size="22" /></view>
            <view class="plan-body">
              <view class="plan-head">
                <text class="plan-name">接入本地模型</text>
                <text class="plan-tag is-local">完全离线</text>
              </view>
              <text class="plan-desc">模型文件放在手机上，断网也能用，说的话不出这台设备。</text>
              <text class="plan-meta">需要自备 1GB 左右的模型 · 吃内存和电</text>
            </view>
          </button>

          <button class="plan" @click="toCloud">
            <view class="plan-icon is-cloud"><AppIcon name="cloud" :size="22" /></view>
            <view class="plan-body">
              <view class="plan-head">
                <text class="plan-name">接入云端模型</text>
                <text class="plan-tag is-cloud">需要联网</text>
              </view>
              <text class="plan-desc">填自己的 API Key，响应快、回答质量高，不占手机内存。</text>
              <text class="plan-meta">要打开联网功能 · 每次提问会发到接口</text>
            </view>
          </button>
        </view>

        <button class="ai-ghost" @click="close">稍后再说</button>
      </template>

      <!-- ② 本地：先把代价讲清楚 -->
      <template v-else-if="step === 'warn'">
        <view class="ai-title">本地模型不花钱，但很吃手机</view>
        <view class="warn-quote">本地模型，对性能消耗极大，而且可能并不聪明，请酌情选择</view>
        <view class="warn-list">
          <view class="warn-item">
            <text class="warn-k">内存</text>
            <text class="warn-v">模型文件 2–4.7GB，加载时还要再占 2–5GB 运行内存。推荐档 4B 建议 6GB 以上内存；内存小就选 3B 档，8B 档要旗舰机才带得动。</text>
          </view>
          <view class="warn-item">
            <text class="warn-k">发热</text>
            <text class="warn-v">连续生成十分钟，中端机会明显烫手并降频，之后越答越慢。</text>
          </view>
          <view class="warn-item">
            <text class="warn-k">效果</text>
            <text class="warn-v">这个量级的模型只擅长「换个说法解释一个词」，长句子和语法题经常一本正经地答错。</text>
          </view>
        </view>
        <label class="warn-check" @click="dontShow = !dontShow">
          <view class="check-box" :class="{ 'is-on': dontShow }"><AppIcon v-if="dontShow" name="check" :size="15" /></view>
          <text>以后不再显示这条提醒</text>
        </label>
        <view class="ai-actions">
          <button class="ai-button ghost" @click="backFromWarn">返回</button>
          <button class="ai-button primary" @click="confirmLocal">仍然使用</button>
        </view>
      </template>

      <!-- ③ 填 Key -->
      <template v-else>
        <view class="ai-title">填写 API Key</view>
        <view class="ai-sub">Key 只保存在这台手机上，不进备份包、不同步到任何地方。</view>

        <!-- 服务商一键带出地址和模型名：地址、Key、模型名必须是同一家 -->
        <view class="preset-block">
          <text class="field-label">选服务商（点一下自动填好地址和模型名）</text>
          <view class="preset-row">
            <button
              v-for="preset in AI_PRESETS"
              :key="preset.id"
              class="preset-chip"
              :class="{ 'is-on': activePreset === preset.id }"
              @click="applyPreset(preset)"
            >{{ preset.label }}</button>
          </view>
          <text class="field-hint">{{ activeNote }}</text>
        </view>

        <view class="field">
          <view class="field-head">
            <text class="field-label">API Key</text>
            <view class="field-tools">
              <!-- 应用内粘贴：不用长按输入框，也就不会弹出系统的粘贴浮层 -->
              <button class="field-tool" @click="pasteKey">粘贴</button>
              <button class="field-tool" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
            </view>
          </view>
          <input
            v-model="keyDraft"
            class="field-input"
            :password="!showKey"
            placeholder="sk-…"
            placeholder-class="field-ph"
            :maxlength="200"
            confirm-type="done"
          />
          <text class="field-hint">复制好 Key 之后点右上角「粘贴」，不必长按输入框。</text>
        </view>

        <view class="field">
          <text class="field-label">接口地址</text>
          <input
            v-model="baseDraft"
            class="field-input"
            placeholder="https://api.deepseek.com 或 http://192.168.1.10:8080"
            placeholder-class="field-ph"
            :maxlength="200"
          />
          <text class="field-hint">https:// 或 http:// 开头都行——自己电脑上部署的服务就填它的局域网地址（如 http://192.168.1.10:8080），手机要和服务在同一网络。Key 不用 Key 的服务可随手填个短口令（如 x）。</text>
        </view>

        <view class="field">
          <text class="field-label">模型名</text>
          <input
            v-model="modelDraft"
            class="field-input"
            placeholder="deepseek-flash"
            placeholder-class="field-ph"
            :maxlength="64"
          />
          <text class="field-hint">照抄服务商文档里的名字（如 deepseek-flash）；模型名会更新，以它的后台为准。</text>
        </view>

        <view v-if="keyError" class="field-error">{{ keyError }}</view>
        <template v-else>
          <view v-if="mismatch" class="field-warn is-alert">{{ mismatch }}</view>
          <view v-if="!lab.ai.network" class="field-warn">联网功能还关着：Key 会存下来，去设置里打开联网就能开始对话。</view>
        </template>

        <view class="ai-actions">
          <button class="ai-button ghost" @click="backFromKey">{{ lab.ai.provider ? '关闭' : '返回' }}</button>
          <button class="ai-button primary" @click="submitKey">保存</button>
        </view>
        <view class="ai-foot">保存后回到「AI」板块就能开始对话；云端和本地两张卡片都在那里，随时切换、改配置。</view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { useLabStore } from '@/stores/lab';
import {
  AI_PRESETS,
  DEFAULT_API_BASE,
  configMismatch,
  matchPreset,
  normalizeApiKey,
  normalizeModel,
  type AiPreset
} from '@/utils/ai';
import { playTapFeedback } from '@/utils/feedback';
import { readClipboard } from '@/utils/clipboard';

type Step = 'plan' | 'warn' | 'key';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** 进入时的落点：plan 选方案，key 填 Key，warn 只看性能警告 */
    start?: 'plan' | 'key' | 'warn';
  }>(),
  { start: 'plan' }
);

const emit = defineEmits<{
  'update:modelValue': [boolean];
  /** 用户执意选本地：父级负责跳教程页；参数 = 是否勾选「以后不再显示」 */
  local: [dontShow: boolean];
  /** 云端参数已保存 */
  saved: [];
}>();

const lab = useLabStore();
const step = ref<Step>('plan');
/** 性能警告弹窗里「以后不再显示」勾选框 */
const dontShow = ref(false);
const showKey = ref(false);
const keyDraft = ref('');
const baseDraft = ref('');
const modelDraft = ref('');
const keyError = ref('');

const STEP_LABEL: Record<Step, string> = {
  plan: '选择方案',
  warn: '本地模型',
  key: '云端模型'
};
const stepLabel = computed(() => STEP_LABEL[step.value]);
const activePreset = computed(() => matchPreset(baseDraft.value, modelDraft.value));
const activeNote = computed(() => {
  const hit = AI_PRESETS.find((preset) => preset.id === activePreset.value);
  return hit ? hit.note : '自定义：把服务商文档里的「OpenAI 兼容地址」原样填到下面，模型名照抄它的示例。';
});
const mismatch = computed(() => configMismatch(baseDraft.value, modelDraft.value));

/** 只改地址和模型名，Key 不动：换服务商时不用重新粘贴一遍 */
function applyPreset(preset: AiPreset) {
  baseDraft.value = preset.apiBase;
  modelDraft.value = preset.model;
  keyError.value = '';
  void playTapFeedback();
}

function resolveStart(): Step {
  // 三个入口各走各的：warn 来自 AI 面板「看部署教程」，key 填 Key，其余落方案列表
  if (props.start === 'warn') return 'warn';
  return props.start === 'key' ? 'key' : 'plan';
}

/** warn 步的返回：从教程按钮进来时没有上一页，直接关；从方案列表进来才退回方案 */
function backFromWarn() {
  if (props.start === 'warn') {
    close();
    return;
  }
  step.value = 'plan';
}

/**
 * 填 Key 页的返回键。
 *
 * v3.5.6 之前这里无条件 `step = 'plan'`：已经接入模型的用户点返回，
 * 会被弹回「请选择实现方案」，像是不认账。现在只要有既存方案，返回就是
 * 关掉卡片；换方案/改配置走 AI 面板里的云端、本地两张卡片，两个入口不再共用。
 */
function backFromKey() {
  if (lab.ai.provider) {
    close();
    return;
  }
  step.value = 'plan';
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    keyError.value = '';
    dontShow.value = false;
    showKey.value = false;
    keyDraft.value = lab.ai.apiKey;
    baseDraft.value = lab.ai.apiBase;
    modelDraft.value = lab.ai.model;
    step.value = resolveStart();
  },
  { immediate: true }
);

function close() {
  emit('update:modelValue', false);
  void playTapFeedback();
}

function toCloud() {
  // 第一次配云端：默认给国内能直连的 DeepSeek。
  // 老用户保留自己填过的参数，只在他确实还停在 OpenAI 默认地址、又从没填过 Key 时才带一下。
  if (!lab.ai.apiKey && lab.ai.apiBase === DEFAULT_API_BASE) {
    const preset = AI_PRESETS[0];
    baseDraft.value = preset.apiBase;
    modelDraft.value = preset.model;
  }
  // 云端只差 Key 就直接进填写页；没选过方案也先填，保存时再判断
  step.value = 'key';
  void playTapFeedback();
}

function confirmLocal() {
  lab.chooseLocal();
  emit('local', dontShow.value);
  close();
}

/** 剪贴板里常常是一整句「我的 key 是 sk-…」，能抽出 key 就只取 key */
function extractKey(text: string): string {
  const matched = text.match(/sk-[A-Za-z0-9_-]{16,}/);
  return normalizeApiKey(matched ? matched[0] : text);
}

async function pasteKey() {
  // v3.9.11 修复：浏览器剪贴板 API 在 Capacitor WebView 里读了没反应，
  // 改用原生 ClipboardManager（H5 调试仍走浏览器兜底）
  const raw = await readClipboard();
  const value = extractKey(raw);
  if (!value) {
    uni.showToast({ title: '剪贴板里没有可用内容，长按输入框粘贴', icon: 'none' });
    return;
  }
  keyDraft.value = value;
  keyError.value = '';
  void playTapFeedback();
}

function submitKey() {
  const result = lab.saveCloud(keyDraft.value, baseDraft.value, normalizeModel(modelDraft.value));
  if (!result.ok) {
    keyError.value = result.reason;
    return;
  }
  keyError.value = '';
  emit('saved');
  close();
}
</script>

<style scoped>
.ai-mask {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx 34rpx;
  background: var(--dialog-mask);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  animation: ai-mask-in 180ms ease both;
}
.ai-panel {
  width: 100%;
  max-width: 660rpx;
  max-height: 84vh;
  overflow-y: auto;
  padding: 28rpx 30rpx 30rpx;
  border-radius: 32rpx;
  border: 1rpx solid var(--line);
  background:
    linear-gradient(158deg, var(--surface-strong), var(--surface) 72%) padding-box,
    linear-gradient(140deg, var(--glass-sheen), rgba(255, 255, 255, .05) 46%, var(--glass-refract)) border-box;
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  box-shadow: 0 34rpx 70rpx -30rpx var(--shadow-dark), inset 0 2rpx 0 var(--glass-sheen);
  animation: ai-panel-in 230ms cubic-bezier(.22, 1, .32, 1) both;
}
/* 液态玻璃覆盖样式见 App.vue 全局样式（:global 写法会被 scoped 编译丢选择器） */
.ai-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.ai-step { color: var(--text-secondary); font-size: 19rpx; font-weight: 700; letter-spacing: 2rpx; }
.ai-close { display: flex; align-items: center; justify-content: center; width: 52rpx; height: 52rpx; margin: 0; padding: 0; border: 0; border-radius: 50%; background: var(--surface-soft); color: var(--text-secondary); line-height: 1; }
.ai-title { color: var(--text); font-size: 34rpx; font-weight: 780; letter-spacing: .4rpx; }
.ai-sub { margin-top: 12rpx; color: var(--text-secondary); font-size: 23rpx; line-height: 1.65; }

/* 两张方案卡：左图标右文字，整块可点 */
.plan-list { display: flex; flex-direction: column; gap: 14rpx; margin-top: 22rpx; }
.plan { display: flex; align-items: flex-start; gap: 16rpx; width: 100%; margin: 0; padding: 20rpx 18rpx; border-radius: 22rpx; border: 1rpx solid var(--line); background: var(--surface-soft); text-align: left; line-height: 1.4; transition: transform 120ms ease, border-color 160ms ease, box-shadow 160ms ease; }
.plan:active { transform: scale(.985); border-color: var(--accent-ink); }
.plan-icon { flex: none; width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; border-radius: 18rpx; background: var(--surface-strong); color: var(--accent-ink); }
.plan-icon.is-cloud { color: var(--accent-2); }
.plan-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
.plan-head { display: flex; align-items: center; gap: 10rpx; }
.plan-name { color: var(--text); font-size: 27rpx; font-weight: 750; white-space: nowrap; }
.plan-tag { padding: 2rpx 12rpx; border-radius: 999rpx; font-size: 18rpx; font-weight: 700; letter-spacing: .5rpx; }
.plan-tag.is-local { background: rgba(var(--accent-rgb), .16); color: var(--accent-ink); }
.plan-tag.is-cloud { background: rgba(56, 178, 172, .16); color: #2f9c96; }
.plan-desc { color: var(--text); font-size: 22rpx; line-height: 1.55; }
.plan-meta { color: var(--text-secondary); font-size: 20rpx; }

.ai-ghost { width: 100%; height: 76rpx; margin: 20rpx 0 0; padding: 0; border: 0; border-radius: 20rpx; background: transparent; color: var(--text-secondary); font-size: 24rpx; line-height: 76rpx; }
.ai-ghost::after { border: 0; }

/* 本地警告：原文单独引用，下面是三条代价 */
.warn-quote { margin-top: 20rpx; padding: 20rpx 22rpx; border-radius: 18rpx; border-left: 5rpx solid #e0873c; background: rgba(224, 135, 60, .12); color: var(--text); font-size: 25rpx; font-weight: 650; line-height: 1.6; }
.warn-list { display: flex; flex-direction: column; gap: 14rpx; margin-top: 20rpx; }
.warn-item { display: flex; gap: 14rpx; }
.warn-k { flex: 0 0 56rpx; color: var(--text-secondary); font-size: 21rpx; font-weight: 700; letter-spacing: 1rpx; }
.warn-v { flex: 1; color: var(--text-secondary); font-size: 21rpx; line-height: 1.62; }

/* 「以后不再显示」勾选 */
.warn-check { display: flex; align-items: center; gap: 12rpx; margin-top: 22rpx; padding: 4rpx 2rpx; color: var(--text-secondary); font-size: 21rpx; }
.check-box { flex: none; width: 34rpx; height: 34rpx; display: flex; align-items: center; justify-content: center; border-radius: 9rpx; border: 2rpx solid var(--line); background: var(--surface-soft); color: var(--accent-contrast); }
.check-box.is-on { background: var(--accent); border-color: var(--accent-ink); }

.field { margin-top: 22rpx; }
.preset-block { margin-top: 24rpx; }
.preset-row { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; }
.preset-chip {
  margin: 0;
  padding: 10rpx 20rpx;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
  background: var(--surface-soft);
  color: var(--text-secondary);
  font-size: 20rpx;
  line-height: 1.4;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}
.preset-chip::after { border: 0; }
.preset-chip.is-on {
  background: linear-gradient(135deg, rgba(var(--accent-rgb), .18), rgba(56, 178, 172, .14));
  border-color: var(--accent-ink);
  color: var(--text);
  font-weight: 700;
}
.field-head { display: flex; align-items: baseline; justify-content: space-between; }
.field-label { color: var(--text); font-size: 22rpx; font-weight: 700; }
.field-tools { display: flex; align-items: center; gap: 4rpx; }
.field-tool { margin: 0; padding: 0 10rpx; border: 0; background: transparent; color: var(--accent-ink); font-size: 20rpx; line-height: 1.4; }
.field-tool::after { border: 0; }
.field-input { width: 100%; height: 86rpx; margin-top: 10rpx; padding: 0 22rpx; box-sizing: border-box; border-radius: 18rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--text); font-size: 24rpx; }
.field-ph { color: var(--text-secondary); opacity: .6; }
.field-hint { display: block; margin-top: 8rpx; color: var(--text-secondary); font-size: 19rpx; }
.field-error { margin-top: 14rpx; padding: 12rpx 18rpx; border-radius: 14rpx; background: rgba(217, 85, 109, .14); color: #d9556d; font-size: 21rpx; }
.field-warn { margin-top: 14rpx; padding: 12rpx 18rpx; border-radius: 14rpx; background: rgba(224, 135, 60, .13); color: #d98332; font-size: 21rpx; line-height: 1.5; }
.field-warn.is-alert { background: rgba(217, 85, 109, .12); color: #c85b6e; font-weight: 650; }

.ai-actions { display: flex; gap: 14rpx; margin-top: 26rpx; }
.ai-button { flex: 1; height: 84rpx; margin: 0; padding: 0; border-radius: 22rpx; border: 1rpx solid transparent; font-size: 26rpx; font-weight: 700; line-height: 84rpx; text-align: center; }
.ai-button::after { border: 0; }
.ai-button:active { transform: scale(.975); }
.ai-button.ghost { flex: 0 0 200rpx; background: var(--surface-soft); border-color: var(--line); color: var(--text-secondary); }
.ai-button.primary { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); box-shadow: 8rpx 12rpx 24rpx var(--glow); }
.ai-foot { margin-top: 16rpx; color: var(--text-secondary); font-size: 19rpx; line-height: 1.6; opacity: .82; }
@keyframes ai-mask-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ai-panel-in {
  from { opacity: 0; transform: translateY(26rpx) scale(.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
