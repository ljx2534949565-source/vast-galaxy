package com.kaoyan.memory;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OfflineTTSPlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        registerPlugin(StudyFeedbackPlugin.class);
        registerPlugin(LocalModelPlugin.class);
        registerPlugin(ClipboardPlugin.class);
        registerPlugin(BackNavPlugin.class);
        registerPlugin(MusicScannerPlugin.class);
        registerPlugin(MusicPlayerPlugin.class);
        registerPlugin(CloudStreamPlugin.class);
        super.onCreate(savedInstanceState);
        applyOrientationPolicy();
        // 首屏加载完把系统明暗推给网页：启动阶段 matchMedia 在部分机型上还不可靠
        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    pushNativeTheme(webView);
                    applyOverscrollPolicy(webView);
                }
            });
        }
    }

    /**
     * 屏幕方向的策略：
     *
     * 平板（sw600dp 以上）跟着系统自动旋转走——横着拿就上双栏仪表盘，竖着拿就单列长页。
     * 手机上仍然固定竖屏：单手操作时横屏只会把选项压扁，没必要。
     *
     * 清单里写的是 fullUser，因为清单没法按设备分流；真正的分流放在这里。
     */
    private void applyOrientationPolicy() {
        Configuration config = getResources().getConfiguration();
        boolean isTablet = config.smallestScreenWidthDp >= 600;
        setRequestedOrientation(isTablet
                ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }

    /**
     * 关掉 WebView 自带的过度滚动拉伸。
     *
     * 安卓 12 起，滚到顶/底继续拖会整块视口一起拉伸——贴死的壁纸会被拉变形。
     * 关掉之后由网页层（useContentBounce）只对内容做橡皮筋，壁纸原地不动。
     */
    private void applyOverscrollPolicy(WebView webView) {
        if (webView == null) return;
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    }

    /**
     * 系统切到深色 / 浅色时，把 uiMode 直接告诉网页。
     * WebView 的 prefers-color-scheme 在部分机型上不会跟着配置变化刷新，
     * 这个标记是兜底，JS 收到事件后会重新套用主题。
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        pushNativeTheme(webView, newConfig);
    }

    private void pushNativeTheme(WebView webView) {
        pushNativeTheme(webView, getResources().getConfiguration());
    }

    private void pushNativeTheme(WebView webView, Configuration config) {
        boolean dark = (config.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        webView.evaluateJavascript(
                "window.__nativeDark=" + dark + ";window.dispatchEvent(new Event('native-theme-change'));",
                null);
    }

    /**
     * 侧滑/返回键先在应用内部回退一个页面，只有已经在首页时才退出应用。
     *
     * v3.9.13：AI 二级对话页是网页内部状态、不是路由，canGoBack() 认不出来，
     * 以前在这里会直接 super 退出到桌面。现在先问网页（BackNavPlugin）：
     * 停在二级对话页就发 nativeBack 事件让网页退回一级，不退出 App。
     */
    @Override
    public void onBackPressed() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        // 有真实的历史页面（比如从 AI 面板 navigateTo 进的设置/教程页）时，
        // 永远先退那个页面——否则会把底层 AI 面板的 chat 标记误当成"要退回一级"。
        if (webView != null && webView.canGoBack() && !isHome(webView.getUrl())) {
            webView.goBack();
            return;
        }
        // 没有历史页可退，且网页报告停在 AI 二级对话页：让网页退回一级，不退出 App。
        BackNavPlugin backNav = getBackNavPlugin();
        if (backNav != null && backNav.isChatActive()) {
            backNav.notifyNativeBack();
            return;
        }
        super.onBackPressed();
    }

    private BackNavPlugin getBackNavPlugin() {
        if (getBridge() == null) return null;
        com.getcapacitor.PluginHandle handle = getBridge().getPlugin("BackNav");
        if (handle == null || !(handle.getInstance() instanceof BackNavPlugin)) return null;
        return (BackNavPlugin) handle.getInstance();
    }

    private boolean isHome(String url) {
        if (url == null) return true;
        int hash = url.indexOf('#');
        String route = hash >= 0 ? url.substring(hash) : "";
        return route.isEmpty() || route.startsWith("#/pages/index/index");
    }
}
