package com.kaoyan.memory;

import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import net.ladenthin.llama.LlamaIterable;
import net.ladenthin.llama.LlamaModel;
import net.ladenthin.llama.parameters.ChatRequest;
import net.ladenthin.llama.parameters.InferenceParameters;
import net.ladenthin.llama.parameters.ModelParameters;
import net.ladenthin.llama.value.LlamaOutput;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 本地模型插件：建目录 + 列模型 + 加载 + 生成 + 卸载。
 *
 * 引擎是 java-llama.cpp（net.ladenthin:llama-android）。所有重活（模型加载、推理）
 * 都丢到单线程线程池，绝不在 WebView 主线程跑——1.1GB 模型加载和首字推理都要几秒，
 * 放主线程会直接把界面卡死。
 *
 * 模型单例：一次只加载一个模型。loadModel 会先卸载旧的，避免两份 1GB 权重同时占内存。
 */
@CapacitorPlugin(name = "LocalModel")
public class LocalModelPlugin extends Plugin {

    private static final String DIR_NAME = "yanci-models";
    private static final String KEEP_FILE = ".keep";

    private static final String CODE_OK = "OK";
    private static final String CODE_NEED_MANUAL = "NEED_MANUAL";

    /** 模型加载/推理共用一个单线程，天然串行，避免并发访问同一 LlamaModel */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile LlamaModel model = null;
    private volatile String loadedPath = null;

    /* ───────────────────── 目录 ───────────────────── */

    @PluginMethod
    public void ensureModelDir(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            ret.put("code", CODE_NEED_MANUAL);
            ret.put("path", "Download/" + DIR_NAME);
            call.resolve(ret);
            return;
        }
        try {
            String relative = Environment.DIRECTORY_DOWNLOADS + "/" + DIR_NAME;
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, KEEP_FILE);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, relative);
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            Uri uri = getContext().getContentResolver()
                    .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            ret.put("code", uri == null ? CODE_NEED_MANUAL : CODE_OK);
            ret.put("path", "Download/" + DIR_NAME);
        } catch (Exception e) {
            ret.put("code", CODE_NEED_MANUAL);
            ret.put("path", "Download/" + DIR_NAME);
        }
        call.resolve(ret);
    }

    /* ───────────────────── 系统选文件（SAF，终极兜底） ───────────────────── */

    /**
     * 打开系统文件选择器，让用户自己挑一个 gguf 文件。
     * 这条路不需要任何存储权限，也不依赖媒体库索引——部分国产 ROM 里
     * 浏览器下载的文件不进 MediaStore，自动扫描永远为空，此时只能靠用户手动选。
     * 选中的是 content:// URI，回调里读到名字并返回，加载时 resolvePath 会复制流。
     */
    @PluginMethod
    public void pickModel(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        // 部分机型只认具体 mime；给个备选，仍不行就靠用户切到"全部文件"
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/octet-stream", "application/x-binary", "*/*"});
        startActivityForResult(call, intent, "pickModelResult");
    }

    /** SAF 选文件回调：拿到 URI 的持久化读权限，返回可直接喂给 loadModel 的 path + 文件名 */
    @ActivityCallback
    public void pickModelResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            // 用户取消，不算错误
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("没有拿到文件");
            return;
        }
        // 先读出文件名（快，留在回调线程做）
        String name = "model.gguf";
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(uri,
                    new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                if (i >= 0) {
                    String d = c.getString(i);
                    if (d != null && !d.isEmpty()) name = d;
                }
            }
        } catch (Throwable ignored) {
        } finally {
            if (c != null) c.close();
        }
        // v3.9.9「门禁卡」：趁选文件的临时授权还有效，当场把文件复制进 App 私有目录，
        // 返回私有真实路径（不再是 content:// URI）。这样前端记住的是自家文件，
        // 覆盖安装 / 重启 / 系统回收授权后照样能读，彻底摆脱会过期的临时通行证。
        // 复制几个 GB 可能要几秒到几十秒，放 worker 线程，不卡界面。
        final String finalName = name;
        worker.execute(() -> {
            try {
                String privatePath = copyUriToPrivate(uri, finalName);
                JSObject ret = new JSObject();
                ret.put("cancelled", false);
                ret.put("path", privatePath);
                ret.put("name", finalName);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("导入模型失败：" + safeMsg(t), "IMPORT_FAIL");
            }
        });
    }

    /** 把 SAF 选中的 content:// 文件复制进私有 files/models/，返回绝对路径。
     *  同名文件已存在且非空就直接复用，避免重复选同一文件时又拷几 GB。 */
    private String copyUriToPrivate(Uri uri, String name) throws Exception {
        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建模型目录");
        String safeName = (name == null || !name.toLowerCase().endsWith(".gguf"))
                ? "model.gguf" : name;
        File target = new File(dir, safeName);
        if (target.exists() && target.length() > 0) return target.getAbsolutePath();
        // 先写临时文件，完整复制后再原子改名：中途被杀也不会留下「看起来完整」的半截模型。
        File tmp = new File(dir, safeName + ".partial");
        if (tmp.exists()) tmp.delete();
        InputStream in = getContext().getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("无法打开选中的文件");
        try (InputStream src = in; OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 20]; // 1MB 块，跨进程读 content:// 时比 64KB 少几十倍往返
            int n;
            while ((n = src.read(buf)) > 0) out.write(buf, 0, n);
        }
        if (tmp.length() == 0) {
            tmp.delete();
            throw new Exception("复制后的文件是空的");
        }
        if (!tmp.renameTo(target)) {
            // 改名为 fallback：删掉旧 target 再改
            if (target.exists()) target.delete();
            if (!tmp.renameTo(target)) throw new Exception("保存模型文件失败");
        }
        return target.getAbsolutePath();
    }

    /* ───────────────────── 列模型 ───────────────────── */

    /**
     * 列出公共 Download（含 yanci-models 子目录）下的 .gguf 文件。
     * 用 MediaStore 查询，不申请存储权限；拿 _data 真实路径给引擎用。
     * 安卓 10+ 对公共 Download 下自己创建/用户下载的文件，_data 通常可读。
     */
    /**
     * 列出手机上的 .gguf 模型。三重兜底，任意一路能查到就算数：
     *  ① MediaStore.Downloads（公共下载集合）— 全量拉回，Java 端按后缀过滤
     *  ② MediaStore.Files（文件表）— 覆盖只进文件表、没进下载集合的记录
     *  ③ 直扫 Download/yanci-models 目录 — scoped storage 下尽力而为
     *
     * v3.9.1 关键修复：旧版在 SQL 层用 LIKE '%.gguf' + date_modified 排序，
     * 部分国产 ROM 的 MediaStore 实现不完整，整条查询抛异常后被吞掉 → 永远返回空列表，
     * 表现就是「点刷新没反应」。现在把过滤挪到 Java 端，且把异常原因回传给前端，
     * 便于真机上定位到底是哪一路失败。
     */
    @PluginMethod
    public void listModels(PluginCall call) {
        worker.execute(() -> {
            JSArray arr = new JSArray();
            java.util.Set<String> seen = new java.util.HashSet<>();
            int raw = 0;
            StringBuilder note = new StringBuilder();

            String[] proj = new String[]{
                    MediaStore.MediaColumns._ID,
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.SIZE,
                    MediaStore.MediaColumns.DATA,
                    MediaStore.MediaColumns.RELATIVE_PATH
            };

            // ① 下载集合：不加 SQL 条件，全量拉回自己过滤，规避 ROM 实现差异
            Cursor cursor = null;
            try {
                cursor = getContext().getContentResolver().query(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, proj, null, null, null);
                if (cursor != null) {
                    raw += cursor.getCount();
                    int iName = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                    int iSize = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE);
                    int iData = cursor.getColumnIndex(MediaStore.MediaColumns.DATA);
                    int iId = cursor.getColumnIndex(MediaStore.MediaColumns._ID);
                    while (cursor.moveToNext()) {
                        String name = iName >= 0 ? cursor.getString(iName) : "";
                        if (name == null || !name.toLowerCase().endsWith(".gguf")) continue;
                        long size = iSize >= 0 ? cursor.getLong(iSize) : 0;
                        String data = iData >= 0 ? cursor.getString(iData) : null;
                        long id = iId >= 0 ? cursor.getLong(iId) : -1;
                        String path = (data != null && !data.isEmpty())
                                ? data
                                : MediaStore.Downloads.EXTERNAL_CONTENT_URI + "/" + id;
                        if (seen.add(name + "|" + size)) arr.put(item(name, size, path));
                    }
                }
            } catch (Throwable t) {
                note.append("下载库:").append(safeMsg(t));
            } finally {
                if (cursor != null) cursor.close();
            }

            // ② 文件表兜底：._data 拿不到时用 content:// URI，loadModel 会复制
            cursor = null;
            try {
                cursor = getContext().getContentResolver().query(
                        MediaStore.Files.getContentUri("external"), proj,
                        MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?",
                        new String[]{"%.gguf"}, null);
                if (cursor != null) {
                    raw += cursor.getCount();
                    int iName = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                    int iSize = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE);
                    int iData = cursor.getColumnIndex(MediaStore.MediaColumns.DATA);
                    int iId = cursor.getColumnIndex(MediaStore.MediaColumns._ID);
                    while (cursor.moveToNext()) {
                        String name = iName >= 0 ? cursor.getString(iName) : "";
                        if (name == null || !name.toLowerCase().endsWith(".gguf")) continue;
                        long size = iSize >= 0 ? cursor.getLong(iSize) : 0;
                        String data = iData >= 0 ? cursor.getString(iData) : null;
                        long id = iId >= 0 ? cursor.getLong(iId) : -1;
                        String path = (data != null && !data.isEmpty())
                                ? data
                                : MediaStore.Files.getContentUri("external") + "/" + id;
                        if (seen.add(name + "|" + size)) arr.put(item(name, size, path));
                    }
                }
            } catch (Throwable t) {
                if (note.length() > 0) note.append("; ");
                note.append("文件表:").append(safeMsg(t));
            } finally {
                if (cursor != null) cursor.close();
            }

            // ③ 直扫私有目录 + 公共 Download/yanci-models（尽力而为）
            try {
                java.io.File[] roots = new java.io.File[]{
                        new java.io.File(getContext().getFilesDir(), "models"),
                        new java.io.File(Environment.getExternalStoragePublicDirectory(
                                Environment.DIRECTORY_DOWNLOADS), DIR_NAME)
                };
                for (java.io.File dir : roots) {
                    java.io.File[] files = dir.listFiles((d, n) -> n.toLowerCase().endsWith(".gguf"));
                    if (files != null) {
                        for (java.io.File f : files) {
                            if (seen.add(f.getName() + "|" + f.length()))
                                arr.put(item(f.getName(), f.length(), f.getAbsolutePath()));
                        }
                    }
                }
            } catch (Throwable ignored) { }

            JSObject ret = new JSObject();
            ret.put("models", arr);
            ret.put("raw", raw);
            ret.put("note", note.toString());
            call.resolve(ret);
        });
    }

    private static JSObject item(String name, long size, String path) {
        JSObject o = new JSObject();
        o.put("name", name);
        o.put("size", size);
        o.put("path", path);
        return o;
    }

    /* ───────────────────── 加载 ───────────────────── */

    @PluginMethod
    public void loadModel(PluginCall call) {
        String path = call.getString("path", "");
        if (path == null || path.isEmpty()) {
            call.reject("模型路径为空");
            return;
        }
        worker.execute(() -> {
            try {
                unloadInternal();
                // 真机上 MediaStore 的 _data 有时拿不到可读的真实路径（尤其安卓 11+）。
                // 拿到 content:// URI 或路径不可读时，把文件流复制到 App 私有目录再加载。
                String realPath = resolvePath(path);
                ModelParameters params = new ModelParameters()
                        .setModel(realPath)
                        .setCtxSize(2048)     // 上下文够放系统提示+12轮历史，又不吃太多内存
                        .setThreads(4)        // 4 线程是中端机的甜点，太多反而因调度变慢
                        .setTemp(0.6f)
                        .setTopK(40)
                        .setTopP(0.9f)
                        .setPredict(256);     // 单次最多生成 256 token，够一句话解释
                model = new LlamaModel(params);
                loadedPath = realPath;
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("path", loadedPath);
                call.resolve(ret);
            } catch (Throwable t) {
                unloadInternal();
                call.reject("模型加载失败：" + safeMsg(t), "LOAD_FAIL");
            }
        });
    }

    /**
     * 把前端给的路径变成 native 能 open 的真实文件路径。
     * 1) 普通文件且可读 → 直接用
     * 2) content:// URI 或不可读路径 → 复制流到私有 files/models/，返回私有真实路径
     */
    private String resolvePath(String path) throws Exception {
        if (!path.startsWith("content://")) {
            File f = new File(path);
            if (f.exists() && f.canRead()) return path;
        }
        // content URI：解析出名字，复制到私有目录（若已复制过且大小一致就复用）
        Uri uri = Uri.parse(path);
        String name = "copied-model.gguf";
        try {
            String display = null;
            Cursor c = getContext().getContentResolver().query(uri,
                    new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null);
            if (c != null) {
                if (c.moveToFirst()) {
                    int i = c.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                    if (i >= 0) display = c.getString(i);
                }
                c.close();
            }
            if (display != null && !display.isEmpty()) name = display;
        } catch (Exception ignored) { }

        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists()) dir.mkdirs();
        File target = new File(dir, name);
        // 已复制过就复用（按名字判断，模型文件通常不会同名不同内容）
        if (target.exists() && target.length() > 0) return target.getAbsolutePath();

        InputStream in = getContext().getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("无法打开模型文件（content URI）");
        try (InputStream src = in; OutputStream out = new FileOutputStream(target)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = src.read(buf)) > 0) out.write(buf, 0, n);
        }
        return target.getAbsolutePath();
    }

    /* ───────────────────── 生成 ───────────────────── */

    /**
     * 单轮生成（流式）。前端把系统人设 + 历史 + 当前问题拼成一个 prompt 传进来，
     * 这里用 generateChat() 走模型内置 chat template，逐块把文本推给前端显示，
     * 不再像旧版那样等整段生成完才一次性吐出来——本地模型首字要好几秒，
     * 边生成边显示能让用户立刻看到字在往外冒，等待感小很多。
     *
     * 每块通过 notifyListeners("localToken", {...}) 推送：
     *   text  本块增量文本
     *   index 块序号，从 0 开始，前端据此丢弃上一次残留
     *   done  是否为最后一块
     * 结束时 call.resolve({text: 全文})，保持旧调用方（拿完整文本）兼容。
     */
    @PluginMethod
    public void generate(PluginCall call) {
        String prompt = call.getString("prompt", "");
        if (prompt == null || prompt.trim().isEmpty()) {
            call.reject("提示词为空");
            return;
        }
        LlamaModel current = model;
        if (current == null) {
            call.reject("模型还没加载", "NOT_LOADED");
            return;
        }
        worker.execute(() -> {
            StringBuilder full = new StringBuilder();
            int index = 0;
            try (LlamaIterable iterable = current.generateChat(buildInferenceParams(prompt))) {
                for (LlamaOutput out : iterable) {
                    if (out == null) continue;
                    String piece = out.text;
                    if (piece != null && !piece.isEmpty()) {
                        full.append(piece);
                        JSObject ev = new JSObject();
                        ev.put("text", piece);
                        ev.put("index", index++);
                        ev.put("done", false);
                        notifyListeners("localToken", ev);
                    }
                    if (out.stop) break;
                }
                JSObject doneEvent = new JSObject();
                doneEvent.put("text", "");
                doneEvent.put("index", index);
                doneEvent.put("done", true);
                notifyListeners("localToken", doneEvent);
                JSObject ret = new JSObject();
                ret.put("text", full.toString().trim());
                call.resolve(ret);
            } catch (Throwable t) {
                // 出错也发一个 done，免得前端气泡一直挂在"生成中"
                try {
                    JSObject doneEvent = new JSObject();
                    doneEvent.put("text", "");
                    doneEvent.put("index", index);
                    doneEvent.put("done", true);
                    doneEvent.put("error", safeMsg(t));
                    notifyListeners("localToken", doneEvent);
                } catch (Throwable ignored) { }
                call.reject("生成失败：" + safeMsg(t), "GEN_FAIL");
            }
        });
    }

    /** 用 chat template 把 prompt 包成 user 消息，参数与加载时保持一致 */
    private static InferenceParameters buildInferenceParams(String prompt) {
        ChatRequest request = ChatRequest.empty().appendMessage("user", prompt);
        return InferenceParameters.empty()
                .withMessagesJson(request.buildMessagesJson())
                .withNPredict(256)
                .withTemperature(0.6f)
                .withTopK(40)
                .withTopP(0.9f);
    }

    /* ───────────────────── 卸载 ───────────────────── */

    @PluginMethod
    public void unload(PluginCall call) {
        worker.execute(() -> {
            unloadInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("loaded", model != null);
        ret.put("path", loadedPath != null ? loadedPath : "");
        call.resolve(ret);
    }

    /* ───────────────────── 私有副本管理（释放空间） ───────────────────── */

    /**
     * 列出 App 私有 files/models/ 下已经复制好的 gguf 副本。
     * 这些副本就是系统「存储 → 应用数据」里占空间的大头，用户换模型后旧副本不会自动消失。
     * 返回 name / size / path / active（是否正在被当前引擎加载），前端据此展示并可删除。
     */
    @PluginMethod
    public void listLocalModels(PluginCall call) {
        worker.execute(() -> {
            JSArray arr = new JSArray();
            try {
                File dir = new File(getContext().getFilesDir(), "models");
                File[] files = dir.listFiles((d, n) -> n.toLowerCase().endsWith(".gguf"));
                if (files != null) {
                    for (File f : files) {
                        JSObject o = new JSObject();
                        o.put("name", f.getName());
                        o.put("size", f.length());
                        o.put("path", f.getAbsolutePath());
                        o.put("active", loadedPath != null && f.getAbsolutePath().equals(loadedPath));
                        arr.put(o);
                    }
                }
            } catch (Throwable ignored) { }
            JSObject ret = new JSObject();
            ret.put("models", arr);
            call.resolve(ret);
        });
    }

    /**
     * 删除一个私有模型副本，释放它占的存储空间。
     * 如果删的正是当前加载的模型，先在 worker 线程卸载引擎，避免删文件后 native 崩溃。
     * name 只接受纯文件名，挡住 ../ 目录穿越。
     */
    @PluginMethod
    public void deleteLocalModel(PluginCall call) {
        String name = call.getString("name", "");
        if (name == null || name.isEmpty() || name.contains("/") || name.contains("\\") || name.equals("..")) {
            call.reject("非法的文件名");
            return;
        }
        worker.execute(() -> {
            try {
                File dir = new File(getContext().getFilesDir(), "models");
                File target = new File(dir, name);
                if (!target.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) {
                    call.reject("非法路径");
                    return;
                }
                // 删的就是当前加载的模型：先卸载释放 native，再删文件
                if (loadedPath != null && target.getAbsolutePath().equals(loadedPath)) {
                    unloadInternal();
                }
                boolean ok = target.exists() && target.delete();
                JSObject ret = new JSObject();
                ret.put("ok", ok);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("删除失败：" + safeMsg(t));
            }
        });
    }

    /** 必须在 worker 线程调用；关闭模型释放 native 内存 */
    private void unloadInternal() {
        LlamaModel old = model;
        model = null;
        loadedPath = null;
        if (old != null) {
            try {
                old.close();
            } catch (Throwable ignored) {
            }
        }
    }

    private static String safeMsg(Throwable t) {
        String m = t.getMessage();
        return (m == null || m.isEmpty()) ? t.getClass().getSimpleName() : m;
    }

    @Override
    protected void handleOnDestroy() {
        unloadInternal();
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
