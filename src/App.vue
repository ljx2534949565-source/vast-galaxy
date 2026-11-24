<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { useSettingsStore } from '@/stores/settings';
import { useProgressStore } from '@/stores/progress';
import { useLayout } from '@/composables/useLayout';
import { useContentBounce } from '@/composables/useContentBounce';
import { useKeyboard } from '@/composables/useKeyboard';

// 尽早量一次屏幕：平板/手机的分支必须在首屏渲染前挂到 <html> 上，
// 否则会先按手机版画一帧，再跳成平板版
useLayout();

onLaunch(() => {
  useSettingsStore().init();
  useProgressStore().init();
  // 键盘高度通道：原生读 IME inset，H5 用 visualViewport，都写到 html 上供 CSS 用
  useKeyboard();
  // #ifdef H5
  // 原生壳已经关掉 WebView 自带的过度滚动，这里只让内容层跟着手指走，壁纸不动
  useContentBounce();
  // #endif
});

// 深色模式跟随系统：从后台回来时重新读一次系统外观，
// 覆盖「在后台期间系统切换了明暗、WebView 没收到 change 事件」的情况
onShow(() => {
  useSettingsStore().refreshTheme();
});
</script>

<style>
:root {
  /* 软键盘高度（CSS px）：原生读 IME inset、H5 读 visualViewport 写入。
     默认 0，键盘收起时所有 fixed 元素回到原位 */
  --keyboard-height: 0px;
  --bg: #e8eef7;
  --bg-deep: #d8e3f1;
  --surface: rgba(255, 255, 255, 0.58);
  --surface-strong: rgba(255, 255, 255, 0.82);
  --surface-soft: rgba(255, 255, 255, 0.34);
  --text: #162438;
  --text-secondary: #52647a;
  --line: rgba(255, 255, 255, 0.64);
  --accent: #5d62d9;
  --accent-ink: #5d62d9;
  --accent-2: #8e72db;
  --accent-3: #5bbecf;
  --accent-rgb: 93, 98, 217;
  --accent-2-rgb: 142, 114, 219;
  --accent-3-rgb: 91, 190, 207;
  --accent-gradient: linear-gradient(135deg, var(--accent), var(--accent-2));
  --accent-gradient-soft: linear-gradient(135deg, rgba(var(--accent-rgb), .22), rgba(var(--accent-2-rgb), .16));
  --accent-track: linear-gradient(90deg, var(--accent-3), var(--accent) 62%, var(--accent-2));
  --accent-contrast: #ffffff;
  --success: #16885f;
  --danger: #d74c64;
  --warning: #b77822;
  --shadow-dark: rgba(88, 109, 137, 0.20);
  --shadow-light: rgba(255, 255, 255, 0.85);
  --glow: rgba(104, 103, 224, 0.24);
  --glass-tint: rgba(255, 255, 255, 0.40);
  --glass-tint-2: rgba(255, 255, 255, 0.08);
  --glass-edge: rgba(255, 255, 255, 0.72);
  --glass-sheen: rgba(255, 255, 255, 0.92);
  --glass-refract: rgba(186, 210, 246, 0.46);
  /* 长列表底板（看单词的词表）没有毛玻璃，用这层白/黑再压一遍保证可读 */
  --sheet-wash: rgba(255, 255, 255, 0.44);
  --sheet-line: rgba(120, 138, 165, 0.28);
  /* 玻璃的两个可调参数：模糊半径由「控件玻璃」滑块实时改写，饱和/亮度随质感切换 */
  --glass-blur: 16px;
  --glass-blur-strong: 29px;
  --glass-sat: 190%;
  --glass-bright: 100%;
  --dialog-mask: rgba(9, 16, 28, .38);
  --dialog-fill: rgba(255, 255, 255, .97);
  --dialog-fill-2: rgba(246, 250, 255, .93);
  --orb-1: rgba(124, 120, 240, 0.46);
  --orb-2: rgba(84, 190, 214, 0.34);
  --orb-3: rgba(196, 138, 232, 0.30);
  /* AI 页固定顶栏的背板：往下渐隐，气泡从下面滚过去时被磨砂压住，标题始终清楚 */
  /* AI 顶栏（v3.6.3 起开放式）：静止时完全透明，滚动后才淡入一层纯色渐变。
     不能有 backdrop-filter：模糊区域是矩形，mask 又不裁剪它，必然出现一条硬边。 */
  --head-glow: rgba(255, 255, 255, 0.72);
  --head-veil: linear-gradient(to bottom, rgba(233, 240, 250, 0.92) 0%, rgba(233, 240, 250, 0.9) 45%, rgba(233, 240, 250, 0.7) 62%, rgba(233, 240, 250, 0.28) 82%, rgba(233, 240, 250, 0) 100%);
}
/* 液态玻璃：更薄、更亮、边缘更锐，照片能清楚地透上来 */
html.glass-liquid {
  --glass-tint: rgba(255, 255, 255, 0.15);
  --glass-tint-2: rgba(255, 255, 255, 0.02);
  --glass-edge: rgba(255, 255, 255, 0.94);
  --glass-sheen: rgba(255, 255, 255, 0.99);
  --glass-refract: rgba(198, 224, 255, 0.36);
  --line: rgba(255, 255, 255, 0.80);
}
html.glass-liquid[data-theme="dark"] {
  --glass-tint: rgba(58, 78, 106, 0.26);
  --glass-tint-2: rgba(22, 34, 52, 0.08);
  --glass-edge: rgba(214, 234, 255, 0.40);
  --glass-sheen: rgba(236, 246, 255, 0.44);
  --glass-refract: rgba(130, 176, 230, 0.28);
  --line: rgba(206, 228, 252, 0.26);
}
html.glass-liquid.has-photo.photo-dark {
  --glass-tint: rgba(46, 66, 92, 0.24);
  --glass-tint-2: rgba(16, 26, 40, 0.06);
  --glass-edge: rgba(226, 241, 255, 0.42);
  --glass-sheen: rgba(240, 248, 255, 0.46);
  --glass-refract: rgba(138, 182, 232, 0.26);
  --line: rgba(216, 234, 255, 0.26);
}
html[data-theme="dark"] {
  --bg: #0e1520;
  --bg-deep: #111d2c;
  --surface: rgba(29, 43, 61, 0.62);
  --surface-strong: rgba(35, 50, 70, 0.88);
  --surface-soft: rgba(45, 61, 82, 0.34);
  --text: #f2f5fb;
  --text-secondary: #b2bfd1;
  --line: rgba(170, 194, 224, 0.16);
  --accent: #9a9df7;
  --accent-ink: #9a9df7;
  --accent-2: #b08deb;
  --accent-3: #77d6df;
  --accent-rgb: 154, 157, 247;
  --accent-2-rgb: 176, 141, 235;
  --accent-3-rgb: 119, 214, 223;
  --accent-contrast: #111827;
  --success: #65d8ad;
  --danger: #ff8295;
  --warning: #efbd6b;
  --shadow-dark: rgba(0, 0, 0, 0.34);
  --shadow-light: rgba(138, 169, 206, 0.08);
  --glow: rgba(139, 135, 245, 0.24);
  --glass-tint: rgba(46, 63, 88, 0.48);
  --glass-tint-2: rgba(20, 30, 46, 0.26);
  --glass-edge: rgba(186, 208, 238, 0.26);
  --glass-sheen: rgba(205, 226, 250, 0.30);
  --sheet-wash: rgba(12, 20, 31, 0.46);
  --sheet-line: rgba(170, 194, 224, 0.16);
  --glass-refract: rgba(110, 150, 200, 0.18);
  --dialog-mask: rgba(4, 9, 17, .60);
  --dialog-fill: rgba(36, 51, 71, .94);
  --dialog-fill-2: rgba(27, 40, 57, .90);
  --orb-1: rgba(104, 98, 232, 0.34);
  --orb-2: rgba(46, 150, 178, 0.26);
  --orb-3: rgba(140, 92, 196, 0.24);
  --head-glow: rgba(0, 0, 0, 0.55);
  --head-veil: linear-gradient(to bottom, rgba(12, 20, 32, 0.94) 0%, rgba(12, 20, 32, 0.92) 45%, rgba(12, 20, 32, 0.72) 62%, rgba(12, 20, 32, 0.3) 82%, rgba(12, 20, 32, 0) 100%);
}
/* 壁纸本身偏暗时，即便系统是浅色主题也改用浅字 + 烟熏玻璃；
   否则滑块拉到「极透」后，深色照片上的深字会糊成一片 */
html.has-photo.photo-dark {
  --text: #f5f8ff;
  --text-secondary: rgba(218, 230, 245, 0.82);
  --line: rgba(208, 228, 250, 0.22);
  --success: #72e0b4;
  --danger: #ff9aab;
  --warning: #f0c47b;
  --shadow-dark: rgba(0, 0, 0, 0.38);
  --shadow-light: rgba(176, 202, 232, 0.09);
  --glow: rgba(141, 150, 246, 0.24);
  --glass-edge: rgba(212, 231, 252, 0.34);
  --glass-sheen: rgba(225, 239, 255, 0.34);
  /* 题卡和选项自带一层玻璃渐变（study / quiz 的 prompt、option），它们吃的是
     --glass-tint 而不是 --surface。深色壁纸下必须一起换成烟熏底，否则浅色主题 +
     深色照片时这两页的卡片仍是白色 40%，比周围亮一整档（v5.6.2）。
     液态玻璃有自己的更透一档取值，特异性更高，不会被这里覆盖。 */
  --glass-tint: rgba(24, 36, 54, 0.46);
  --glass-tint-2: rgba(12, 20, 32, 0.24);
  --sheet-wash: rgba(12, 20, 31, 0.48);
  --sheet-line: rgba(200, 222, 248, 0.18);
  --glass-refract: rgba(126, 162, 205, 0.20);
  /* 深色壁纸下同样是浅字，顶栏那层渐隐背板必须一起转深。
     否则浅色主题 + 深色壁纸时，AI 页顶部会顶着一条白色渐变（v5.6.3 修）。 */
  --head-glow: rgba(0, 0, 0, 0.55);
  --head-veil: linear-gradient(to bottom, rgba(12, 20, 32, 0.94) 0%, rgba(12, 20, 32, 0.92) 45%, rgba(12, 20, 32, 0.72) 62%, rgba(12, 20, 32, 0.3) 82%, rgba(12, 20, 32, 0) 100%);
  /* 深色壁纸 + 浅色主题：弹窗与底栏别再拿白色实底，否则浅字全糊在白底上。
     JS 的 applyBackground() 会按玻璃浓度再覆盖一次，这里只做首帧兜底 */
  --dialog-fill: rgba(20, 32, 48, .86);
  --dialog-fill-2: rgba(16, 27, 43, .74);
}
page, body {
  min-height: 100%;
  margin: 0;
  /* 关掉浏览器自身的边缘回弹/下拉刷新，只留我们自己给内容做的橡皮筋 */
  overscroll-behavior-y: none;
  color: var(--text);
  background: var(--bg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
body {
  overflow-x: hidden;
  background:
    radial-gradient(circle at 12% 4%, var(--glow), transparent 36%),
    linear-gradient(145deg, var(--bg), var(--bg-deep));
}
view, text, button, input, textarea, scroll-view { box-sizing: border-box; }
button { font: inherit; color: inherit; }
button::after { border: 0; }
.page {
  position: relative;
  min-height: 100vh;
  /* 上下左右的内边距拆成变量：转场时页面会被锁成一屏、padding 归零，
     3D 面板要靠这两个值把内容摆回原来的位置（见 index.vue 的 is-turning） */
  --pad-x: 28rpx;
  --pad-t: calc(28rpx + max(var(--inset-top, 0px), env(safe-area-inset-top, 0px)));
  padding: var(--pad-t) var(--pad-x) calc(42rpx + max(var(--inset-bottom, 0px), env(safe-area-inset-bottom, 0px)));
  /* 只是不想让装饰层横向出血：用 clip 而不是 hidden。
     hidden 会把 .page 变成可滚动容器，浏览器点屏幕外按钮时会偷偷 scrollTop，
     页面就整体上移半屏（v2.7.0 起彻底断掉这条路） */
  overflow: hidden;
  overflow: clip;
  background:
    radial-gradient(circle at 12% 4%, var(--glow), transparent 36%),
    radial-gradient(circle at 92% 32%, rgba(93, 178, 197, 0.14), transparent 32%),
    linear-gradient(145deg, var(--bg), var(--bg-deep));
}
.page::before {
  content: '';
  position: absolute;
  /* 左右不要出血：横向多出 10% 会让 .page 变成可横向滚动的容器，
     点选项时浏览器一 scrollIntoView 就把整页推偏 30 多像素（v2.3.2 修） */
  inset: -10% 0 auto 0;
  height: 120vh;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(30% 22% at 14% 16%, var(--orb-1), transparent 72%),
    radial-gradient(26% 18% at 88% 34%, var(--orb-2), transparent 74%),
    radial-gradient(34% 22% at 46% 78%, var(--orb-3), transparent 76%);
  filter: blur(18rpx);
}
.page-content { width: 100%; max-width: 760px; margin: 0 auto; }
/* 平板：容器放宽，但内容不会一路铺到 12 寸平板的边缘 */
html.is-tablet .page-content { max-width: 1080px; }
html.is-tablet.is-wide .page-content { max-width: 1180px; }
html.is-tablet .page { --pad-x: 40rpx; }
html.is-wide .top-bar { margin-bottom: 28rpx; }
/* 自定义背景直接画在 html 根元素的画布背景上，不再使用 fixed 伪元素。
   v3.5.0 的 body::before/::after + z-index:-1 能修滚动后的深色遮罩，但真机
   冷启动后首次滚动仍可能把负层级合成层短暂提到内容上方，整屏白闪一下。
   根背景永远位于所有内容之下，从结构上杜绝这层白雾盖到卡片前面；
   fixed 只负责让照片不随滚动移动，诊断实验中根背景方案同样覆盖整页。 */
html.has-photo {
  /* 图片尚未合成时也只露深色中性，不露浅色窗口底色 */
  background-color: #16202d;
  background-image:
    linear-gradient(163deg, var(--photo-a), var(--photo-b) 82%),
    var(--bg-photo);
  background-position: center center, center center;
  background-repeat: no-repeat, no-repeat;
  background-size: cover, cover;
  background-attachment: fixed, fixed;
}
html.has-photo.photo-dark { background-color: #0b121c; }
/* 已知浅照片：图片解码前先露浅色兜底，深/浅照片都不会被反色闪一下 */
html.has-photo.photo-light { background-color: var(--bg); }
html.has-photo body { background: transparent; }
html.has-photo uni-page-body { background: transparent !important; }
html.has-photo .page { background: transparent; }
html.has-photo .page::before { opacity: .45; }
.top-bar { display: flex; align-items: center; justify-content: space-between; min-height: 88rpx; margin-bottom: 24rpx; }
.top-title { font-size: 36rpx; font-weight: 750; letter-spacing: 1rpx; }
.top-subtitle { margin-top: 6rpx; color: var(--text-secondary); font-size: 23rpx; }
/* 连通状态要一眼可辨：通了给绿，没连上给红，未验证保持灰 */
html.light .top-subtitle.is-ok, html:not(.dark) .top-subtitle.is-ok { color: #2f9c96; }
html.dark .top-subtitle.is-ok { color: #6fd3cd; }
html.light .top-subtitle.is-alert, html:not(.dark) .top-subtitle.is-alert { color: #c85b6e; }
html.dark .top-subtitle.is-alert { color: #ef8b9d; }
.glass-card {
  background: var(--surface);
  border: 1rpx solid var(--line);
  border-radius: 24rpx;
  box-shadow: 10rpx 14rpx 34rpx var(--shadow-dark), -6rpx -6rpx 20rpx var(--shadow-light), inset 0 1rpx 0 var(--line);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright));
}
/* 液态玻璃额外压一层斜向高光，卡片像一块有厚度的透明玻璃而不是磨砂纸。
   首页的 Epic / Astra 是自带深色渐变的「海报卡」，不吃这层高光：否则浅色模式下
   白色高光会盖掉它们的深色渐变，变成浅底配浅字、完全看不清。排除后这两张卡在
   明暗两种模式下都保持组件自己的深色外观，一致不变。 */
html.glass-liquid .glass-card:not(.theme-epic):not(.theme-astra) {
  background-image: linear-gradient(135deg, rgba(255, 255, 255, .30), rgba(255, 255, 255, .04) 46%, rgba(255, 255, 255, .12));
  border-color: var(--glass-edge);
  box-shadow: 10rpx 14rpx 34rpx var(--shadow-dark), inset 0 1rpx 0 var(--glass-sheen), inset 0 -1rpx 0 rgba(255, 255, 255, .16);
}
/* 深色 / 深照片上那层斜光要收着点，否则卡片会发灰 */
html.glass-liquid[data-theme="dark"] .glass-card:not(.theme-epic):not(.theme-astra),
html.glass-liquid.has-photo.photo-dark .glass-card:not(.theme-epic):not(.theme-astra) {
  background-image: linear-gradient(135deg, rgba(255, 255, 255, .14), rgba(255, 255, 255, .02) 46%, rgba(255, 255, 255, .06));
}
/* ── 底栏 / 弹窗的液态玻璃与暗色覆盖（v3.5.3 从各组件 scoped 样式迁来）────
   组件 scoped 样式里写 :global(html.xxx) .nav-pill 会被编译器丢掉后半截
   选择器，变成直接给 html 根元素刷背景，把根背景壁纸整个盖掉。
   App.vue 的 style 本来就是全局的，写普通选择器即可，无需 :global。 */
html.glass-liquid .nav {
  background-image: linear-gradient(135deg, rgba(255, 255, 255, .22), rgba(255, 255, 255, .03) 46%, rgba(255, 255, 255, .10));
  border-color: var(--glass-edge);
}
html.glass-liquid .nav-pill {
  background: linear-gradient(135deg, rgba(255, 255, 255, .52), rgba(var(--accent-rgb), .22) 46%, rgba(255, 255, 255, .32));
  border-color: rgba(255, 255, 255, .94);
  box-shadow:
    inset 0 1rpx 0 #fff,
    inset 0 -1rpx 0 rgba(100, 110, 170, .22),
    0 12rpx 28rpx -10rpx var(--shadow-dark);
}
html[data-theme="dark"] .nav-pill,
html.has-photo.photo-dark .nav-pill {
  background: linear-gradient(135deg, rgba(160, 190, 230, .22), rgba(120, 150, 200, .05) 46%, rgba(160, 190, 230, .12));
}
html.glass-liquid[data-theme="dark"] .nav-pill,
html.glass-liquid.has-photo.photo-dark .nav-pill {
  background: linear-gradient(135deg, rgba(255, 255, 255, .20), rgba(255, 255, 255, .03) 46%, rgba(255, 255, 255, .08));
}
html.glass-liquid .dialog,
html.glass-liquid .ai-panel {
  border-color: var(--glass-edge);
  box-shadow: 0 34rpx 70rpx -30rpx var(--shadow-dark), inset 0 2rpx 0 var(--glass-sheen), inset 0 -1rpx 0 rgba(255, 255, 255, .16);
}
.icon-button, .primary-button, .secondary-button, .choice-button, .grade-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  border: 1rpx solid var(--line);
  overflow: hidden;
  cursor: pointer;
  transition: transform 120ms ease, filter 120ms ease;
  -webkit-tap-highlight-color: transparent;
}
.icon-button::before, .primary-button::before, .secondary-button::before, .choice-button::before, .grade-button::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(145deg, rgba(255,255,255,.22), transparent 45%);
}
.icon-button:active, .primary-button:active, .secondary-button:active, .choice-button:active, .grade-button:active { transform: scale(.96); }
.icon-button { width: 76rpx; height: 76rpx; padding: 0; border-radius: 23rpx; background: var(--surface); box-shadow: 5rpx 7rpx 16rpx var(--shadow-dark), -3rpx -3rpx 10rpx var(--shadow-light); }
.primary-button { min-height: 92rpx; padding: 0 32rpx; border-radius: 24rpx; background: var(--accent-gradient); color: var(--accent-contrast); font-weight: 700; box-shadow: 8rpx 12rpx 24rpx var(--glow), inset 0 1rpx 0 rgba(255,255,255,.32); }
html[data-theme="dark"] .primary-button { color: var(--accent-contrast); }
.secondary-button { min-height: 84rpx; padding: 0 26rpx; border-radius: 22rpx; background: var(--surface-strong); font-weight: 650; }
.primary-button[disabled], .secondary-button[disabled] { opacity: .45; }
.serif { font-family: Georgia, "Times New Roman", Times, serif; }
.section-title { margin: 38rpx 0 20rpx; font-size: 30rpx; font-weight: 750; }
.muted { color: var(--text-secondary); }
.row { display: flex; align-items: center; }
.safe-bottom { padding-bottom: max(var(--inset-bottom, 0px), env(safe-area-inset-bottom, 0px)); }
/* ── 软键盘态（v3.5.0 起，v3.5.1 重做滚动模型）────────────────────
   原生是 adjustNothing：WebView 布局视口一动不动，键盘只盖在下半屏。
   v3.5.0 只把输入条抬到键盘上沿，但真机反馈「上滑时输入条跟聊天气泡一起走、
   下滑却不动」：安卓 WebView 在软键盘显示时会把 position:fixed 元素挂到被
   pan 的 visual viewport 上，只要 window 一滚，fixed 元素就跟着平移。
   v3.5.1 换成 IM 的标准做法：**键盘态锁死 window 滚动**，聊天改由
   .page-content 这个内部容器自己滚；输入条仍 fixed 相对视口，没有 window
   滚动就没有任何东西能带着它漂。弹窗是 fixed 且不在这个容器里，不受影响。
   --keyboard-height 由原生 IME inset / H5 visualViewport 实时写入。 */
html.keyboard-open .nav-layer {
  opacity: 0;
  pointer-events: none;
}
html.keyboard-open .composer {
  /* 底栏已让位，不再需要那 152rpx 的偏移，直接贴住键盘上沿 */
  bottom: calc(var(--keyboard-height, 0px) + 14rpx);
}
/* ---- 以下「锁窗」只在 html.keyboard-chat 时生效 ----
   由 useKeyboard.ts 判断：只有 AI 聊天输入条可见才加这个类。
   设置页的 AI 配置弹窗、单词页备份输入框也会弹键盘，但走的是下面的
   keyboard-open 通用规则，不该被压成一屏。 */
html.keyboard-chat,
html.keyboard-chat body { overflow: hidden; }
html.keyboard-chat body {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
}
html.keyboard-chat uni-page-body,
html.keyboard-chat uni-page { overflow: hidden; }
html.keyboard-chat .page {
  display: flex;
  flex-direction: column;
  /* 键盘盖住下半屏，聊天可视区只有「一屏减键盘高度」这一段。
     不扣掉的话，气泡会一路铺到键盘底下，滚到底时最后一条看不见。 */
  height: calc(100vh - var(--keyboard-height, 0px));
  max-height: calc(100vh - var(--keyboard-height, 0px));
  min-height: 0;
  padding-bottom: 0;
  overflow: hidden;
}
/* flex 定值链：每层都要有确定高度，overflow-y:auto 才真的生效 */
html.keyboard-chat .page.has-nav .tab-track {
  display: flex;
  /* 默认 row 只会让子面板在横向 flex，高度仍按内容撑开；
     必须改成 column，.tab-panel / .ai-page / .page-content 才逐层收到
     「键盘上方可视高度」，否则滚到底时最后一条仍在输入条下面。 */
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
html.keyboard-chat .tab-panel.is-on {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  animation: none;
}
html.keyboard-chat .ai-page {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  padding-bottom: 0;
}
/* 回弹脚本会给 .page-content 挂 transform；键盘态一律清掉，
   免得 position:fixed 被降级成相对一个会滚的祖先定位。 */
html.keyboard-chat .page,
html.keyboard-chat .tab-track,
html.keyboard-chat .tab-panel,
html.keyboard-chat .ai-page,
html.keyboard-chat .page-content {
  transform: none !important;
  will-change: auto !important;
  animation: none !important;
}
/* 只有聊天内容滚，输入条和弹窗留在外面 */
html.keyboard-chat .ai-page .page-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  /* 最后一条气泡要能滚到输入条上方，别被压住 */
  padding-bottom: 240rpx;
}
/* AI 配置弹窗里也有输入框：给它补底部内边距，居中卡片自然上移半个键盘 */
html.keyboard-open .ai-mask {
  padding-bottom: calc(40rpx + var(--keyboard-height, 0px));
}
html.keyboard-open .ai-panel {
  max-height: calc(84vh - var(--keyboard-height, 0px));
}
.feedback-correct { animation: correctGlow 520ms ease; }
.feedback-wrong { animation: wrongGlow 520ms ease; }
@keyframes correctGlow {
  40% { box-shadow: 0 0 0 16rpx rgba(48, 196, 139, .18), 0 0 54rpx rgba(48, 196, 139, .56); }
}
@keyframes wrongGlow {
  40% { box-shadow: 0 0 0 16rpx rgba(239, 83, 111, .17), 0 0 54rpx rgba(239, 83, 111, .52); }
}
/* 逐层淡入：每个元素自己给 --fade-delay，卡片按顺序一片片浮上来。
   fill-mode 必须是 backwards 而不是 both：both 会让最后一帧的 transform 一直挂着，
   元素永久变成「被变换的祖先」——它里面那些毛玻璃卡片就采样不到真正的背景，
   看起来像没开模糊（v2.8.0 上下两组卡片质感不一样就是这个引起的）。
   backwards 只在动画开始前套第一帧，结束后回到元素本来的样式，不给后续渲染添负担。 */
.fade-up { animation: fadeUp 420ms cubic-bezier(.4,.2,.2,1) backwards; animation-delay: var(--fade-delay, 0ms); }
@keyframes fadeUp { from { opacity: 0; transform: translateY(18rpx); } to { opacity: 1; transform: translateY(0); } }
/* 页面切换：整页从下方轻轻推入。
   只做 transform，不加 opacity，毛玻璃在移动过程中保持实时采样，不会「先到位、后变玻璃」 */
uni-page { animation: pageIn 300ms cubic-bezier(.22, .9, .3, 1) backwards; }
@keyframes pageIn {
  from { transform: translate3d(0, 34rpx, 0); }
  to { transform: translate3d(0, 0, 0); }
}
/* 系统级 uni.showModal 在暗色下是白底，文字必须锁深色 */
.uni-modal__title { color: #1b2432; }
.uni-modal__bd { color: #57616f; }
@media (prefers-reduced-motion: reduce) {
  .fade-up, .feedback-correct, .feedback-wrong, uni-page { animation: none; }
  .icon-button, .primary-button, .secondary-button, .choice-button, .grade-button { transition: none; }
}

/* ── 玻璃质感总开关（v3.10.1）────────────────────────────────────
   关掉后给低端机省掉最贵的一项：backdrop-filter 每帧都要重采样身后的壁纸。
   这里一刀切掉所有元素的模糊（含弹窗遮罩、底栏胶囊、各页 scoped 样式），
   再把半透明表面换成实色——否则卡片透出壁纸却没模糊，文字会糊在花纹上。
   壁纸本身保留，卡片像一层实色纸浮在上面，仍有层次但不吃 GPU。 */
html.glass-off *,
html.glass-off *::before,
html.glass-off *::after {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
/* 浅色：实白卡片 + 略灰底，文字沿用主题深色 */
html.glass-off {
  --surface: #ffffff;
  --surface-strong: #f6f9fd;
  --surface-soft: #eef2f8;
  --dialog-fill: #ffffff;
  --dialog-fill-2: #f4f7fb;
  --line: rgba(120, 138, 165, .26);
  --sheet-wash: rgba(244, 247, 252, .96);
}
/* 深色：石板灰实色卡片 */
html.glass-off[data-theme="dark"] {
  --surface: #1d2a3a;
  --surface-strong: #243448;
  --surface-soft: #1a2736;
  --dialog-fill: #243448;
  --dialog-fill-2: #1d2a3a;
  --line: rgba(150, 176, 208, .20);
  --sheet-wash: rgba(21, 31, 44, .96);
}
/* 深壁纸上的浅字主题：烟熏实色，别用上面的深色把浅字压穿 */
html.glass-off.has-photo.photo-dark {
  --surface: #16202e;
  --surface-strong: #1e2b3c;
  --surface-soft: #131d2a;
  --dialog-fill: #1e2b3c;
  --dialog-fill-2: #16202e;
  --line: rgba(190, 212, 240, .20);
  --sheet-wash: rgba(13, 20, 30, .96);
}
</style>
