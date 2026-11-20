<template>
  <view class="page">
    <view class="page-content">
      <view class="top-bar">
        <button class="icon-button" aria-label="返回" @click="goBack">
          <AppIcon name="back" :size="25" />
        </button>
        <view class="guide-heading">
          <view class="top-title">本地模型部署</view>
          <view class="top-subtitle">三步配好本地模型</view>
        </view>
        <view class="top-spacer" />
      </view>

      <view class="status card glass-card fade-up">
        <view class="status-chips">
          <view class="status-chip"><AppIcon name="cpu" :size="14" /><text>已选方案：本地模型</text></view>
          <view class="status-chip is-ready">模型文件：App 内选中</view>
        </view>
        <view class="status-copy">
          照着下面三步做：先确认机型扛得住，再下载模型文件，最后在 App 里选中它。
          不用建文件夹、不用记路径——配好之后断网也能问单词。
        </view>
      </view>

      <view class="steps">
        <!-- 1 -->
        <view class="step card glass-card fade-up">
          <view class="step-head">
            <view class="step-no">1</view>
            <view class="step-title-wrap">
              <view class="step-title">先确认手机扛得住</view>
              <view class="step-sub">这一步不合格，后面都白搭</view>
            </view>
          </view>
          <view class="step-body">
            打开「设置 → 关于手机」，确认三件事：处理器是 <text class="em">arm64</text>（2018 年以后的机型基本都是）、
            系统在 <text class="em">Android 8.0</text> 以上、可用运行内存不小于 <text class="em">3GB</text>。
            4GB 内存的老机器也能跑起来，但开着背单词再叫模型，很容易被系统直接杀掉。
          </view>

          <view class="fig fig-device">
            <view class="dev">
              <view class="dev-bar" />
              <view class="dev-screen">
                <text class="dev-num">3.2</text>
                <text class="dev-unit">GB 可用</text>
                <view class="dev-bars">
                  <view class="dev-pill is-on" />
                  <view class="dev-pill is-on" />
                  <view class="dev-pill is-on" />
                  <view class="dev-pill" />
                </view>
              </view>
            </view>
            <view class="dev-notes">
              <view class="note"><text class="note-k">架构</text><text class="note-v">arm64-v8a</text><text class="note-ok">✓</text></view>
              <view class="note"><text class="note-k">系统</text><text class="note-v">Android 8.0+</text><text class="note-ok">✓</text></view>
              <view class="note"><text class="note-k">内存</text><text class="note-v">≥ 3 GB 可用</text><text class="note-ok">✓</text></view>
            </view>
          </view>
        </view>

        <!-- 2 -->
        <view class="step card glass-card fade-up">
          <view class="step-head">
            <view class="step-no">2</view>
            <view class="step-title-wrap">
              <view class="step-title">下载量化模型</view>
              <view class="step-sub">只认 .gguf，只下 Q4 量化</view>
            </view>
          </view>
          <view class="step-body">
            下面这些都是 <text class="em">Q4_K_M</text> 量化的单文件模型（.gguf），从 ModelScope 国内镜像直接下，
            复制直链用浏览器打开即可。模型越大越聪明，但占内存更多、生成更慢——按你手机的内存选一档，
            下好一个就行，不用全下。手机内存不大就选「稳」「3B」这类小档；7B/8B 会明显更慢，别硬上。
            标注「新架构」的几款（Gemma 3n、LFM2.5）如果加载失败，换回 Qwen 系列即可。
          </view>

          <view class="model-picker">
            <view
              v-for="(m, i) in models"
              :key="m.file"
              class="model-opt"
              :class="{ 'is-active': picked === i }"
              @click="picked = i"
            >
              <view class="opt-head">
                <view class="opt-radio"><view v-if="picked === i" class="opt-dot" /></view>
                <view class="opt-title-wrap">
                  <text class="opt-title">{{ m.title }}</text>
                  <text class="opt-size">{{ m.size }} · {{ m.memory }}</text>
                </view>
                <view class="opt-badge" :class="m.badgeType">{{ m.badge }}</view>
              </view>
              <view class="opt-note">{{ m.note }}</view>
            </view>
          </view>

          <view class="download-link">
            <text class="dl-label">当前选中：{{ models[picked].title }} 直链</text>
            <text class="dl-url" user-select="true">{{ models[picked].url }}</text>
            <view class="dl-actions">
              <button class="dl-copy" @click="copyLink"><AppIcon name="download" :size="16" /><text>{{ copied ? '已复制 ✓' : '复制链接' }}</text></button>
              <text class="dl-tip">复制后粘贴到浏览器下载</text>
            </view>
          </view>
        </view>

        <!-- 3 -->
        <view class="step card glass-card fade-up">
          <view class="step-head">
            <view class="step-no">3</view>
            <view class="step-title-wrap">
              <view class="step-title">在 App 里选中它</view>
              <view class="step-sub">选中后即可开启本地问答</view>
            </view>
          </view>
          <view class="step-body">
            下载好之后不用挪位置、也不用建文件夹。回到 AI 页，点「选择本地模型文件」，
            在文件管理里找到刚下载的 gguf 选中它。App 会把文件复制进内部自己管理，
            加载成功后就能断网问答，以后打开开关直接复用，不用每次都选。
          </view>

          <view class="fig fig-pick">
            <button class="pick-btn" @click="goAI">
              <AppIcon name="folder" :size="17" />
              <text>去 AI 页选模型</text>
            </button>
            <view class="pick-ready">已下好文件 · 点此直达</view>
          </view>
        </view>
      </view>

      <view class="section-label">性能预期</view>
      <view class="card glass-card fade-up perf-card">
        <view class="perf-row is-head">
          <text class="perf-c1">机型（跑推荐档 4B）</text>
          <text class="perf-c2">首字延迟</text>
          <text class="perf-c3">生成速度</text>
        </view>
        <view class="perf-row">
          <text class="perf-c1">旗舰（8 Gen 3 / 9300）</text>
          <text class="perf-c2">1.5–3 s</text>
          <text class="perf-c3">8–14 tok/s</text>
        </view>
        <view class="perf-row">
          <text class="perf-c1">中端（778G / 8100）</text>
          <text class="perf-c2">3–6 s</text>
          <text class="perf-c3">4–8 tok/s</text>
        </view>
        <view class="perf-row">
          <text class="perf-c1">4GB 内存机型</text>
          <text class="perf-c2">建议选 3B 档</text>
          <text class="perf-c3">跑 4B 易被杀</text>
        </view>
        <view class="hint">
          按推荐的 4B 档估算，实际看机型和散热。内存小就选 3B（约快一倍）；8GB 内存想要更聪明选 7B 均衡档；
          追求效果且是旗舰机可上 8B（会更慢）。现在改成边生成边显示，首字一出来就能看到字在往外冒，
          不用再干等整段生成完。一句话解释清楚一个词大约要生成 40–80 个 token，中端机等 6–12 秒属正常。
        </view>
      </view>

      <view class="section-label">四个坑</view>
      <view class="card glass-card fade-up">
        <view class="pit"><text class="pit-k">发热</text><text class="pit-v">连续问十几轮，机身会明显烫手并降频，越答越慢。放到凉快的桌面上，别捂在被子里。</text></view>
        <view class="pit"><text class="pit-k">边充边跑</text><text class="pit-v">充电本身就在发热，再叠上推理，多数机型会直接限频到一半速度。</text></view>
        <view class="pit"><text class="pit-k">答错</text><text class="pit-v">本地模型再强也代替不了词典：可能把形近词、词根混在一起。它适合「换个说法讲一遍」，关键释义仍要核对单词书。</text></view>
        <view class="pit"><text class="pit-k">换机</text><text class="pit-v">模型文件不跟着 App 走。换手机后重新下载一次，再到 AI 页选中它就行。</text></view>
      </view>

      <button class="primary-button done-button" @click="goBack">知道了，返回设置</button>
      <view class="footnote">教程随版本更新 · 模型版权归各自发布方所有</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { useLabStore } from '@/stores/lab';

const lab = useLabStore();

/** ModelScope 国内镜像直链：四档比 1.5B 强的单文件 Q4_K_M 模型，均验证可下载 */
interface ModelOption {
  title: string;
  file: string;
  size: string;
  memory: string;
  badge: string;
  badgeType: string;
  note: string;
  url: string;
}
const models: ModelOption[] = [
  {
    title: 'Qwen3-4B-Instruct-2507',
    file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    size: '2.3 GB',
    memory: '需 6GB+ 内存',
    badge: '推荐',
    badgeType: 'is-best',
    note: '2025 年新模型，中文和逻辑明显更聪明，体积适中、单文件。大多数近几年的手机都能跑，首选这个。',
    url: 'https://www.modelscope.cn/models/voconly/Qwen3-4B-Instruct-2507-Q4_K_M-GGUF/resolve/master/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  },
  {
    title: 'Qwen2.5-3B-Instruct',
    file: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    size: '1.96 GB',
    memory: '需 4GB+ 内存',
    badge: '稳',
    badgeType: 'is-stable',
    note: '阿里官方仓库，兼容性最稳、速度更快，内存小的手机选它。比老的 1.5B 强一档。',
    url: 'https://www.modelscope.cn/models/qwen/Qwen2.5-3B-Instruct-GGUF/resolve/master/qwen2.5-3b-instruct-q4_k_m.gguf',
  },
  {
    title: 'Qwen2.5-7B-Instruct',
    file: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    size: '4.7 GB',
    memory: '需 8GB+ 内存',
    badge: '均衡',
    badgeType: 'is-mid',
    note: '卡在 4B 和 8B 中间最合适的甜点档：比 4B 明显聪明，又比 8B 省内存、更快。8GB 内存的中高端机选它最稳，是大多数人的首选升级。',
    url: 'https://www.modelscope.cn/models/bullerwins/Qwen2.5-7B-Instruct-GGUF/resolve/master/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
  },
  {
    title: 'Qwen3-8B',
    file: 'Qwen3-8B-Q4_K_M.gguf',
    size: '4.68 GB',
    memory: '需 10GB+ 内存',
    badge: '旗舰',
    badgeType: 'is-pro',
    note: 'Qwen 系列里最强，接近云端小模型的效果，但要 10GB 以上内存 + 旗舰芯片，普通手机会卡或被杀后台。',
    url: 'https://www.modelscope.cn/models/qwen/Qwen3-8B-GGUF/resolve/master/Qwen3-8B-Q4_K_M.gguf',
  },
  // ── 下面这些是后来追加的其它厂商/架构的 6~8B 单文件模型，直链均已验证可下载 ──
  {
    title: 'Yi-6B（零一万物）',
    file: 'yi-6b.Q4_K_M.gguf',
    size: '3.67 GB',
    memory: '需 7GB+ 内存',
    badge: '6B',
    badgeType: 'is-mid',
    note: '零一万物的 6B 双语模型，中英文都不错，体积比 7B 小、比 4B 聪明。想要折中的可以试它。是基础模型，对话语气没那么"助手腔"。',
    url: 'https://www.modelscope.cn/models/TheBloke/Yi-6B-GGUF/resolve/master/yi-6b.Q4_K_M.gguf',
  },
  {
    title: 'OLMo-2-7B-Instruct',
    file: 'olmo-2-1124-7B-instruct-Q4_K_M.gguf',
    size: '4.47 GB',
    memory: '需 8GB+ 内存',
    badge: '7B',
    badgeType: 'is-stable',
    note: '艾伦研究所的开源模型，完全开放可商用，架构标准、兼容性好。想要一个干净的 7B 指令模型可以选它。',
    url: 'https://www.modelscope.cn/models/allenai/OLMo-2-1124-7B-Instruct-GGUF/resolve/master/olmo-2-1124-7B-instruct-Q4_K_M.gguf',
  },
  {
    title: 'DeepSeek-R1-Distill-7B',
    file: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    size: '4.68 GB',
    memory: '需 8GB+ 内存',
    badge: '推理',
    badgeType: 'is-pro',
    note: '深度求索的推理模型，擅长逻辑和数学题，回答会"想得更久"。题目类问题表现好，但生成更慢、话更多。',
    url: 'https://www.modelscope.cn/models/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/master/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
  },
  {
    title: 'Gemma 3n E4B',
    file: 'gemma-3n-E4B-it-Q4_K_M.gguf',
    size: '4.54 GB',
    memory: '需 8GB+ 内存',
    badge: '谷歌',
    badgeType: 'is-mid',
    note: '谷歌 Gemma 3n 系列，主打"小身材大能力"，多语言不错。架构较新，个别旧版引擎可能加载失败，失败就换回 Qwen 档。',
    url: 'https://www.modelscope.cn/models/unsloth/gemma-3n-E4B-it-GGUF/resolve/master/gemma-3n-E4B-it-Q4_K_M.gguf',
  },
  {
    title: 'MiniCPM4-8B（面壁）',
    file: 'MiniCPM4-8B-Q4_K_M.gguf',
    size: '4.97 GB',
    memory: '需 9GB+ 内存',
    badge: '8B',
    badgeType: 'is-pro',
    note: '面壁智能的新一代 MiniCPM4 纯文本 8B，中文扎实、端侧优化好。内存够的旗舰机可以试，速度会偏慢。',
    url: 'https://www.modelscope.cn/models/openbmb/MiniCPM4-8B-GGUF/resolve/master/MiniCPM4-8B-Q4_K_M.gguf',
  },
  {
    title: 'LFM2.5-8B-A1B',
    file: 'LFM2.5-8B-A1B-Q4_K_M.gguf',
    size: '5.16 GB',
    memory: '需 10GB+ 内存',
    badge: '混合',
    badgeType: 'is-pro',
    note: 'Liquid AI 的快慢混合架构模型（A1B 指激活参数少），理论响应快。架构很新，旧版引擎可能加载失败，失败就换回 Qwen 档。',
    url: 'https://www.modelscope.cn/models/LiquidAI/LFM2.5-8B-A1B-GGUF/resolve/master/LFM2.5-8B-A1B-Q4_K_M.gguf',
  },
];
/** 默认选中推荐档 */
const picked = ref(0);
const copied = ref(false);

function copyLink() {
  const url = models[picked.value].url;
  // 先尝试系统剪贴板；H5 调试或失败时用隐藏 textarea + execCommand 兜底
  const write = (text: string) => {
    try {
      if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch {
      // 兜底失败也不影响主路径
    }
  };
  // #ifdef APP-PLUS
  uni.setClipboardData({ data: url, success: () => showCopied() });
  // #endif
  // #ifndef APP-PLUS
  write(url);
  showCopied();
  // #endif
}

function showCopied() {
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

onMounted(() => {
  lab.init();
  // 进过一次教程就算读过，设置页据此把「先看教程」的提示收起来
  lab.markGuideRead();
});

function goBack() {
  uni.navigateBack({ delta: 1, fail: () => uni.reLaunch({ url: '/pages/settings/settings' }) });
}

/** 第 4 步：直接回到首页的 AI 面板，用户在那里的模型列表里选刚放好的 gguf */
function goAI() {
  try { uni.setStorageSync('ky_v1_tab', 1); } catch { /* 忽略 */ }
  uni.reLaunch({ url: '/pages/index/index' });
}
</script>

<style scoped>
.guide-heading { flex: 1; min-width: 0; margin-left: 22rpx; }
.top-spacer { width: 66rpx; flex: 0 0 auto; }
.card { padding: 26rpx; }
.section-label { margin: 34rpx 0 14rpx 8rpx; color: var(--text-secondary); font-size: 21rpx; font-weight: 700; letter-spacing: 3rpx; }

.status { padding: 22rpx 24rpx; }
.status-chips { display: flex; flex-wrap: wrap; gap: 10rpx; }
.status-chip { display: inline-flex; align-items: center; gap: 8rpx; padding: 7rpx 16rpx; border-radius: 999rpx; background: rgba(var(--accent-rgb), .14); color: var(--accent-ink); font-size: 20rpx; font-weight: 700; }
.status-chip.is-pending { background: rgba(126, 143, 167, .18); color: var(--text-secondary); }
.status-chip.is-ready { background: rgba(58, 166, 117, .16); color: #3aa675; }
.status-copy { margin-top: 14rpx; color: var(--text-secondary); font-size: 21rpx; line-height: 1.65; }

.steps { display: flex; flex-direction: column; gap: 18rpx; margin-top: 18rpx; }
.step { padding: 26rpx 26rpx 22rpx; }
.step-head { display: flex; align-items: flex-start; gap: 16rpx; }
.step-no { flex: none; width: 52rpx; height: 52rpx; display: flex; align-items: center; justify-content: center; border-radius: 16rpx; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); font-size: 24rpx; font-weight: 800; }
.step-title-wrap { flex: 1; min-width: 0; padding-top: 2rpx; }
.step-title { color: var(--text); font-size: 29rpx; font-weight: 760; }
.step-sub { margin-top: 5rpx; color: var(--text-secondary); font-size: 20rpx; letter-spacing: .5rpx; }
.step-body { margin-top: 16rpx; color: var(--text-secondary); font-size: 22rpx; line-height: 1.72; }
.em { color: var(--text); font-weight: 700; }

/* 每步一张示意图：纯 CSS 画，不依赖图片资源，深色浅色都跟着主题走 */
.fig { margin-top: 20rpx; padding: 20rpx; border-radius: 20rpx; border: 1rpx solid var(--line); background: var(--surface-soft); }
.fig-device { display: flex; align-items: center; gap: 22rpx; }
.dev { flex: none; width: 118rpx; padding: 10rpx 10rpx 12rpx; border-radius: 16rpx; border: 2rpx solid var(--line); background: var(--surface); }
.dev-bar { width: 34rpx; height: 5rpx; margin: 0 auto 8rpx; border-radius: 999rpx; background: var(--line); }
.dev-screen { display: flex; flex-direction: column; align-items: center; gap: 2rpx; }
.dev-num { color: var(--accent-ink); font-size: 30rpx; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.dev-unit { color: var(--text-secondary); font-size: 15rpx; }
.dev-bars { display: flex; flex-direction: column; gap: 4rpx; width: 100%; margin-top: 10rpx; }
.dev-pill { height: 6rpx; border-radius: 999rpx; background: var(--line); }
.dev-pill.is-on { background: linear-gradient(90deg, var(--accent), var(--accent-2)); }
.dev-notes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10rpx; }
.note { display: flex; align-items: center; gap: 10rpx; padding: 9rpx 14rpx; border-radius: 12rpx; background: var(--surface); border: 1rpx solid var(--line); }
.note-k { flex: 0 0 52rpx; color: var(--text-secondary); font-size: 18rpx; }
.note-v { flex: 1; color: var(--text); font-size: 20rpx; font-weight: 650; }
.note-ok { color: #3aa675; font-size: 20rpx; font-weight: 800; }

/* 第二步：三档模型单选 */
.model-picker { display: flex; flex-direction: column; gap: 12rpx; }
.model-opt { padding: 18rpx 18rpx 16rpx; border-radius: 18rpx; border: 2rpx solid var(--line); background: var(--surface); transition: border-color 160ms ease, background 160ms ease; }
.model-opt.is-active { border-color: var(--accent-ink); background: rgba(var(--accent-rgb), .08); }
.opt-head { display: flex; align-items: center; gap: 14rpx; }
.opt-radio { flex: none; width: 34rpx; height: 34rpx; border-radius: 50%; border: 3rpx solid var(--line); display: flex; align-items: center; justify-content: center; }
.model-opt.is-active .opt-radio { border-color: var(--accent-ink); }
.opt-dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: var(--accent); }
.opt-title-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3rpx; }
.opt-title { color: var(--text); font-size: 22rpx; font-weight: 750; word-break: break-all; }
.opt-size { color: var(--text-secondary); font-size: 18rpx; }
.opt-badge { flex: none; padding: 4rpx 12rpx; border-radius: 999rpx; font-size: 17rpx; font-weight: 750; }
.opt-badge.is-best { background: rgba(58, 166, 117, .16); color: #3aa675; }
.opt-badge.is-mid { background: rgba(var(--accent-rgb), .16); color: var(--accent-ink); }
.opt-badge.is-stable { background: rgba(126, 143, 167, .18); color: var(--text-secondary); }
.opt-badge.is-pro { background: rgba(224, 135, 60, .16); color: #d98332; }
.opt-note { margin-top: 12rpx; color: var(--text-secondary); font-size: 19rpx; line-height: 1.6; }

/* 第二步：可复制的下载直链 */
.download-link { margin-top: 14rpx; padding: 16rpx 18rpx; border-radius: 16rpx; border: 1rpx solid var(--line); background: var(--surface); display: flex; flex-direction: column; gap: 12rpx; }
.dl-label { color: var(--text-secondary); font-size: 19rpx; font-weight: 650; }
.dl-url { padding: 14rpx 16rpx; border-radius: 12rpx; background: var(--surface-soft); color: var(--accent-ink); font-size: 17rpx; line-height: 1.55; font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
.dl-actions { display: flex; align-items: center; gap: 16rpx; flex-wrap: wrap; }
.dl-copy { display: inline-flex; align-items: center; gap: 8rpx; margin: 0; padding: 14rpx 26rpx; border-radius: 12rpx; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--accent-contrast); font-size: 20rpx; font-weight: 750; line-height: 1.4; border: 0; }
.dl-copy::after { border: 0; }
.dl-tip { color: var(--text-secondary); font-size: 18rpx; }

/* 第三步：去 AI 页选文件 */
.fig-pick { display: flex; align-items: center; gap: 16rpx; }
.pick-btn { display: flex; align-items: center; justify-content: center; gap: 10rpx; margin: 0; padding: 16rpx 24rpx; border-radius: 16rpx; border: 1rpx dashed var(--accent); background: var(--surface); color: var(--accent-ink); font-size: 21rpx; font-weight: 700; line-height: 1.4; }
.pick-btn::after { border: 0; }
.pick-ready { padding: 5rpx 14rpx; border-radius: 999rpx; background: rgba(58, 166, 117, .14); color: #3aa675; font-size: 17rpx; font-weight: 750; letter-spacing: .5rpx; }

.perf-card { padding: 20rpx 22rpx 24rpx; }
.perf-row { display: flex; align-items: center; gap: 12rpx; padding: 11rpx 0; border-bottom: 1rpx solid var(--line); font-size: 21rpx; }
.perf-row:last-of-type { border-bottom: 0; }
.perf-row.is-head { color: var(--text-secondary); font-size: 18rpx; font-weight: 700; letter-spacing: 1rpx; }
.perf-c1 { flex: 1.35; min-width: 0; color: var(--text); }
.perf-c2, .perf-c3 { flex: 1; text-align: right; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.perf-row.is-head .perf-c1, .perf-row.is-head .perf-c2, .perf-row.is-head .perf-c3 { color: var(--text-secondary); }
.hint { margin-top: 14rpx; color: var(--text-secondary); font-size: 19rpx; line-height: 1.65; opacity: .88; }

.pit { display: flex; gap: 14rpx; padding: 13rpx 0; border-bottom: 1rpx solid var(--line); }
.pit:last-child { border-bottom: 0; }
.pit-k { flex: 0 0 88rpx; color: var(--text); font-size: 21rpx; font-weight: 700; }
.pit-v { flex: 1; color: var(--text-secondary); font-size: 21rpx; line-height: 1.62; }

.done-button { width: 100%; margin-top: 30rpx; }
.footnote { margin: 26rpx 0 12rpx; text-align: center; color: var(--text-secondary); font-size: 19rpx; opacity: .7; }

/* 教程是顺序阅读，平板上也不分栏：分栏会把 1、2 排左边、3、4 排右边，顺序就乱了 */
html.is-tablet .page-content { max-width: 980px; }
html.is-wide .fig { padding: 22rpx; }
/* 模型选项不是顺序步骤，平板上两列并排，少滚一屏 */
html.is-wide .model-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14rpx; }
html.is-wide .model-picker > * { min-width: 0; }
</style>
