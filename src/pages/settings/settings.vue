<template>
  <view class="page">
    <view class="page-content">
      <view class="top-bar">
        <button class="icon-button" aria-label="返回" @click="goBack">
          <AppIcon name="back" :size="25" />
        </button>
        <view class="setting-heading">
          <view class="top-title">设置</view>
          <view class="top-subtitle">v{{ APP_VERSION }} · 数据留在本机</view>
        </view>
        <view class="top-spacer" />
      </view>

      <view class="settings-grid">
      <view class="setting-block">
      <view class="section-label">外观</view>

      <view class="card glass-card fade-up">
        <view class="card-head">
          <view>
            <view class="card-title">自定义背景</view>
            <view class="card-copy">每次导入都会存入历史，所有页面一起换</view>
          </view>
        </view>

        <view class="preview" :class="{ 'is-empty': !settings.background }">
          <image v-if="settings.background" class="preview-img" :src="settings.background" mode="aspectFill" />
          <view v-else class="preview-empty">
            <AppIcon name="image" :size="34" />
            <text>还没有自定义背景</text>
          </view>
          <view v-if="settings.background" class="preview-tag">当前背景</view>
        </view>

        <view class="action-row">
          <button class="primary-button" @click="pickImage">
            <AppIcon name="upload" :size="19" />
            <text>{{ settings.background ? '更换图片' : '导入图片' }}</text>
          </button>
          <button v-if="settings.background" class="secondary-button" @click="askRemove">停用</button>
        </view>

        <view v-if="settings.wallpapers.length" class="history-head">
          <text class="history-title">历史壁纸</text>
          <text class="history-count">{{ settings.wallpapers.length }} 张 · 点图即换</text>
        </view>
        <scroll-view v-if="settings.wallpapers.length" scroll-x class="wallpaper-scroll" :show-scrollbar="false">
          <view class="wallpaper-list">
            <view
              class="wallpaper-item wallpaper-default"
              :class="{ active: !settings.background }"
              role="button"
              aria-label="使用默认渐变背景"
              @click="useDefaultBackground"
            >
              <AppIcon name="sparkles" :size="26" />
              <text>默认渐变</text>
            </view>
            <view
              v-for="item in settings.wallpapers"
              :key="item.id"
              class="wallpaper-item"
              :class="{ active: settings.background === item.dataUrl }"
              role="button"
              :aria-label="`切换到壁纸 ${item.name}`"
              @click="selectWallpaper(item.id)"
            >
              <image class="wallpaper-thumb" :src="item.dataUrl" mode="aspectFill" />
              <view class="wallpaper-shade" />
              <text class="wallpaper-name">{{ item.name }}</text>
              <text v-if="settings.background === item.dataUrl" class="wallpaper-current">使用中</text>
              <button class="wallpaper-delete" :aria-label="`删除壁纸 ${item.name}`" @click.stop="askDelete(item.id)">
                <AppIcon name="close" :size="14" />
              </button>
            </view>
          </view>
        </scroll-view>

        <view v-if="settings.wallpapers.length" class="storage-row">
          <text class="storage-text">{{ storageText }}</text>
          <button class="storage-action" @click="askCompact">压缩历史壁纸</button>
        </view>

        <view class="hint">从相册或文件里选一张图即可，会自动压成小体积图片并裁剪铺满，不上传网络。壁纸存在 App 内部的本地存储配额里，跟手机剩余空间无关；图片越小，能存的张数越多。历史会一直保留，只有点右上角删除才移除；每张图的名字固定跟着它自己，切换顺序变了也不会改名。</view>
      </view>
      </view>

      <view class="setting-block">
        <view class="section-label">主题色</view>
        <view class="card glass-card fade-up">
          <view class="card-head">
            <view>
              <view class="card-title">控件主色调</view>
              <view class="card-copy">12 色水彩笔配色，按钮、开关和滑轨整套渐变一起换</view>
            </view>
            <view class="accent-current">{{ accentLabel }}</view>
          </view>
          <view class="accent-grid">
            <button
              v-for="option in ACCENT_THEMES"
              :key="option.name"
              class="accent-option"
              :class="{ active: settings.accent === option.name }"
              :aria-pressed="settings.accent === option.name"
              :aria-label="`使用${option.label}渐变主题`"
              @click="pickAccent(option.name)"
            >
              <view
                class="accent-swatch"
                :style="{ background: `linear-gradient(135deg, ${option.light.accent}, ${option.light.accent2} 58%, ${option.light.accent3})` }"
              >
                <view class="accent-swatch-glint" />
              </view>
              <text class="accent-option-label">{{ option.label }}</text>
            </button>
          </view>
          <view class="hint">选好后立即生效并记住。只换控件配色，不改壁纸、深浅色模式，也不改答对的绿色和答错的红色。</view>
        </view>
      </view>

      <view class="setting-block">
        <view class="section-label">玻璃质感</view>
        <view class="card glass-card fade-up">
          <view class="dim-head">
            <view>
              <view class="card-title">雾化与玻璃</view>
              <view class="card-copy">壁纸的雾化程度、控件的玻璃质感，各走一个滑块</view>
            </view>
            <view class="glass-head-actions">
              <view class="dim-state">{{ settings.glassEffect ? dimState : '已关闭' }}</view>
              <!-- 玻璃质感总开关：关掉后全局去模糊 + 实色底，低端机省去每帧重采样 -->
              <view
                class="toggle"
                :class="{ on: settings.glassEffect }"
                role="switch"
                :aria-checked="settings.glassEffect"
                aria-label="玻璃质感总开关"
                @click="toggleGlassEffect"
              >
                <view class="toggle-knob" />
              </view>
            </view>
          </view>

          <!-- 总开关关掉后，下面这些细分调节全部置灰禁用：此时不走毛玻璃，调了也没用 -->
          <view class="glass-body" :class="{ 'is-off': !settings.glassEffect }">
          <!-- 没有壁纸时没有「雾化」可调，但两种玻璃质感照样能切换 -->
          <view v-if="settings.background" class="dim-row" :class="{ 'is-custom': settings.dimMode === 'custom' }">
            <button
              v-for="preset in dimPresets"
              :key="preset.value"
              class="dim-chip"
              :class="{ active: settings.dimMode === 'preset' && settings.bgDim === preset.value && settings.glass === preset.value }"
              @click="applyPreset(preset.value)"
            >
              <view class="dim-swatch" :style="{ background: preset.swatch }" />
              <text>{{ preset.label }}</text>
            </button>
          </view>

          <view v-if="settings.background" class="slider-block" :class="{ 'is-preset': settings.dimMode === 'preset' }">
            <view class="slider-head">
              <text class="slider-name">壁纸雾化</text>
              <text class="slider-value">{{ settings.bgDim }}</text>
            </view>
            <view class="dim-scale">
              <text class="dim-edge">清晰</text>
              <slider
                class="dim-slider"
                :value="settings.bgDim"
                :min="0"
                :max="100"
                :step="1"
                :active-color="sliderPalette.accent"
                background-color="rgba(126, 143, 167, .24)"
                block-color="#FFFFFF"
                :block-size="22"
                @changing="onFogPreview"
                @change="onFogCommit"
              />
              <text class="dim-edge">压暗</text>
            </view>
          </view>

          <view v-if="settings.background" class="slider-block" :class="{ 'is-preset': settings.dimMode === 'preset' }">
            <view class="slider-head">
              <text class="slider-name">控件玻璃</text>
              <text class="slider-value">{{ settings.glass }}</text>
            </view>
            <view class="dim-scale">
              <text class="dim-edge">裸玻璃</text>
              <slider
                class="dim-slider"
                :value="settings.glass"
                :min="0"
                :max="100"
                :step="1"
                :active-color="sliderPalette.accent2"
                background-color="rgba(126, 143, 167, .24)"
                block-color="#FFFFFF"
                :block-size="22"
                @changing="onGlassPreview"
                @change="onGlassCommit"
              />
              <text class="dim-edge">实底</text>
            </view>
          </view>

          <view class="glass-mode-row">
            <button
              class="glass-mode"
              :class="{ active: settings.glassMode === 'fog' }"
              :aria-pressed="settings.glassMode === 'fog'"
              @click="pickGlassMode('fog')"
            >
              <view class="glass-sample is-fog" />
              <view class="glass-mode-copy">
                <text class="glass-mode-name">雾玻璃</text>
                <text class="glass-mode-sub">厚 · 柔 · 磨砂</text>
              </view>
            </button>
            <button
              class="glass-mode"
              :class="{ active: settings.glassMode === 'liquid' }"
              :aria-pressed="settings.glassMode === 'liquid'"
              @click="pickGlassMode('liquid')"
            >
              <view class="glass-sample is-liquid" />
              <view class="glass-mode-copy">
                <text class="glass-mode-name">液态玻璃</text>
                <text class="glass-mode-sub">薄 · 亮 · 透</text>
              </view>
            </button>
          </view>

          <view class="hint">
            <template v-if="settings.background">
              三档是快捷方式：点一下两个滑块同时落到 25 / 50 / 75，之后仍可单独微调。
              手一碰任一滑块，三档就变灰；点回三档，滑块跟着回到预设值。
              两种玻璃都受「控件玻璃」滑块控制：往右更实，往左更透。
            </template>
            <template v-else>
              导入自定义背景后，还能分别调「壁纸雾化」和「控件玻璃」两根滑块；现在就可以先挑玻璃质感。
            </template>
            {{ settings.glassEffect
              ? '手机发烫、滑动发卡可以关掉上面的总开关：全局改用实色，不再实时模糊壁纸。'
              : '玻璃质感已关闭，全部改用实色底，滑动更省电流畅；打开总开关即可恢复磨砂效果。' }}
          </view>
          </view>
        </view>
      </view>

      <view class="setting-block">
      <view class="section-label">主题</view>
      <view class="card glass-card fade-up">
        <view class="card-head">
          <view class="card-title-wrap">
            <view class="card-title">深色模式</view>
            <view class="card-copy">自动跟随系统，也可以固定在浅色或深色</view>
          </view>
          <view class="theme-chip">
            <AppIcon :name="settings.resolved === 'dark' ? 'moon' : 'sun'" :size="18" />
            <text>{{ settings.resolved === 'dark' ? '深色' : '浅色' }}</text>
          </view>
        </view>
        <view class="theme-row">
          <button
            v-for="option in THEME_OPTIONS"
            :key="option.value"
            class="theme-option"
            :class="{ active: settings.mode === option.value }"
            :aria-pressed="settings.mode === option.value"
            @click="pickTheme(option.value)"
          >
            <AppIcon :name="option.icon" :size="19" />
            <text class="theme-option-label">{{ option.label }}</text>
          </button>
        </view>
        <view class="hint">选「自动」时系统换成深色，App 立刻跟着换；选「浅色 / 深色」就固定住，不再随系统变。</view>
      </view>
      </view>

      <view class="setting-block">
      <view class="section-label">反馈</view>
      <view class="card glass-card fade-up">
        <view class="card-head">
          <view class="card-title-wrap">
            <view class="card-title">触感反馈</view>
            <view class="card-copy">答对轻快三连击，答错一顿一沉，各配自己的动效节奏</view>
          </view>
          <view
            class="toggle"
            :class="{ on: settings.haptic }"
            role="switch"
            :aria-checked="settings.haptic"
            aria-label="触感反馈开关"
            @click="toggleHaptic"
          >
            <view class="toggle-knob" />
          </view>
        </view>
        <view class="haptic-row">
          <button class="haptic-button" @click="tryHaptic('correct')">试试答对</button>
          <button class="haptic-button" @click="tryHaptic('wrong')">试试答错</button>
        </view>
        <view class="hint">
          {{ settings.haptic ? '关掉开关后，答题、开关、切换都不会再震动。' : '震动已关闭，两个试听按钮也不会响。' }}
          点了没感觉，先确认系统设置里的「触感反馈 / 振动强度」没有关到最低或静音。
        </view>
      </view>

        <!-- 答题音效（v3.10）：默认关，开了以后答对答错各放一段短音；与震动互相独立 -->
        <view class="card glass-card fade-up" style="margin-top:20rpx;">
          <view class="card-head">
            <view class="card-title-wrap">
              <view class="card-title">答题音效</view>
              <view class="card-copy">答对答错各配一段提示音，默认关闭</view>
            </view>
            <view
              class="toggle"
              :class="{ on: settings.sound }"
              role="switch"
              :aria-checked="settings.sound"
              aria-label="答题音效开关"
              @click="toggleSound"
            >
              <view class="toggle-knob" />
            </view>
          </view>

          <view class="sound-group">
            <view class="sound-group-title">答对</view>
            <view class="sound-options">
              <button
                class="sound-option"
                :class="{ chosen: settings.correctSound === 'warm_pop' }"
                @click="chooseCorrect('warm_pop')"
              >
                <text class="sound-option-name">温暖轻弹</text>
                <text class="sound-option-tag">{{ settings.correctSound === 'warm_pop' ? '使用中' : '点选' }}</text>
              </button>
              <button
                class="sound-option"
                :class="{ chosen: settings.correctSound === 'triple_chime' }"
                @click="chooseCorrect('triple_chime')"
              >
                <text class="sound-option-name">三连音</text>
                <text class="sound-option-tag">{{ settings.correctSound === 'triple_chime' ? '使用中' : '点选' }}</text>
              </button>
            </view>
          </view>

          <view class="sound-group">
            <view class="sound-group-title">答错</view>
            <view class="sound-options">
              <button
                class="sound-option"
                :class="{ chosen: settings.wrongSound === 'muted_double' }"
                @click="chooseWrong('muted_double')"
              >
                <text class="sound-option-name">闷双音</text>
                <text class="sound-option-tag">{{ settings.wrongSound === 'muted_double' ? '使用中' : '点选' }}</text>
              </button>
              <button
                class="sound-option"
                :class="{ chosen: settings.wrongSound === 'soft_wood_tap' }"
                @click="chooseWrong('soft_wood_tap')"
              >
                <text class="sound-option-name">轻木鱼</text>
                <text class="sound-option-tag">{{ settings.wrongSound === 'soft_wood_tap' ? '使用中' : '点选' }}</text>
              </button>
            </view>
          </view>

          <view class="haptic-row">
            <button class="haptic-button" @click="trySound('correct')">试听答对</button>
            <button class="haptic-button" @click="trySound('wrong')">试听答错</button>
          </view>
          <view class="hint">
            {{ settings.sound ? '音效已开启，答题时会播放上面的声音。' : '音效关闭中，打开开关后答题才会响；试听按钮关着也能听。' }}
            音效和震动各自独立，可以只开其中一个。
          </view>
        </view>
      </view>

      <view class="setting-block">
      <view class="section-label">答题</view>
      <view class="card glass-card fade-up">
        <view class="card-head">
          <view class="card-title-wrap">
            <view class="card-title">答对自动下一题</view>
            <view class="card-copy">答对后 0.3 秒自动翻页，答错会停住</view>
          </view>
          <view
            class="toggle"
            :class="{ on: settings.autoNext }"
            role="switch"
            :aria-checked="settings.autoNext"
            @click="toggleAutoNext"
          >
            <view class="toggle-knob" />
          </view>
        </view>
        <view class="hint">翻页前有一条 0.3 秒进度线，点一下就能停在本题。</view>
      </view>
      </view>

      <view class="setting-block">
      <view class="section-label">实验室</view>
      <view class="card glass-card fade-up lab-card">
        <view class="row-line" role="switch" :aria-checked="settings.experimental" @click="toggleExperimental">
          <view class="row-copy">
            <view class="row-name">实验性功能</view>
            <view class="row-sub">{{ settings.experimental ? '底部已出现功能栏：AI / 单词 / 音乐' : '打开后底部出现 AI 与音乐两个板块' }}</view>
          </view>
          <view class="toggle" :class="{ on: settings.experimental }"><view class="toggle-knob" /></view>
        </view>

        <template v-if="settings.experimental">
          <view class="lab-divider" />

          <!-- 联网单独一项：不挂在任何功能卡片里 -->
          <view class="row-line" role="switch" :aria-checked="lab.ai.network" aria-label="联网开关" @click="toggleNetwork">
            <view class="row-copy">
              <view class="row-name">联网</view>
              <view class="row-sub">{{ lab.ai.network ? '已开启 · 只有你主动提问时才会发出请求' : '已关闭 · 应用不会发出任何请求' }}</view>
            </view>
            <view class="toggle" :class="{ on: lab.ai.network }"><view class="toggle-knob" /></view>
          </view>

          <view class="lab-divider" />

          <!-- 系统提示词：AI 助教的人设和语气，本地 / 云端共用 -->
          <view class="row-line" @click="openPromptDialog">
            <view class="row-copy">
              <view class="row-name">系统提示词</view>
              <view class="row-sub">{{ promptSummary }}</view>
            </view>
            <view class="row-value">
              <view class="row-arrow"><AppIcon name="back" :size="14" /></view>
            </view>
          </view>

          <view class="lab-divider" />

          <!-- 追问建议：每轮 AI 回答后自动生成两条「你可能还想问」，点一下填进输入框 -->
          <view class="row-line" role="switch" :aria-checked="lab.followUpsEnabled" aria-label="追问建议开关" @click="toggleFollowUps">
            <view class="row-copy">
              <view class="row-name">追问建议</view>
              <view class="row-sub">{{ lab.followUpsEnabled ? '已开启 · 每次回答后猜两条你可能想接着问的话' : '已关闭 · 回答后不再显示追问' }}</view>
            </view>
            <view class="toggle" :class="{ on: lab.followUpsEnabled }"><view class="toggle-knob" /></view>
          </view>

          <view class="lab-divider" />

          <view class="row-line" @click="goMusic">
            <view class="row-copy">
              <view class="row-name">本地音乐</view>
              <view class="row-sub">曲库和全量 / 增量扫描都在「音乐」板块</view>
            </view>
            <view class="row-value">
              <text>{{ lab.hasLibrary ? `${lab.stats.count} 首` : '未扫描' }}</text>
              <view class="row-arrow"><AppIcon name="back" :size="14" /></view>
            </view>
          </view>
        </template>

        <view class="hint">
          <template v-if="settings.experimental">两个板块都在底部功能栏里，向左或向右滑也能过去。关掉上面的开关，功能栏和这三项会一起收起来，已填的 Key、已扫的曲库都还在。</template>
          <template v-else>这是给新功能试水用的开关，默认关闭。关着的时候，AI 和音乐不会在界面上的任何位置出现。</template>
        </view>
      </view>
      </view>
      </view>

      <view class="footnote">{{ APP_VERSION }} · 数据留在本机 · 不收集任何信息</view>
    </view>

    <SystemPromptDialog
      v-model="promptDialog"
      :current="lab.systemPrompt"
      @save="onPromptSaved"
    />

    <ConfirmDialog
      v-if="dialog"
      :model-value="true"
      :title="dialog.title"
      :content="dialog.message"
      :confirm-text="dialog.confirmText"
      :cancel-text="dialog.cancelText"
      :danger="dialog.danger"
      :single="dialog.single"
      @confirm="confirmDialog"
      @cancel="dialog = null"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import SystemPromptDialog from '@/components/SystemPromptDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { APP_VERSION } from '@/config/app';
import { useSettingsStore } from '@/stores/settings';
import { useLabStore } from '@/stores/lab';
import { DIM_PRESETS, replaceWallpaperData, wallpaperUsage, type ThemeMode } from '@/utils/storage';
import {
  ACCENT_THEMES,
  accentThemePalette,
  type AccentThemeName
} from '@/utils/accentTheme';
import { STORAGE_QUOTA_CHARS, encodeFile, encodeFromSource, formatStorage } from '@/utils/photo';
import { SYSTEM_PROMPT } from '@/utils/chat';
import { playCorrectFeedback, playTapFeedback, playWrongFeedback, previewSound } from '@/utils/feedback';

const settings = useSettingsStore();
const lab = useLabStore();
/** 三档的滑块刻度沿用旧版：25 / 50 / 75，色块只是给人一眼看出浓度 */
const PRESET_SWATCH: Record<number, string> = {
  25: 'linear-gradient(135deg, rgba(255,255,255,.16), rgba(20,26,38,.22))',
  50: 'linear-gradient(135deg, rgba(20,26,38,.42), rgba(20,26,38,.58))',
  75: 'linear-gradient(135deg, rgba(14,20,30,.68), rgba(14,20,30,.86))'
};
const dimPresets = DIM_PRESETS.map((item) => ({ ...item, swatch: PRESET_SWATCH[item.value] }));
const sliderPalette = computed(() => accentThemePalette(settings.accent, settings.resolved));
const accentLabel = computed(() => ACCENT_THEMES.find((item) => item.name === settings.accent)?.label ?? '星云紫');
interface DialogState {
  kind: 'remove' | 'delete' | 'notice' | 'compact';
  wallpaperId?: string;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  single: boolean;
}
const dialog = ref<DialogState | null>(null);

/** 壁纸用的是 WebView 给 App 的本地存储配额，不是手机的磁盘空间 */
const storageText = computed(() => {
  void settings.wallpapers.length;
  const { chars } = wallpaperUsage();
  return `已用约 ${formatStorage(chars)} / 配额约 ${formatStorage(STORAGE_QUOTA_CHARS)}`;
});
const promptDialog = ref(false);

/** 系统提示词那一行：显示首行当摘要，改过就标「自定义」 */
const promptSummary = computed(() => {
  const first = (lab.systemPrompt || '').split('\n').find((line) => line.trim())?.trim() || '';
  const cut = first.length > 22 ? first.slice(0, 22) + '…' : first;
  return lab.systemPrompt && lab.systemPrompt !== SYSTEM_PROMPT ? `自定义 · ${cut}` : `默认 · ${cut}`;
});

function openPromptDialog() {
  void playTapFeedback();
  promptDialog.value = true;
}

function onPromptSaved(text: string) {
  lab.setSystemPrompt(text);
  uni.showToast({ title: '提示词已保存', icon: 'success' });
}

/** 每次回到设置页都重读一遍：从教程页返回时要刷新「已看过」 */
onShow(() => lab.init());

/** 三档主题：自动跟随系统 / 固定浅色 / 固定深色 */
const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'system', label: '自动', icon: 'auto' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' }
];

const dimState = computed(() => {
  if (settings.dimMode === 'preset') {
    const preset = DIM_PRESETS.find((item) => item.value === settings.bgDim && item.value === settings.glass);
    if (preset) return preset.label;
  }
  return '自定义';
});

function dimValue(event: { detail?: { value?: number | string } }): number | null {
  const value = Number(event?.detail?.value);
  return Number.isFinite(value) ? value : null;
}

/** 拖动只更新画面，松手才落盘，避免一次拖动触发几十次同步写存储 */
function onFogPreview(event: { detail?: { value?: number | string } }) {
  const value = dimValue(event);
  if (value !== null) settings.setBgDim(value, false);
}

function onFogCommit(event: { detail?: { value?: number | string } }) {
  const value = dimValue(event);
  if (value !== null) settings.setBgDim(value, true);
}

function onGlassPreview(event: { detail?: { value?: number | string } }) {
  const value = dimValue(event);
  if (value !== null) settings.setGlass(value, false);
}

function onGlassCommit(event: { detail?: { value?: number | string } }) {
  const value = dimValue(event);
  if (value !== null) settings.setGlass(value, true);
}

/** 雾玻璃 / 液态玻璃：只换质感，透明度刻度保持不动 */
function pickGlassMode(mode: 'fog' | 'liquid') {
  if (settings.glassMode === mode) return;
  settings.setGlassMode(mode);
  void playTapFeedback();
}

/** 玻璃质感总开关：关掉后全局去模糊 + 实色底，给低端机提速 */
function toggleGlassEffect() {
  settings.setGlassEffect(!settings.glassEffect);
  if (settings.haptic) void playTapFeedback();
}

function applyPreset(value: number) {
  settings.setDimPreset(value);
  void playTapFeedback();
}

function toggleNetwork() {
  lab.setNetwork(!lab.ai.network);
  void playTapFeedback();
  uni.showToast({ title: lab.ai.network ? '联网功能已开启' : '联网功能已关闭', icon: 'none', duration: 1200 });
}

function toggleFollowUps() {
  lab.setFollowUpsEnabled(!lab.followUpsEnabled);
  void playTapFeedback();
  uni.showToast({ title: lab.followUpsEnabled ? '追问建议已开启' : '追问建议已关闭', icon: 'none', duration: 1200 });
}

function toggleExperimental() {
  settings.setExperimental(!settings.experimental);
  void playTapFeedback();
  if (settings.experimental) uni.showToast({ title: '底部功能栏已出现', icon: 'none', duration: 1400 });
}

/** 设置里不再重复做一份扫描界面：入口统一落在「音乐」板块 */
function goMusic() {
  try {
    uni.setStorageSync('ky_v1_tab', 2);
  } catch {
    // 存不了也只是回不到上次那个板块，不影响跳转
  }
  uni.reLaunch({ url: '/pages/index/index' });
}

function pickTheme(mode: ThemeMode) {
  if (settings.mode === mode) return;
  settings.setThemeMode(mode);
  void playTapFeedback();
}

function pickAccent(name: AccentThemeName) {
  if (settings.accent === name) return;
  settings.setAccentTheme(name);
  void playTapFeedback();
}

/** 设置页的两个开关都要有手感：关了震动就没反馈，开了才震 */
function toggleHaptic() {
  settings.setHaptic(!settings.haptic);
  if (settings.haptic) void playTapFeedback();
}

/** 答题音效总开关：默认关，开的时候给一下轻触点感 */
function toggleSound() {
  settings.setSound(!settings.sound);
  if (settings.haptic) void playTapFeedback();
}

function chooseCorrect(name: string) {
  if (settings.correctSound === name) return;
  settings.setCorrectSound(name);
  if (settings.haptic) void playTapFeedback();
  void previewSound(name);
}

function chooseWrong(name: string) {
  if (settings.wrongSound === name) return;
  settings.setWrongSound(name);
  if (settings.haptic) void playTapFeedback();
  void previewSound(name);
}

/** 试听：不管总开关开没开都能听到，方便关着的时候挑声音 */
function trySound(kind: 'correct' | 'wrong') {
  void previewSound(kind === 'correct' ? settings.correctSound : settings.wrongSound);
}

function toggleAutoNext() {
  settings.setAutoNext(!settings.autoNext);
  void playTapFeedback();
}

function goBack() {
  uni.navigateBack({ delta: 1, fail: () => uni.reLaunch({ url: '/pages/index/index' }) });
}

/** 设置页自检：走与答题完全相同的震动链路，用来单独确认马达有没有工作。 */
async function tryHaptic(kind: 'correct' | 'wrong') {
  const result = await (kind === 'correct' ? playCorrectFeedback() : playWrongFeedback());
  const title =
    result === 'native' ? '已触发原生震动' : result === 'web' ? '已触发网页震动' : '没有可用的马达';
  uni.showToast({ title, icon: 'none', duration: 1200 });
}

/** 把新图或老壁纸统一压成小体积：具体档位在 utils/photo.ts */
function compressPhoto(file: File): Promise<string> {
  return encodeFile(file);
}

function fail(title: string, message: string) {
  dialog.value = { kind: 'notice', title, message, confirmText: '知道啦', cancelText: '取消', danger: false, single: true };
}

/** 配额是「应用内部」的，不是手机磁盘；一键压缩能直接腾出空间 */
function failQuota() {
  dialog.value = {
    kind: 'compact',
    title: '壁纸存不下了',
    message: '不是手机存储空间不足：是浏览器/WebView 分给这个 App 的本地存储配额（约 5 MB）用满了，壁纸图片都存在这里。点「一键压缩」把旧壁纸压小就能继续导入；也可以删掉几张不用的历史壁纸。',
    confirmText: '一键压缩',
    cancelText: '知道啦',
    danger: false,
    single: false
  };
}

function askCompact() {
  dialog.value = {
    kind: 'compact',
    title: '压缩历史壁纸',
    message: '把已存的壁纸重新压成更小的图片（画质会略降），腾出空间后就能继续导入。当前背景、每张图的名字和使用顺序都不变。',
    confirmText: '开始压缩',
    cancelText: '取消',
    danger: false,
    single: false
  };
}

async function compactWallpapers() {
  const items = settings.wallpapers;
  if (!items.length) return;
  const before = wallpaperUsage().chars;
  uni.showLoading({ title: '正在压缩…', mask: true });
  try {
    const next: Array<{ id: string; dataUrl: string }> = [];
    for (const item of items) {
      try {
        next.push({ id: item.id, dataUrl: await encodeFromSource(item.dataUrl) });
      } catch {
        // 个别老图解码不了就原样留着，别让整个整理失败
        next.push({ id: item.id, dataUrl: item.dataUrl });
      }
    }
    replaceWallpaperData(next);
    await settings.refreshWallpapers();
    uni.hideLoading();
    const saved = Math.max(0, before - wallpaperUsage().chars);
    uni.showToast({
      title: saved > 0 ? `腾出约 ${formatStorage(saved)}，可以继续导入了` : '已经是最省空间的了',
      icon: 'none',
      duration: 1800
    });
  } catch (error) {
    uni.hideLoading();
    fail('没能压缩', (error as Error).message || '换几张图片再试试');
  }
}

function pickImage() {
  // #ifdef H5 || APP-PLUS
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '-9999px';
  let used = false;
  input.addEventListener('change', async () => {
    used = true;
    const file = input.files && input.files[0];
    if (input.parentNode) input.parentNode.removeChild(input);
    if (!file) return;
    uni.showLoading({ title: '处理中…', mask: true });
    try {
      const dataUrl = await compressPhoto(file);
      // 先算明暗再套：否则换图瞬间会先铺一帧深色兜底，等判定回来才变浅
      await settings.setBackgroundWarm(dataUrl);
      uni.hideLoading();
      uni.showToast({ title: '背景已应用', icon: 'none' });
    } catch (error) {
      uni.hideLoading();
      if ((error as Error).name === 'QuotaExceededError') {
        failQuota();
        return;
      }
      fail('图片没能导入', (error as Error).message || '换一张图片再试试');
    }
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(() => {
    if (!used && input.parentNode) input.parentNode.removeChild(input);
  }, 90000);
  // #endif
}

function useDefaultBackground() {
  if (!settings.background) return;
  settings.removeBackground();
  uni.showToast({ title: '已切换默认渐变', icon: 'none' });
}

async function selectWallpaper(id: string) {
  try {
    // 首次切到「换机迁移进来、还没判过明暗」的图时会多等一次采样，
    // 已经有存档判定的图是同步命中，手感不变
    await settings.selectWallpaper(id);
    uni.showToast({ title: '壁纸已切换', icon: 'none', duration: 800 });
  } catch (error) {
    fail('没能切换壁纸', (error as Error).message || '请重新导入这张图');
  }
}

function askRemove() {
  dialog.value = {
    kind: 'remove',
    title: '停用当前背景',
    message: '会回到默认渐变，但这张图仍保留在历史壁纸里，随时可以切回来。',
    confirmText: '停用',
    cancelText: '保留',
    danger: false,
    single: false
  };
}

function askDelete(id: string) {
  dialog.value = {
    kind: 'delete',
    wallpaperId: id,
    title: '删除这张历史壁纸',
    message: '只会从本机壁纸历史中删除，不影响学习记录。如果正在使用，会回到默认渐变。',
    confirmText: '删除',
    cancelText: '取消',
    danger: true,
    single: false
  };
}

function confirmDialog() {
  const state = dialog.value;
  dialog.value = null;
  if (state?.kind === 'remove' && settings.background) {
    settings.removeBackground();
    uni.showToast({ title: '已恢复默认背景', icon: 'none' });
  } else if (state?.kind === 'delete' && state.wallpaperId) {
    void settings.deleteWallpaper(state.wallpaperId);
    uni.showToast({ title: '历史壁纸已删除', icon: 'none' });
  } else if (state?.kind === 'compact') {
    void compactWallpapers();
  }
}
</script>

<style scoped>
.setting-heading { flex: 1; min-width: 0; margin-left: 22rpx; }
.top-spacer { width: 66rpx; flex: 0 0 auto; }
.section-label { margin: 30rpx 0 14rpx 8rpx; color: var(--text-secondary); font-size: 21rpx; font-weight: 700; letter-spacing: 3rpx; }
.card { padding: 26rpx; }
.card + .card { margin-top: 4rpx; }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.card-title-wrap { flex: 1; min-width: 0; }
.card-title { font-size: 30rpx; font-weight: 700; }
.card-copy { margin-top: 8rpx; color: var(--text-secondary); font-size: 22rpx; }
.accent-current { flex: 0 0 auto; padding: 9rpx 16rpx; border-radius: 999rpx; background: var(--accent-gradient-soft); color: var(--accent-ink); font-size: 20rpx; font-weight: 750; }
.accent-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14rpx; margin-top: 24rpx; }
.accent-option { position: relative; display: flex; min-width: 0; margin: 0; padding: 10rpx 10rpx 13rpx; flex-direction: column; align-items: center; gap: 10rpx; border: 1rpx solid var(--line); border-radius: 18rpx; background: var(--surface-soft); color: var(--text-secondary); line-height: 1.2; transition: transform 140ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease; }
.accent-option:active { transform: scale(.96); }
.accent-option.active { border-color: var(--accent-ink); background: var(--accent-gradient-soft); color: var(--text); box-shadow: 0 0 0 3rpx var(--glow); }
.accent-option.active::after { content: ''; position: absolute; right: 8rpx; top: 8rpx; width: 11rpx; height: 11rpx; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3rpx rgba(255, 255, 255, .72); }
.accent-swatch { position: relative; width: 100%; height: 48rpx; overflow: hidden; border-radius: 12rpx; box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, .48), 0 5rpx 12rpx var(--shadow-dark); }
.accent-swatch-glint { position: absolute; inset: 0; background: linear-gradient(120deg, rgba(255, 255, 255, .38), transparent 44%, rgba(255, 255, 255, .10)); }
.accent-option-label { font-size: 21rpx; font-weight: 700; white-space: nowrap; }
.toggle { position: relative; flex: 0 0 auto; width: 92rpx; height: 54rpx; margin-top: 4rpx; border-radius: 999rpx; background: rgba(126, 143, 167, .34); box-shadow: inset 0 2rpx 6rpx var(--shadow-dark); transition: background 200ms ease, box-shadow 200ms ease; }
.toggle.on { background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
.toggle-knob { position: absolute; top: 5rpx; left: 5rpx; width: 44rpx; height: 44rpx; border-radius: 50%; background: #fff; box-shadow: 0 2rpx 8rpx rgba(12, 18, 30, .22); transition: transform 200ms cubic-bezier(.32, .72, .24, 1); }
.toggle.on .toggle-knob { transform: translateX(38rpx); }
.preview { position: relative; height: 300rpx; margin-top: 22rpx; border-radius: 20rpx; overflow: hidden; border: 1rpx solid var(--line); background: var(--surface-soft); }
.preview-img { width: 100%; height: 100%; display: block; }
.preview.is-empty { display: flex; align-items: center; justify-content: center; border-style: dashed; }
.preview-empty { display: flex; flex-direction: column; align-items: center; gap: 14rpx; color: var(--text-secondary); font-size: 22rpx; }
.preview-tag { position: absolute; right: 16rpx; bottom: 16rpx; padding: 6rpx 16rpx; border-radius: 30rpx; background: rgba(12, 18, 28, .55); color: #fff; font-size: 19rpx; }
.history-head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 28rpx; }
.history-title { color: var(--text); font-size: 25rpx; font-weight: 700; }
.history-count { color: var(--text-secondary); font-size: 20rpx; }
.wallpaper-scroll { width: 100%; margin-top: 14rpx; white-space: nowrap; }
.wallpaper-list { display: inline-flex; gap: 14rpx; padding: 4rpx 4rpx 14rpx; }
.wallpaper-item { position: relative; flex: 0 0 auto; width: 218rpx; height: 142rpx; overflow: hidden; border: 3rpx solid transparent; border-radius: 18rpx; background: var(--surface-soft); box-shadow: 0 6rpx 16rpx var(--shadow-dark); transition: transform 160ms ease, border-color 160ms ease; }
.wallpaper-item:active { transform: scale(.96); }
.wallpaper-item.active { border-color: var(--accent-ink); box-shadow: 0 0 0 3rpx var(--glow), 0 6rpx 16rpx var(--shadow-dark); }
.wallpaper-thumb { width: 100%; height: 100%; display: block; }
.wallpaper-shade { position: absolute; inset: 45% 0 0; pointer-events: none; background: linear-gradient(transparent, rgba(7, 12, 22, .68)); }
.wallpaper-name { position: absolute; left: 12rpx; bottom: 10rpx; color: #fff; font-size: 19rpx; font-weight: 650; text-shadow: 0 1rpx 3rpx rgba(0, 0, 0, .5); }
.wallpaper-current { position: absolute; left: 10rpx; top: 10rpx; padding: 4rpx 10rpx; border-radius: 999rpx; background: var(--accent); color: var(--accent-contrast); font-size: 16rpx; }
.wallpaper-delete { position: absolute; right: 8rpx; top: 8rpx; display: flex; align-items: center; justify-content: center; width: 38rpx; height: 38rpx; margin: 0; padding: 0; border: 0; border-radius: 50%; background: rgba(8, 13, 23, .62); color: #fff; line-height: 1; }
.wallpaper-default { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10rpx; border-style: dashed; border-color: var(--line); background: radial-gradient(circle at 25% 20%, var(--orb-1), transparent 60%), linear-gradient(145deg, var(--bg), var(--bg-deep)); color: var(--text-secondary); font-size: 20rpx; }
.wallpaper-default.active { border-color: var(--accent-ink); color: var(--accent-ink); }
.action-row { display: flex; gap: 16rpx; margin-top: 22rpx; }
.action-row .primary-button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10rpx; }
.action-row .secondary-button { flex: 0 0 190rpx; }
.haptic-row { display: flex; gap: 16rpx; margin-top: 22rpx; }
.haptic-button { display: flex; flex: 1; align-items: center; justify-content: center; height: 84rpx; margin: 0; padding: 0; border-radius: 20rpx; border: 1rpx solid rgba(var(--accent-rgb), .38); background: var(--surface-soft); color: var(--accent-ink); font-size: 24rpx; font-weight: 650; }
.haptic-button:active { transform: scale(.985); }
/* 答题音效二选一 */
.sound-group { margin-top: 26rpx; }
.sound-group-title { font-size: 25rpx; font-weight: 650; color: var(--text-primary); margin-bottom: 14rpx; }
.sound-options { display: flex; gap: 16rpx; }
.sound-option {
  display: flex; flex: 1; flex-direction: column; align-items: flex-start; justify-content: center;
  min-height: 96rpx; margin: 0; padding: 16rpx 20rpx; border-radius: 18rpx;
  border: 1rpx solid rgba(var(--accent-rgb), .38); background: var(--surface-soft);
  color: var(--text-primary); text-align: left; line-height: 1.3;
}
.sound-option:active { transform: scale(.985); }
.sound-option.chosen { border-color: var(--accent-ink); background: rgba(var(--accent-rgb), .16); box-shadow: 0 0 0 1rpx var(--accent) inset; }
.sound-option-name { font-size: 26rpx; font-weight: 650; }
.sound-option-tag { font-size: 21rpx; color: var(--text-secondary); margin-top: 6rpx; }
.sound-option.chosen .sound-option-tag { color: var(--accent-ink); }
.hint { margin-top: 18rpx; color: var(--text-secondary); font-size: 21rpx; line-height: 1.6; }
/* 玻璃质感总开关：状态标签 + 开关并排 */
.glass-head-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 16rpx; }
/* 总开关关掉后，下面的滑块 / 三档 / 两种玻璃整片置灰并禁止点击 */
.glass-body { transition: opacity 200ms ease; }
.glass-body.is-off { opacity: .4; pointer-events: none; }
.storage-row { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-top: 16rpx; padding: 12rpx 18rpx; border-radius: 16rpx; background: var(--surface-soft); }
.storage-text { flex: 1; min-width: 0; color: var(--text-secondary); font-size: 20rpx; line-height: 1.4; }
.storage-action { flex: none; margin: 0; padding: 8rpx 18rpx; border: 1rpx solid var(--line); border-radius: 999rpx; background: transparent; color: var(--accent-ink); font-size: 20rpx; font-weight: 700; line-height: 1.4; }
.storage-action::after { border: 0; }
.dim-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18rpx; }
.dim-state { flex: 0 0 auto; min-width: 86rpx; padding: 8rpx 18rpx; border-radius: 999rpx; background: var(--surface-soft); border: 1rpx solid var(--line); color: var(--accent-ink); text-align: center; font-size: 22rpx; font-weight: 750; letter-spacing: 1rpx; }
/* 三档预设：点中哪个哪个亮；手滑过滑块之后整排置灰，但仍可点回来 */
.dim-row { display: flex; gap: 12rpx; margin-top: 24rpx; transition: opacity 220ms ease, filter 220ms ease; }
.dim-row.is-custom { opacity: .42; filter: grayscale(.6); }
.dim-chip { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 10rpx; height: auto; margin: 0; padding: 14rpx 10rpx 12rpx; border-radius: 18rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--text-secondary); font-size: 21rpx; line-height: 1.2; transition: border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, transform 120ms ease; }
.dim-chip:active { transform: scale(.97); }
.dim-chip.active { border-color: var(--accent-ink); color: var(--text); box-shadow: 0 0 0 3rpx var(--glow); }
.dim-swatch { width: 100%; height: 38rpx; border-radius: 10rpx; box-shadow: inset 0 0 0 1rpx var(--line); }
.slider-block { margin-top: 20rpx; padding: 14rpx 4rpx 4rpx; border-radius: 18rpx; transition: opacity 220ms ease, filter 220ms ease; }
/* 两种玻璃质感：左边一块小样，直接看厚薄差别，比文字描述快 */
.glass-mode-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14rpx; margin-top: 24rpx; }
.glass-mode { display: flex; align-items: center; gap: 14rpx; margin: 0; padding: 12rpx 14rpx 12rpx 12rpx; border-radius: 18rpx; border: 1rpx solid var(--line); background: var(--surface-soft); text-align: left; transition: border-color 180ms ease, box-shadow 180ms ease, transform 120ms ease; }
.glass-mode:active { transform: scale(.97); }
.glass-mode.active { border-color: var(--accent-ink); box-shadow: 0 0 0 3rpx var(--glow); }
.glass-sample { flex: 0 0 auto; width: 86rpx; height: 62rpx; border-radius: 12rpx; }
/* 雾玻璃：高糊、边缘柔，像隔着一层磨砂 */
.glass-sample.is-fog {
  background: linear-gradient(135deg, rgba(255, 255, 255, .62), rgba(150, 172, 204, .46));
  border: 1rpx solid rgba(255, 255, 255, .52);
  box-shadow: inset 0 3rpx 12rpx rgba(255, 255, 255, .55), 0 4rpx 10rpx rgba(20, 30, 48, .16);
}
/* 液态玻璃：低填充、锐边、一道斜光，透出底色 */
.glass-sample.is-liquid {
  background:
    linear-gradient(122deg, rgba(255, 255, 255, .82) 0%, rgba(255, 255, 255, .10) 34%, rgba(255, 255, 255, .04) 62%, rgba(255, 255, 255, .34) 100%),
    linear-gradient(135deg, rgba(126, 196, 255, .26), rgba(186, 140, 255, .18));
  border: 1rpx solid rgba(255, 255, 255, .92);
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, .96), inset 0 -1rpx 0 rgba(255, 255, 255, .34), 0 4rpx 12rpx rgba(20, 30, 48, .14);
}
.glass-mode-copy { display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.glass-mode-name { color: var(--text); font-size: 22rpx; font-weight: 750; white-space: nowrap; }
.glass-mode-sub { color: var(--text-secondary); font-size: 17rpx; letter-spacing: .5rpx; white-space: nowrap; }
/* 预设模式下滑块只降视觉权重，手一碰就重新接管 */
.slider-block.is-preset { opacity: .56; filter: grayscale(.3); }
.slider-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12rpx; padding: 0 6rpx; }
.slider-name { color: var(--text); font-size: 24rpx; font-weight: 700; }
.slider-value { color: var(--accent-ink); font-size: 22rpx; font-weight: 750; font-variant-numeric: tabular-nums; }
.dim-scale { display: flex; align-items: center; gap: 12rpx; margin-top: 10rpx; }
.dim-edge { flex: 0 0 auto; color: var(--text-secondary); font-size: 20rpx; white-space: nowrap; }
.dim-slider { flex: 1; min-width: 0; margin: 0 6rpx; }
:deep(.uni-slider) { margin: 0; padding: 16rpx 0; }
:deep(.uni-slider-handle-wrapper) { height: 14rpx !important; border-radius: 999rpx; background: rgba(126, 143, 167, .22) !important; box-shadow: inset 0 2rpx 5rpx rgba(16, 28, 44, .16); }
:deep(.uni-slider-track) { height: 14rpx !important; border-radius: 999rpx; background: var(--accent-track) !important; }
/* 圆点不要描边：uni 的 handle 是 28px、thumb 是 22px，加 border 会撑成 32px，
   而 margin 仍按 28px 算，环心就比轨道中心偏下 2px——看起来像两个不重合的圆 */
:deep(.uni-slider-handle) { border: 0 !important; background: transparent !important; box-shadow: none !important; }
:deep(.uni-slider-thumb) { box-shadow: 0 0 0 6rpx rgba(255, 255, 255, .55), 0 5rpx 14rpx rgba(40, 48, 83, .30) !important; }
html[data-theme="dark"] :deep(.uni-slider-thumb) { box-shadow: 0 0 0 6rpx rgba(236, 243, 255, .50), 0 5rpx 14rpx rgba(0, 0, 0, .46) !important; }
.theme-row { display: flex; gap: 12rpx; margin-top: 22rpx; }
.theme-option { display: flex; flex: 1; align-items: center; justify-content: center; gap: 10rpx; height: 78rpx; margin: 0; padding: 0 8rpx; border-radius: 18rpx; border: 1rpx solid var(--line); background: var(--surface-soft); color: var(--text-secondary); line-height: 1; font-size: 23rpx; font-weight: 650; transition: border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, transform 120ms ease; }
.theme-option:active { transform: scale(.98); }
.theme-option.active { border-color: var(--accent-ink); color: var(--text); box-shadow: 0 0 0 3rpx var(--glow); }
.theme-option-label { font-size: 23rpx; }
.theme-chip { display: flex; flex: 0 0 auto; align-items: center; gap: 8rpx; padding: 10rpx 18rpx; border-radius: 999rpx; background: var(--surface-soft); border: 1rpx solid var(--line); color: var(--accent-ink); font-size: 21rpx; font-weight: 650; }
.footnote { margin-top: 46rpx; text-align: center; color: var(--text-secondary); font-size: 20rpx; opacity: .72; }

/* ── 平板：设置项两列排，不用一路滚到底 ── */
.settings-grid { display: block; }
/* ── 实验室：一行一件事，开关在右，值在右 ── */
.lab-card { padding: 6rpx 24rpx; }
.row-line {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 22rpx 2rpx;
  transition: opacity 140ms ease;
}
.row-line:active { opacity: .72; }
.row-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5rpx; }
.row-name { color: var(--text); font-size: 25rpx; font-weight: 700; }
.row-sub { color: var(--text-secondary); font-size: 20rpx; line-height: 1.5; }
.row-value {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6rpx;
  max-width: 46%;
  color: var(--text-secondary);
  font-size: 21rpx;
  font-weight: 650;
  text-align: right;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.row-arrow { display: flex; color: var(--text-secondary); opacity: .5; transform: rotate(180deg); }
.lab-divider { height: 1rpx; background: var(--line); opacity: .7; }
.lab-card .hint { padding: 4rpx 2rpx 18rpx; }

.setting-block { min-width: 0; }
/* 和首页同一套节奏：顶部外观先到，越往下越晚 70ms。
   淡入挂在玻璃卡片上而不是外面那层 setting-block：外层一旦有 transform，
   里面的 backdrop-filter 就采样不到壁纸，卡片会变成一块不透明的平板。 */
.setting-block:nth-child(1) .card { --fade-delay: 0ms; }
.setting-block:nth-child(2) .card { --fade-delay: 70ms; }
.setting-block:nth-child(3) .card { --fade-delay: 140ms; }
.setting-block:nth-child(4) .card { --fade-delay: 210ms; }
.setting-block:nth-child(5) .card { --fade-delay: 280ms; }
.setting-block:nth-child(6) .card { --fade-delay: 350ms; }
/* 用多列而不是 grid：设置项高矮差很多（自定义背景那块特别高），
   grid 会被最高的一项牵着走，右列底下空一大片；多列会自己找平衡点 */
html.is-wide .settings-grid { columns: 2; column-gap: 28rpx; }
html.is-wide .setting-block { break-inside: avoid; page-break-inside: avoid; }
html.is-tablet .page-content { max-width: 980px; }
</style>
