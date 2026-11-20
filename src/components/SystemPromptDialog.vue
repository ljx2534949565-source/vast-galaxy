<template>
  <view v-if="modelValue" class="ai-mask" @click="close">
    <view class="ai-panel" @click.stop>
      <view class="ai-top">
        <view class="ai-step">助教人设</view>
        <button class="ai-close" aria-label="关闭" @click="close"><AppIcon name="close" :size="15" /></button>
      </view>

      <view class="ai-title">系统提示词</view>
      <view class="ai-sub">这段指令会在每次提问时悄悄发给 AI，决定它用什么身份和语气回答。本地和云端模型都用它。</view>

      <view class="field">
        <view class="field-head">
          <text class="field-label">提示词内容</text>
          <text class="count">{{ draft.length }} 字</text>
        </view>
        <textarea
          v-model="draft"
          class="prompt-input"
          :maxlength="MAX_PROMPT"
          :show-confirm-bar="false"
          placeholder="例如：你是我的考研英语助教，回答简短、用中文…"
          placeholder-class="prompt-ph"
          auto-height
        />
        <view class="field-hint">留空并保存 = 恢复默认人设。改完点保存，下一次提问就生效。</view>
      </view>

      <view v-if="error" class="field-error">{{ error }}</view>

      <view class="ai-actions">
        <button class="ai-button ghost" @click="resetDefault">恢复默认</button>
        <button class="ai-button primary" @click="save">保存</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { SYSTEM_PROMPT } from '@/utils/chat';

const props = defineProps<{ modelValue: boolean; current: string }>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  save: [string];
}>();

const MAX_PROMPT = 2000;
const draft = ref('');
const error = ref('');

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    draft.value = props.current || '';
    error.value = '';
  }
);

function close() {
  emit('update:modelValue', false);
}

function resetDefault() {
  draft.value = SYSTEM_PROMPT;
  error.value = '';
}

function save() {
  const text = draft.value.trim();
  if (text.length > MAX_PROMPT) {
    error.value = `最多 ${MAX_PROMPT} 字，现在超了。`;
    return;
  }
  emit('save', text);
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
.ai-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.ai-step { color: var(--text-secondary); font-size: 19rpx; font-weight: 700; letter-spacing: 2rpx; }
.ai-close { display: flex; align-items: center; justify-content: center; width: 52rpx; height: 52rpx; margin: 0; padding: 0; border: 0; border-radius: 50%; background: var(--surface-soft); color: var(--text-secondary); line-height: 1; }
.ai-title { color: var(--text); font-size: 34rpx; font-weight: 780; letter-spacing: .4rpx; }
.ai-sub { margin-top: 12rpx; color: var(--text-secondary); font-size: 23rpx; line-height: 1.65; }

.field { margin-top: 24rpx; }
.field-head { display: flex; align-items: baseline; justify-content: space-between; }
.field-label { color: var(--text); font-size: 22rpx; font-weight: 700; }
.count { color: var(--text-secondary); font-size: 19rpx; }
.prompt-input {
  width: 100%;
  min-height: 240rpx;
  margin-top: 12rpx;
  padding: 20rpx 22rpx;
  box-sizing: border-box;
  border-radius: 18rpx;
  border: 1rpx solid var(--line);
  background: var(--surface-soft);
  color: var(--text);
  font-size: 23rpx;
  line-height: 1.7;
}
.prompt-ph { color: var(--text-secondary); opacity: .6; }
.field-hint { display: block; margin-top: 10rpx; color: var(--text-secondary); font-size: 19rpx; line-height: 1.5; }
.field-error { margin-top: 14rpx; padding: 12rpx 18rpx; border-radius: 14rpx; background: rgba(217, 85, 109, .14); color: #d9556d; font-size: 21rpx; }

.ai-actions { display: flex; gap: 16rpx; margin-top: 30rpx; }
.ai-button { flex: 1; height: 84rpx; margin: 0; padding: 0; border-radius: 22rpx; border: 1rpx solid transparent; font-size: 26rpx; font-weight: 700; line-height: 84rpx; text-align: center; }
.ai-button::after { border: 0; }
.ai-button:active { transform: scale(.975); }
.ai-button.ghost { flex: 0 0 220rpx; background: var(--surface-soft); border-color: var(--line); color: var(--text-secondary); }
.ai-button.primary { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); box-shadow: 8rpx 12rpx 24rpx var(--glow); }

@keyframes ai-mask-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ai-panel-in { from { opacity: 0; transform: translateY(30rpx) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>
