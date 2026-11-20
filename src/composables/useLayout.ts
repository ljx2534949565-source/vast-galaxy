import { reactive } from 'vue';
import { refreshSystemBars } from '@/utils/systemBars';

/**
 * 设备与窗口尺寸判定。
 *
 * 为什么不用 UA：安卓平板的 UA 里经常既没有 "Tablet" 也有 "Mobile"，
 * 靠 UA 猜会把小米平板识别成手机。这里用「最短边」——也就是安卓
 * sw600dp 那套官方分界：最短边 ≥ 600dp 就是平板，手机再怎么横过来
 * 最短边也不会到 600。WebView 里 CSS px ≈ dp。
 *
 * 三个结论分开给：
 * - `isTablet`：设备本身是不是平板，管「要不要放宽容器、上仪表盘」
 * - `isLandscape`：当前是横着还是竖着，管「用哪一套栅格」
 * - `isWide`：当前窗口够不够宽（≥720px），管「能不能上双栏」
 *
 * 平板横竖两种拿法差别很大：竖着是 800×1280 的长条，横着是 1280×800
 * 的宽屏，同一套栅格喂不饱两边，所以横屏单独走 is-landscape 分支。
 */
const TABLET_MIN_SIDE = 600;
const TWO_COLUMN_MIN_WIDTH = 720;

export interface LayoutInfo {
  width: number;
  height: number;
  /** 屏幕最短边，判断平板的依据 */
  shortSide: number;
  isTablet: boolean;
  isWide: boolean;
  landscape: boolean;
}

const state = reactive<LayoutInfo>({
  width: 0,
  height: 0,
  shortSide: 0,
  isTablet: false,
  isWide: false,
  landscape: false
});

let started = false;
let lastOrientation = '';

function readSize() {
  if (typeof window === 'undefined') {
    try {
      const info = uni.getSystemInfoSync();
      return { width: info.windowWidth || 0, height: info.windowHeight || 0, screenWidth: info.screenWidth || 0, screenHeight: info.screenHeight || 0 };
    } catch {
      return { width: 0, height: 0, screenWidth: 0, screenHeight: 0 };
    }
  }
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  // iOS 旋转后 screen 不跟着换，所以取 min/max 而不是依赖当前朝向
  const screenWidth = window.screen?.width || width;
  const screenHeight = window.screen?.height || height;
  return { width, height, screenWidth, screenHeight };
}

function measure() {
  const { width, height, screenWidth, screenHeight } = readSize();
  // 只认 innerWidth/innerHeight：它们在 WebView 里一定是 CSS px（≈dp），
  // 而某些安卓机的 screen.width 会报物理像素（1080），拿它判断会把手机全认成平板。
  // 只有 inner 拿不到时才退回 screen。
  const viewShort = width > 0 && height > 0 ? Math.min(width, height) : 0;
  const screenShort = Math.min(screenWidth || width, screenHeight || height);
  const shortSide = viewShort || screenShort;
  state.width = width;
  state.height = height;
  state.shortSide = shortSide;
  state.landscape = width > height;
  state.isTablet = shortSide >= TABLET_MIN_SIDE;
  state.isWide = width >= TWO_COLUMN_MIN_WIDTH;

  const orientation = state.landscape ? 'landscape' : 'portrait';

  // #ifdef H5
  // 挂在 html 上，各页面的 scoped 样式可以写 html.is-tablet .xxx
  const root = document.documentElement;
  root.classList.toggle('is-tablet', state.isTablet);
  root.classList.toggle('is-wide', state.isWide);
  root.classList.toggle('is-landscape', state.landscape);
  root.classList.toggle('is-portrait', !state.landscape);
  root.dataset.device = state.isTablet ? 'tablet' : 'phone';
  root.dataset.orientation = orientation;
  // #endif

  // 旋转后系统栏的高度换了方向（竖屏吃顶部、横屏常吃侧边），重取一次，
  // 不然横屏会顶出一条空带或者标题被状态栏压住
  if (orientation !== lastOrientation) {
    lastOrientation = orientation;
    refreshSystemBars();
  }
}

/** 在任意页面调用即可；监听器只注册一次，全局共用同一份状态 */
export function useLayout(): LayoutInfo {
  if (!started) {
    started = true;
    measure();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', measure);
      window.addEventListener('orientationchange', measure);
      // 安卓分屏、折叠屏展开、系统字号变化都可能不触发 resize，补一层兜底
      try {
        uni.onWindowResize?.(() => measure());
      } catch {
        // 平台不支持就算了，resize 已经够用
      }
    }
  }
  return state;
}
