package com.kaoyan.memory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 把「安卓系统返回键」接进网页内部的二级界面。
 *
 * 背景：AI 的一级/二级（模型页 → 对话页）只是 Vue 里的一个状态切换，不是路由，
 * 所以 WebView.canGoBack() 认不出它，MainActivity.onBackPressed 会直接 super →
 * 退出到手机桌面。这个插件让网页把「当前是否停在二级对话页」告诉原生：
 *   - 在二级：onBackPressed 发一个 nativeBack 事件，让网页自己退回一级，不退出 App；
 *   - 不在二级：走原来的 canGoBack / 退出逻辑。
 *
 * 用 volatile 是因为 onBackPressed 在 Activity 主线程、setChat 在插件桥线程，跨线程读。
 */
@CapacitorPlugin(name = "BackNav")
public class BackNavPlugin extends Plugin {

    private volatile boolean chatActive = false;

    /** 网页进入/离开二级对话页时更新标记 */
    @PluginMethod
    public void setChat(PluginCall call) {
        chatActive = Boolean.TRUE.equals(call.getBoolean("active", false));
        call.resolve();
    }

    /** 原生 onBackPressed 查询：当前是否停在二级对话页 */
    public boolean isChatActive() {
        return chatActive;
    }

    /** 通知网页：用户按了系统返回键，请退回一级（网页监听 nativeBack 事件） */
    public void notifyNativeBack() {
        JSObject ev = new JSObject();
        ev.put("source", "systemBack");
        notifyListeners("nativeBack", ev);
    }
}
