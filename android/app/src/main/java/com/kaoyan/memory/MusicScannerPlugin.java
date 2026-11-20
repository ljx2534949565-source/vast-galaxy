package com.kaoyan.memory;

import android.Manifest;
import android.database.Cursor;
import android.os.Build;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 本地音乐扫描插件：一步到位把手机音乐库列出来，不再让用户在网页里手动选文件。
 *
 * 为什么必须走原生：网页里的 <input type="file"> 在安卓 WebView 上要么调不起系统
 * 文件选择器，要么选完拿不到可读路径，表现就是「选了也加不进去」。MediaStore 是
 * 安卓标准的音乐库索引，原生查询稳定，且 content:// URI 可直接交给播放器。
 *
 * 权限分版本：安卓 13 (API 33) 起用 READ_MEDIA_AUDIO，以下用 READ_EXTERNAL_STORAGE。
 * 这是本项目第一次申请运行时权限——只在用户点「扫描」时按需弹，不提前、不后台要。
 *
 * 查询放单线程池：国产 ROM 的媒体库偶发卡顿，绝不在 WebView 主线程做。
 */
@CapacitorPlugin(
        name = "MusicScanner",
        permissions = {
                @Permission(alias = "audio", strings = {Manifest.permission.READ_MEDIA_AUDIO}),
                @Permission(alias = "audioLegacy", strings = {Manifest.permission.READ_EXTERNAL_STORAGE})
        }
)
public class MusicScannerPlugin extends Plugin {

    /** 扫描任务串行，避免连点扫描同时开多个 Cursor */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    /** 与前端 utils/music.ts 的 AUDIO_EXTENSIONS 保持一致 */
    private static final String[] AUDIO_EXT = {
            "mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma", "ape"
    };

    /**
     * v4.2.4：30 秒（毫秒）及以下的短音频视为音效，扫描时直接跳过。
     * 与前端 utils/music.ts 的 MIN_TRACK_MS 保持一致，两处要一起改。
     */
    private static final long MIN_TRACK_MS = 30_000L;

    private String alias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "audioLegacy";
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) {
            doScan(call);
            return;
        }
        requestPermissionForAlias(alias(), call, "permissionResult");
    }

    @PermissionCallback
    public void permissionResult(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) {
            doScan(call);
            return;
        }
        // 用户拒绝：不算异常，前端据此提示去系统设置里开，不弹报错堆栈。
        JSObject ret = new JSObject();
        ret.put("granted", false);
        ret.put("tracks", new JSArray());
        ret.put("note", "权限被拒绝");
        call.resolve(ret);
    }

    private void doScan(PluginCall call) {
        worker.execute(() -> {
            JSArray arr = new JSArray();
            StringBuilder note = new StringBuilder();
            int raw = 0;

            String[] projection = new String[]{
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.DISPLAY_NAME,
                    MediaStore.Audio.Media.SIZE,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.DATE_ADDED
            };

            Cursor cursor = null;
            try {
                cursor = getContext().getContentResolver().query(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        projection, null, null,
                        MediaStore.Audio.Media.DATE_ADDED + " DESC");
                if (cursor != null) {
                    raw = cursor.getCount();
                    int iId = cursor.getColumnIndex(MediaStore.Audio.Media._ID);
                    int iName = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
                    int iSize = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);
                    int iDur = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
                    int iAdded = cursor.getColumnIndex(MediaStore.Audio.Media.DATE_ADDED);
                    while (cursor.moveToNext()) {
                        String name = iName >= 0 ? cursor.getString(iName) : null;
                        if (name == null || !isAudioName(name)) continue;
                        long id = iId >= 0 ? cursor.getLong(iId) : -1;
                        if (id < 0) continue;
                        long size = iSize >= 0 ? cursor.getLong(iSize) : 0;
                        long dur = iDur >= 0 ? cursor.getLong(iDur) : 0;
                        // v4.2.4：明确知道时长且 ≤30 秒的短音频是音效，跳过。
                        // dur<=0（媒体库读不到时长）的照常保留，避免误删正常歌曲。
                        if (dur > 0 && dur <= MIN_TRACK_MS) continue;
                        long addedSec = iAdded >= 0 ? cursor.getLong(iAdded) : 0;
                        // content:// URI 可直接喂给播放器，重装后只要在媒体库里仍在就有效。
                        String uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                                .buildUpon().appendEncodedPath(String.valueOf(id)).build().toString();
                        JSObject item = new JSObject();
                        item.put("name", name);
                        item.put("size", size);
                        item.put("uri", uri);
                        item.put("duration", dur > 0 ? dur : 0);
                        item.put("addedAt", addedSec > 0 ? addedSec * 1000L : 0L);
                        arr.put(item);
                    }
                } else {
                    note.append("媒体库返回空游标");
                }
            } catch (Throwable t) {
                note.append("媒体库查询失败:").append(safeMsg(t));
            } finally {
                if (cursor != null) cursor.close();
            }

            JSObject ret = new JSObject();
            ret.put("granted", true);
            ret.put("tracks", arr);
            ret.put("raw", raw);
            ret.put("note", note.toString());
            call.resolve(ret);
        });
    }

    /** 只看后缀，跟前端同一套口径；大小写不敏感 */
    private static boolean isAudioName(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return false;
        String ext = name.substring(dot + 1).toLowerCase(Locale.US);
        for (String candidate : AUDIO_EXT) {
            if (candidate.equals(ext)) return true;
        }
        return false;
    }

    private static String safeMsg(Throwable t) {
        String m = t.getMessage();
        return (m == null || m.isEmpty()) ? t.getClass().getSimpleName() : m;
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
