<template>
  <view v-if="modelValue" class="dialog-mask" @click="cancel">
    <view class="dialog" @click.stop>
      <view class="dialog-title">{{ title }}</view>
      <view v-if="content" class="dialog-body">{{ content }}</view>
      <view class="dialog-actions">
        <button v-if="!single" class="dialog-button ghost" @click="cancel"><text class="btn-text">{{ cancelText }}</text></button>
        <button class="dialog-button" :class="[danger ? 'danger' : 'confirm', { 'is-long': confirmText.length > 6 }]" @click="confirm"><text class="btn-text">{{ confirmText }}</text></button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    content?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    single?: boolean;
  }>(),
  { content: '', confirmText: '确定', cancelText: '取消', danger: false, single: false }
);

const emit = defineEmits<{ 'update:modelValue': [boolean]; confirm: []; cancel: [] }>();

function cancel() {
  emit('update:modelValue', false);
  emit('cancel');
}
function confirm() {
  emit('update:modelValue', false);
  emit('confirm');
}
</script>

<style scoped>
.dialog-mask {
  position: fixed;
  z-index: 999;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  background: var(--dialog-mask);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  animation: mask-in 180ms ease both;
}
.dialog {
  width: 100%;
  max-width: 620rpx;
  padding: 40rpx 34rpx 30rpx;
  border-radius: 32rpx;
  border: 1rpx solid var(--line);
  background:
    linear-gradient(158deg, var(--surface-strong), var(--surface) 72%) padding-box,
    linear-gradient(140deg, var(--glass-sheen), rgba(255, 255, 255, .05) 46%, var(--glass-refract)) border-box;
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  box-shadow: 0 34rpx 70rpx -30rpx var(--shadow-dark), inset 0 2rpx 0 var(--glass-sheen);
  animation: dialog-in 220ms cubic-bezier(.22, 1, .32, 1) both;
}
/* 液态玻璃覆盖样式见 App.vue 全局样式（:global 写法会被 scoped 编译丢选择器） */
.dialog-title { color: var(--text); font-size: 33rpx; font-weight: 750; letter-spacing: .5rpx; }
.dialog-body { margin-top: 20rpx; color: var(--text-secondary); font-size: 25rpx; line-height: 1.7; }
.dialog-actions { display: flex; gap: 16rpx; margin-top: 34rpx; align-items: stretch; }
.dialog-button {
  flex: 1;
  min-height: 84rpx;
  height: auto;
  margin: 0;
  padding: 16rpx 12rpx;
  border-radius: 22rpx;
  border: 1rpx solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-text { font-size: 27rpx; font-weight: 700; line-height: 1.35; text-align: center; word-break: break-word; }
/* 长文案（如「从 Vast Galaxy 里卸载」）自动缩小字号，保证整句显示不被截断 */
.dialog-button.is-long .btn-text { font-size: 23rpx; }
.dialog-button::after { border: 0; }
.dialog-button:active { transform: scale(.97); }
.dialog-button.ghost { background: var(--surface-soft); border-color: var(--line); color: var(--text-secondary); }
.dialog-button.confirm { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); box-shadow: 8rpx 12rpx 24rpx var(--glow); }
.dialog-button.danger { background: linear-gradient(135deg, #d9556d, #ef8496); color: #fff; box-shadow: 8rpx 12rpx 24rpx rgba(220, 113, 135, .3); }
@keyframes mask-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes dialog-in {
  from { opacity: 0; transform: translateY(24rpx) scale(.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
