<template>
  <view class="page">
    <view class="page-content">
      <view class="top-bar">
        <button class="icon-button" aria-label="返回" @click="goBack"><AppIcon name="back" :size="25" /></button>
        <view class="mistake-heading"><view class="top-title">错题本</view><view class="top-subtitle">{{ items.length }} 个词等待攻克</view></view>
        <view class="mistake-total serif">{{ items.length }}</view>
      </view>

      <view v-if="items.length" class="mistakes-content">
        <view class="practice-card glass-card">
          <view><view class="practice-title">把薄弱点变成得分点</view><view class="top-subtitle">答“认识”后自动移出错题本</view></view>
          <button class="primary-button practice-button" @click="startPractice">开始专练</button>
        </view>
        <view class="mistake-list">
          <view v-for="item in items" :key="item.word.id" class="mistake-card glass-card">
            <view class="word-row">
              <view class="word-copy"><view class="word serif">{{ item.word.word }}</view><view class="phonetic serif">{{ item.word.phonetic }} · {{ item.word.pos }}</view></view>
              <button class="icon-button sound" aria-label="播放发音" @click="speak(item.word.word).catch(() => undefined)"><AppIcon name="volume" :size="23" /></button>
            </view>
            <view class="meaning">{{ item.word.meaning }}</view>
            <view class="card-footer">
              <view class="mistake-meta"><text>错 {{ item.record.wrongCount }} 次</text><text>Unit {{ item.word.unit }}</text><text>{{ sourceLabel(item.record.sources) }}</text></view>
              <button class="remove-button" aria-label="移出错题本" @click="confirmRemove(item.word.id)"><AppIcon name="trash" :size="20" /></button>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="empty glass-card fade-up">
        <view class="empty-icon"><AppIcon name="sparkles" :size="44" /></view>
        <view class="empty-title">这里没有负担</view>
        <view class="empty-copy">学习和测验中的错误会自动出现在这里。</view>
        <button class="primary-button" @click="goBack">返回首页</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import words from '@/data/wordsData';
import { useProgressStore } from '@/stores/progress';
import { useTTS } from '@/composables/useTTS';
import type { MistakeSource } from '@/utils/storage';

const store = useProgressStore();
const { speak } = useTTS();
onShow(() => store.reload());
const items = computed(() => store.mistakes
  .map((record) => ({ record, word: words.find((word) => word.id === record.wordId) }))
  .filter((item) => item.word)
  .sort((a, b) => b.record.lastWrongAt - a.record.lastWrongAt));
const sourceNames: Record<MistakeSource, string> = { study: '学习', quiz: '测验', spelling: '拼写' };
function sourceLabel(sources: MistakeSource[]) { return sources.map((source) => sourceNames[source]).join(' / '); }
function startPractice() { uni.navigateTo({ url: '/pages/study/study?mode=mistakes' }); }
function confirmRemove(wordId: number) {
  uni.showModal({
    title: '移出错题本？',
    content: '学习进度不会受到影响。',
    success: (result) => { if (result.confirm) store.removeMistake(wordId); }
  });
}
function goBack() { uni.navigateBack({ delta: 1, fail: () => uni.reLaunch({ url: '/pages/index/index' }) }); }
</script>

<style scoped>
.mistake-heading { flex: 1; margin-left: 22rpx; }
.mistake-total { color: var(--danger); font-size: 37rpx; }
.practice-card { padding: 28rpx; }
.practice-title { margin-bottom: 8rpx; font-size: 29rpx; font-weight: 720; }
.practice-button { width: 100%; margin-top: 22rpx; }
.mistake-list { display: flex; flex-direction: column; gap: 20rpx; margin-top: 24rpx; }
.mistake-card { padding: 28rpx; }
.word-row { display: flex; align-items: center; justify-content: space-between; }
.word { font-size: 46rpx; font-weight: 700; overflow-wrap: anywhere; }
.phonetic { margin-top: 10rpx; color: var(--text-secondary); font-size: 24rpx; }
.sound { width: 68rpx; height: 68rpx; color: var(--accent-ink); }
.meaning { margin-top: 24rpx; font-size: 30rpx; line-height: 1.5; }
.card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 24rpx; padding-top: 20rpx; border-top: 1rpx solid var(--line); }
.mistake-meta { display: flex; flex-wrap: wrap; gap: 16rpx; color: var(--text-secondary); font-size: 20rpx; }
.remove-button { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; padding: 0; border-radius: 18rpx; background: var(--surface-soft); color: var(--text-secondary); }
.empty { margin-top: 16vh; padding: 48rpx 34rpx; text-align: center; }
.empty-icon { width: 106rpx; height: 106rpx; display: flex; align-items: center; justify-content: center; margin: 0 auto 24rpx; border-radius: 34rpx; background: var(--surface-soft); color: var(--accent-ink); }
.empty-title { font-size: 38rpx; font-weight: 750; }
.empty-copy { margin: 20rpx 0 30rpx; color: var(--text-secondary); font-size: 24rpx; line-height: 1.6; }

/* 平板：错题卡片双列，开始专练改成横条，减少一屏占用 */
html.is-wide .mistake-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
  align-items: start;
}
html.is-wide .mistake-card { min-width: 0; }
html.is-wide .practice-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}
html.is-wide .practice-button {
  width: auto;
  min-width: 220rpx;
  margin-top: 0;
  padding-left: 32rpx;
  padding-right: 32rpx;
}
</style>
