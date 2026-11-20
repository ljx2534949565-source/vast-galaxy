/**
 * 回到页面顶部。
 *
 * H5 里 uni 的页面外壳是 `overflow: hidden` 的 `.page`，浏览器在「点一个屏幕外的按钮」
 * 时会把它当成可滚动容器，自己 scrollTop 一下。`uni.pageScrollTo` 只动 window，
 * 两者不一致时会出现「窗口在顶部、内容却上移了半屏」的错位。
 * 所以两处一起归零，确保结算卡从第一条像素开始显示。
 */
export function scrollPageTop(duration = 200): void {
  // #ifdef H5
  document.querySelectorAll<HTMLElement>('.page').forEach((element) => {
    element.scrollTop = 0;
  });
  // #endif
  uni.pageScrollTo({ scrollTop: 0, duration });
}
