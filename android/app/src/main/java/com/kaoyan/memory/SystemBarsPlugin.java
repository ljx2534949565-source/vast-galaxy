package com.kaoyan.memory;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 让 WebView 真正铺满屏幕（含状态栏与导航栏区域），并把安全区高度交给前端做内边距。
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    /** 上一次报给网页的键盘高度（CSS px），避免同一高度反复 evaluateJavascript */
    private int lastKeyboardPx = -1;

    @Override
    public void load() {
        final Window window = getActivity().getWindow();
        getActivity().runOnUiThread(() -> {
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
                window.setNavigationBarDividerColor(Color.TRANSPARENT);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams params = window.getAttributes();
                params.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(params);
            }
            installKeyboardWatcher(window.getDecorView());
        });
    }

    /**
     * v3.5.0：manifest 用 adjustNothing，WebView 不再被键盘压矮，于是网页必须
     * 自己知道键盘有多高，才能只把 AI 输入条抬到键盘上沿（底栏保持不动）。
     *
     * 键盘高度从 IME inset 读：只有键盘真正弹出时 WindowInsets.Type.ime() 才有值，
     * 比「可见区域高度差」稳（后者在全屏 + 手势条机型上会把导航栏也算进去）。
     * 减去常驻导航栏的那一份，得到纯粹的键盘高度，再换算成 CSS px 推给网页：
     *   document.documentElement.style.setProperty('--keyboard-height', N + 'px')
     * 并给 <html> 挂/摘 keyboard-open，让 CSS 决定谁动、谁不动。
     */
    private void installKeyboardWatcher(View decor) {
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            int keyboardPx = Math.max(0, ime.bottom - nav.bottom);
            // 少数机型（尤其旧系统 + 全屏）会报「键盘可见但 inset 为 0」。
            // 这时给一个经验值兜底，总好过输入条完全不动、被键盘整个盖住。
            if (imeVisible && keyboardPx <= 0) {
                keyboardPx = Math.round(decor.getHeight() * 0.40f);
            }
            float density = getActivity().getResources().getDisplayMetrics().density;
            int cssPx = density > 0 ? Math.round(keyboardPx / density) : keyboardPx;
            pushKeyboard(cssPx);
            // 不消费 insets：WebView 自己还要拿它们算安全区
            return insets;
        });
        ViewCompat.requestApplyInsets(decor);
    }

    private void pushKeyboard(int cssPx) {
        if (cssPx == lastKeyboardPx) return;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;   // 还没就绪就别吞掉这次更新，下次 inset 会再派发
        lastKeyboardPx = cssPx;
        // 只派发事件，不直接写 CSS：网页层会把 IME inset 与 visualViewport 两条通道
        // 汇总取较大值（部分机型 / 低版本系统的 IME inset 会失效），再统一套样式
        final String script =
                "window.dispatchEvent(new CustomEvent('nativekeyboard',{detail:{height:" + cssPx + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            float density = getActivity().getResources().getDisplayMetrics().density;
            if (density <= 0) density = 1f;
            Window window = getActivity().getWindow();
            View decor = window.getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
            int top = 0;
            int bottom = 0;
            if (insets != null) {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
                top = Math.max(bars.top, cutout.top);
                bottom = Math.max(bars.bottom, cutout.bottom);
            }
            if (top == 0) {
                int id = getContext().getResources().getIdentifier("status_bar_height", "dimen", "android");
                if (id > 0) top = getContext().getResources().getDimensionPixelSize(id);
            }
            result.put("top", Math.round(top / density));
            result.put("bottom", Math.round(bottom / density));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void setLightBackground(PluginCall call) {
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View decor = window.getDecorView();
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            // light=true 表示浅色底，需要深色图标
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            call.resolve();
        });
    }
}
