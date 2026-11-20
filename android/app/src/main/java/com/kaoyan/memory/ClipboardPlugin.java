package com.kaoyan.memory;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 读系统剪贴板。
 *
 * 为什么需要原生插件：弹窗里的「粘贴」按钮原先走浏览器 navigator.clipboard.readText，
 * 在 Capacitor WebView 里既不是安全上下文、又拿不到剪贴板读权限，点了没反应。
 * 走 Android 原生 ClipboardManager 在真机上稳定可读（用户点按钮时 App 在前台，
 * 满足 Android 10+ 只有前台应用能读剪贴板的限制）。
 */
@CapacitorPlugin(name = "Clipboard")
public class ClipboardPlugin extends Plugin {

    @PluginMethod
    public void read(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.resolve(new JSObject().put("text", ""));
            return;
        }
        try {
            ClipboardManager manager =
                    (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
            String text = "";
            if (manager != null && manager.hasPrimaryClip()) {
                ClipData clip = manager.getPrimaryClip();
                if (clip != null && clip.getItemCount() > 0) {
                    ClipData.Item item = clip.getItemAt(0);
                    CharSequence seq = item == null ? null : item.getText();
                    if (seq != null) text = seq.toString();
                }
            }
            JSObject ret = new JSObject();
            ret.put("text", text);
            call.resolve(ret);
        } catch (Throwable t) {
            // 读不到就当空，交给前端兜底提示，不让它抛异常打断弹窗
            call.resolve(new JSObject().put("text", ""));
        }
    }
}
