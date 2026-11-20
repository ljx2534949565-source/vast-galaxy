package com.kaoyan.memory;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 云端对话的 SSE 流式插件。
 *
 * 为什么单独做这个插件：Web 层的 CapacitorHttp 是一次性拿全文，读不到增量；
 * WebView 里的 fetch 又会被 CORS 拦。这个插件在原生层用 HttpURLConnection
 * 直接 POST（stream:true），逐行读 SSE 的 data 块，通过 notifyListeners 推给网页，
 * 于是云端也能像本地模型一样边生成边显示。
 *
 * 用系统自带的 HttpURLConnection，不引第三方依赖，避免版本冲突和额外下载。
 */
@CapacitorPlugin(name = "CloudStream")
public class CloudStreamPlugin extends Plugin {

    private static final int CONNECT_TIMEOUT_MS = 12000;
    // 流式期间只要持续有数据到达就不会超时；单块读取超时给足时间
    private static final int READ_TIMEOUT_MS = 60000;

    /** 所有网络活丢到单线程池，绝不占 WebView 主线程 */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    /** 当前正在跑的连接，供 cancel() 中断 */
    private final AtomicReference<HttpURLConnection> current = new AtomicReference<>();

    /**
     * 发起一次流式请求。
     * 参数：url、headers（对象）、body（对象，会被序列化成 JSON）。
     * 每块通过 notifyListeners("cloudToken", {text, done, ...}) 推送：
     *   - 有文本：{text:"增量", done:false}
     *   - 正常结束：{text:"", done:true}
     *   - 出错：{text:"", done:true, error:"..."}
     * call.resolve({text: 全文}) 保持"拿完整文本"的语义；失败则 call.reject。
     */
    @PluginMethod
    public void stream(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.trim().isEmpty()) {
            call.reject("接口地址为空");
            return;
        }
        JSONObject headers = call.getObject("headers");
        JSONObject body = call.getObject("body");
        if (body == null) {
            call.reject("请求体为空");
            return;
        }

        // 同时只跑一路流：若上一路还没结束，先掐掉，避免事件串台
        HttpURLConnection prev = current.getAndSet(null);
        if (prev != null) prev.disconnect();

        worker.execute(() -> {
            HttpURLConnection conn = null;
            StringBuilder full = new StringBuilder();
            try {
                URL target = new URL(url);
                conn = (HttpURLConnection) target.openConnection();
                current.set(conn);
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                conn.setReadTimeout(READ_TIMEOUT_MS);
                conn.setDoOutput(true);
                conn.setDoInput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "text/event-stream");
                if (headers != null) {
                    java.util.Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        Object value = headers.opt(key);
                        if (value != null) conn.setRequestProperty(key, String.valueOf(value));
                    }
                }

                byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(payload.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload);
                    os.flush();
                }

                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) {
                    String errBody = readAll(conn.getErrorStream());
                    String message = "请求失败（" + status + "）" + (errBody.isEmpty() ? "" : "：" + clip(errBody, 120));
                    emitDoneWithError(message);
                    call.reject(message, "HTTP_" + status);
                    return;
                }

                try (InputStream in = conn.getInputStream();
                     BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String trimmed = line.trim();
                        if (!trimmed.startsWith("data:")) continue;
                        String data = trimmed.substring(5).trim();
                        if (data.isEmpty() || "[DONE]".equals(data)) continue;

                        String piece = extractDelta(data);
                        if (piece != null && !piece.isEmpty()) {
                            full.append(piece);
                            JSObject ev = new JSObject();
                            ev.put("text", piece);
                            ev.put("done", false);
                            notifyListeners("cloudToken", ev);
                        }
                    }
                }

                JSObject done = new JSObject();
                done.put("text", "");
                done.put("done", true);
                notifyListeners("cloudToken", done);
                JSObject ret = new JSObject();
                ret.put("text", full.toString().trim());
                call.resolve(ret);
            } catch (Exception e) {
                String message = translate(e);
                emitDoneWithError(message);
                call.reject(message, "STREAM_FAIL");
            } finally {
                current.compareAndSet(conn, null);
                if (conn != null) conn.disconnect();
            }
        });
    }

    /** 主动取消当前流（用户切模型 / 清空对话时调用） */
    @PluginMethod
    public void cancel(PluginCall call) {
        HttpURLConnection conn = current.getAndSet(null);
        if (conn != null) {
            try { conn.disconnect(); } catch (Exception ignored) { }
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /**
     * 从一行 SSE data 里抠出增量文本。
     * 兼容：choices[0].delta.content（主流）、choices[0].delta.text、choices[0].text，
     * 以及少数兼容层直接给 {content} / {reply}。
     */
    private static String extractDelta(String data) {
        try {
            JSONObject obj = new JSONObject(data);
            JSONArray choices = obj.optJSONArray("choices");
            if (choices != null && choices.length() > 0) {
                JSONObject first = choices.getJSONObject(0);
                JSONObject delta = first.optJSONObject("delta");
                if (delta != null) {
                    String c = optText(delta, "content");
                    if (c != null) return c;
                    String t = optText(delta, "text");
                    if (t != null) return t;
                }
                String text = optText(first, "text");
                if (text != null) return text;
            }
            String content = optText(obj, "content");
            if (content != null) return content;
            String reply = optText(obj, "reply");
            if (reply != null) return reply;
        } catch (Exception ignored) {
            // 非 JSON 的一行（如注释/心跳），忽略
        }
        return null;
    }

    /** 取字符串字段；值不是字符串（比如 null/数组）就返回 null */
    private static String optText(JSONObject obj, String key) {
        Object value = obj.opt(key);
        return value instanceof String ? (String) value : null;
    }

    private void emitDoneWithError(String message) {
        try {
            JSObject ev = new JSObject();
            ev.put("text", "");
            ev.put("done", true);
            ev.put("error", message);
            notifyListeners("cloudToken", ev);
        } catch (Exception ignored) { }
    }

    private static String readAll(InputStream in) {
        if (in == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null && sb.length() < 512) sb.append(line);
        } catch (Exception ignored) { }
        return sb.toString();
    }

    private static String clip(String s, int max) {
        String v = s.replaceAll("\\s+", " ").trim();
        return v.length() > max ? v.substring(0, max) : v;
    }

    private static String translate(Exception e) {
        String m = e.getMessage();
        if (m == null || m.isEmpty()) m = e.getClass().getSimpleName();
        String low = m.toLowerCase();
        if (low.contains("failed to connect") || low.contains("econnrefused") || low.contains("timeout")) {
            return "连不上接口服务器，检查网络和接口地址。";
        }
        if (low.contains("unreachable") || low.contains("enotfound") || low.contains("unknownhost")) {
            return "网络不可达，检查手机网络。";
        }
        return clip(m, 120);
    }

    @Override
    protected void handleOnDestroy() {
        HttpURLConnection conn = current.getAndSet(null);
        if (conn != null) {
            try { conn.disconnect(); } catch (Exception ignored) { }
        }
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
