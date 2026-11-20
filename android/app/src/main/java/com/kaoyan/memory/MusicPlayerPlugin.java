package com.kaoyan.memory;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.audio.TeeAudioProcessor;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import org.json.JSONObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 音乐播放插件：播放曲库里 content:// 位置的本地音频。
 *
 * v4.2.1：修复"打开就闪退"。load() 里不再同步 new ExoPlayer，改为首次点歌时懒加载，
 *        全程 try-catch，播放插件出任何问题都不拖垮 App 启动。
 * v4.2.2：修复"点一下三角瞬间暂停"。删掉手动 requestAudioFocus/放弃焦点那套逻辑，
 *        音频焦点完全交给 ExoPlayer（setAudioAttributes 第二个参数 true）。
 *        之前手动申请焦点被 ExoPlayer 误判成被抢焦点，刚播就自己暂停。
 *
 * 设计要点：
 * 1. ExoPlayer 用 application 上下文建单例，Capacitor 插件在 App 生命周期内常驻，
 *    切到单词 / AI 板块（只是切 Vue 页面）时音乐不会停。
 * 2. 音频焦点：完全交给 ExoPlayer 自己处理（setAudioAttributes 第二个参数 true），
 *    失焦（来电、别的 App 抢）由它按系统规则暂停或压低。不再手动申请焦点，避免自己跟自己打架。
 * 3. duck 由 TTS 侧主动调用 duckForTts()/restoreVolumeNow()：发音时压到 30%，读完恢复。
 * 4. 状态变化通过 notifyListeners("playerState") 主动推给前端，前端不用轮询。
 *
 * v4.7.0：新增三种播放模式（顺序 / 随机 / 单曲循环），用 ExoPlayer 自带的
 *        setRepeatMode / setShuffleModeEnabled 实现，模式在插件实例里记住，
 *        重新 play 一组曲目后依然生效，并通过状态快照同步给前端显示。
 *
 * v4.9.0：新增播放通知 / 锁屏控制。ExoPlayer 内核与所有播放逻辑保持不变，
 *        只在其上加一层前台服务（MusicNotificationService）+ MediaSession：
 *        每次状态变化把标题/播放态同步给通知；通知/锁屏上的按钮通过
 *        controlFromNotification() 反向操控同一个 ExoPlayer。
 *        安卓 13+ 发通知需要 POST_NOTIFICATIONS 运行时权限，在首次播放时按需申请。
 *
 * v5.1.0：音频输出链增加只读 PCM 分析，向网页推送真实音量、低频与节拍；
 *        不读取麦克风、不增加权限，分析过程不会改变音频数据。
 */
@CapacitorPlugin(
        name = "MusicPlayer",
        permissions = {
                @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
        }
)
public class MusicPlayerPlugin extends Plugin implements Player.Listener {

    private static final String EVENT_STATE = "playerState";
    private static final String EVENT_LEVEL = "audioLevel";
    private static final long LEVEL_UPDATE_MS = 50L;
    private static final long STATE_UPDATE_MS = 500L;
    /** 播放模式：0 顺序（列表轮播）/ 1 随机 / 2 单曲循环 */
    private static final int MODE_ORDER = 0;
    private static final int MODE_SHUFFLE = 1;
    private static final int MODE_ONE = 2;
    private int playMode = MODE_ORDER;
    /** 发音时音乐压到三成，不暂停，读完恢复 */
    private static final float DUCK_VOLUME = 0.3f;
    private static final float NORMAL_VOLUME = 1.0f;
    private static final long DUCK_RESTORE_DELAY_MS = 900L;

    private ExoPlayer player;
    /** 初始化失败的原因，供前端给出可读提示；为 null 表示没失败过 */
    private String initError;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable restoreVolumeTask = () -> setPlayerVolume(NORMAL_VOLUME);
    private final MusicLevelAnalyzer levelAnalyzer = new MusicLevelAnalyzer();
    private boolean levelUpdatesRunning;
    private final Runnable levelUpdateTask = new Runnable() {
        @Override
        public void run() {
            if (!levelUpdatesRunning) return;
            MusicLevelAnalyzer.Snapshot sample = levelAnalyzer.snapshot();
            JSObject out = new JSObject();
            out.put("level", sample.level);
            out.put("bass", sample.bass);
            out.put("beat", sample.beat);
            try {
                notifyListeners(EVENT_LEVEL, out);
            } catch (Throwable ignored) { }
            mainHandler.postDelayed(this, LEVEL_UPDATE_MS);
        }
    };

    /** 播放中持续推送真实进度，暂停时停止；不会用前端定时器伪造位置。 */
    private boolean stateUpdatesRunning;
    private final Runnable stateUpdateTask = new Runnable() {
        @Override
        public void run() {
            if (!stateUpdatesRunning) return;
            try {
                notifyListeners(EVENT_STATE, stateSnapshot());
            } catch (Throwable ignored) { }
            mainHandler.postDelayed(this, STATE_UPDATE_MS);
        }
    };

    /** 供 OfflineTTSPlugin 在发音 / 停止时调用，实现 duck */
    private static volatile MusicPlayerPlugin shared;

    // ---------- 通知 / 锁屏（v4.9.0）----------

    /**
     * 把当前播放状态同步到通知栏 / 锁屏。任何动作之后调用一次即可，
     * 内部做差分：状态没变化不重复 startForeground，避免无谓唤醒服务。
     */
    private void syncNotification() {
        try {
            Context app = getContext() != null ? getContext().getApplicationContext() : null;
            if (app == null) return;
            JSObject s = stateSnapshot();
            String title = s.optString("title", "");
            boolean playing = s.optBoolean("playing", false);
            MusicNotificationService.sync(app, title, playing);
        } catch (Throwable ignored) { }
    }

    /**
     * 通知按钮 / 锁屏按钮点下来的控制。经静态引用找到插件实例，
     * 复用和前端插件方法完全相同的 ExoPlayer 操作，保证行为一致。
     * action: play / pause / next / prev / stop
     */
    public static void controlFromNotification(String action) {
        MusicPlayerPlugin p = shared;
        if (p == null) return;
        p.mainHandler.post(() -> {
            try {
                ExoPlayer player = p.player;
                if (player == null) return;
                switch (action) {
                    case "play":
                        player.setPlayWhenReady(true);
                        break;
                    case "pause":
                        player.setPlayWhenReady(false);
                        break;
                    case "next":
                        if (player.hasNextMediaItem()) player.seekToNext();
                        else player.seekTo(0, 0L);
                        break;
                    case "prev":
                        if (player.getCurrentPosition() > 3000L) player.seekTo(0);
                        else if (player.hasPreviousMediaItem()) player.seekToPrevious();
                        else player.seekTo(0, 0L);
                        break;
                    case "stop":
                        player.stop();
                        player.clearMediaItems();
                        break;
                    default:
                        return;
                }
                p.syncNotification();
            } catch (Throwable ignored) { }
        });
    }

    /**
     * 播放前确保已拿到通知权限（安卓 13+）。已授权或低版本直接执行 action；
     * 否则弹一次系统授权框，回调里无论结果都继续——拒绝只影响通知，不影响本地播放。
     */
    private void ensureNotifyPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState("notifications") == PermissionState.GRANTED) {
            startPlayAfterPermission(call);
            return;
        }
        try {
            requestPermissionForAlias("notifications", call, "notifyPermissionResult");
        } catch (Throwable t) {
            // 权限通道本身出问题也不能挡住播放
            startPlayAfterPermission(call);
        }
    }

    @PermissionCallback
    public void notifyPermissionResult(PluginCall call) {
        // 授权 / 拒绝都继续播放；拒绝时 syncNotification 会尝试但系统不显示通知，不影响音频
        startPlayAfterPermission(call);
    }

    /**
     * 实际执行首次播放。从 call 重新读取参数（权限流程期间 call 一直保留），
     * 逻辑与 doPlay 一致，仅在这里集中一处避免重复代码。
     */
    private void startPlayAfterPermission(PluginCall call) {
        JSArray tracks = call.getArray("tracks");
        if (tracks == null || tracks.length() == 0) {
            call.reject("没有可播放的曲目");
            return;
        }
        doPlay(tracks, Math.max(0, Math.min(call.getInt("startIndex", 0), tracks.length() - 1)), call);
    }

    /**
     * 启动阶段只做轻量赋值，绝不 new ExoPlayer。
     * 任何一步包 try-catch，杜绝因为播放插件把 App 启动拖崩。
     */
    @Override
    public void load() {
        super.load();
        shared = this;
        // ExoPlayer 延迟到首次 play() 再创建，见 ensurePlayer()。
    }

    /**
     * 懒加载 ExoPlayer：首次点歌时才真正创建，失败只记录原因、不抛到启动流程。
     * 调用方在主线程（mainHandler.post 内）或这里已经同步，线程安全用 synchronized 保证。
     * @return 可用实例；创建失败返回 null 并写入 initError
     */
    private synchronized ExoPlayer ensurePlayer() {
        if (player != null) return player;
        if (initError != null) return null;
        try {
            Context app = getContext() != null ? getContext().getApplicationContext() : null;
            if (app == null) {
                initError = "播放器无法获取应用环境";
                return null;
            }
            // 在音频输出链中插入 Tee：PCM 原样播放，同时把只读副本送给律动分析器。
            // 与 Visualizer 不同，这条路径不访问麦克风，也不需要录音权限。
            DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(app) {
                @Override
                protected AudioSink buildAudioSink(
                        Context context,
                        boolean enableFloatOutput,
                        boolean enableAudioTrackPlaybackParams) {
                    return new DefaultAudioSink.Builder(context)
                            .setEnableFloatOutput(enableFloatOutput)
                            .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                            .setAudioProcessors(new AudioProcessor[]{
                                    new TeeAudioProcessor(levelAnalyzer)
                            })
                            .build();
                }
            };
            ExoPlayer p = new ExoPlayer.Builder(app)
                    .setRenderersFactory(renderersFactory)
                    .build();
            p.addListener(this);
            androidx.media3.common.AudioAttributes attrs =
                    new androidx.media3.common.AudioAttributes.Builder()
                            .setUsage(androidx.media3.common.C.USAGE_MEDIA)
                            .setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_MUSIC)
                            .build();
            p.setAudioAttributes(attrs, true);
            player = p;
            return player;
        } catch (Throwable t) {
            initError = "播放器初始化失败：" + safeMsg(t);
            return null;
        }
    }

    /** 播放一组曲目。tracks: [{uri,name,duration}]，startIndex 从 0 开始 */
    @PluginMethod
    public void play(PluginCall call) {
        ensureNotifyPermission(call);
    }

    /** 真正开始播放（权限检查之后走这里） */
    private void doPlay(JSArray tracks, final int start, PluginCall call) {
        mainHandler.post(() -> {
            try {
                ExoPlayer p = ensurePlayer();
                if (p == null) {
                    call.reject(initError != null ? initError : "播放器不可用");
                    return;
                }
                p.clearMediaItems();
                for (int i = 0; i < tracks.length(); i++) {
                    JSONObject t = tracks.getJSONObject(i);
                    String uri = t.optString("uri", "");
                    if (uri.isEmpty()) continue;
                    String name = t.optString("name", "");
                    MediaItem item = new MediaItem.Builder()
                            .setUri(uri)
                            .setMediaMetadata(new androidx.media3.common.MediaMetadata.Builder()
                                    .setTitle(name)
                                    .build())
                            .build();
                    p.addMediaItem(item);
                }
                if (p.getMediaItemCount() == 0) {
                    call.reject("曲目里没有可读取的文件位置");
                    return;
                }
                p.seekTo(Math.min(start, p.getMediaItemCount() - 1), 0L);
                applyMode(p);
                p.prepare();
                // 音频焦点完全交给 ExoPlayer（setAudioAttributes 第二个参数 true）。
                // v4.2.2：删掉这里手动 requestAudioFocus——ExoPlayer 会把"同 App 自己申请焦点"
                // 当成被别人抢焦点，于是刚播就暂停，正是"点一下三角瞬间停"的根因。
                p.setPlayWhenReady(true);
                syncNotification();
                call.resolve(stateSnapshot());
            } catch (Throwable t) {
                call.reject("播放失败：" + safeMsg(t));
            }
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (player != null) player.setPlayWhenReady(false);
                syncNotification();
                call.resolve(stateSnapshot());
            } catch (Throwable t) {
                call.reject(safeMsg(t));
            }
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        mainHandler.post(() -> {
            try {
                ExoPlayer p = ensurePlayer();
                if (p != null) {
                    p.setPlayWhenReady(true);
                }
                syncNotification();
                call.resolve(stateSnapshot());
            } catch (Throwable t) {
                call.reject(safeMsg(t));
            }
        });
    }

    @PluginMethod
    public void next(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (player != null) {
                    if (player.hasNextMediaItem()) player.seekToNext();
                    else player.seekTo(0, 0L);
                }
                syncNotification();
                call.resolve(stateSnapshot());
            } catch (Throwable t) {
                call.reject(safeMsg(t));
            }
        });
    }

    @PluginMethod
    public void previous(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (player != null) {
                    if (player.getCurrentPosition() > 3000L) {
                        player.seekTo(0);
                    } else if (player.hasPreviousMediaItem()) {
                        player.seekToPrevious();
                    } else {
                        player.seekTo(0, 0L);
                    }
                }
                syncNotification();
                call.resolve(stateSnapshot());
            } catch (Throwable t) {
                call.reject(safeMsg(t));
            }
        });
    }

    /** 切换播放模式：0 顺序 / 1 随机 / 2 单曲循环。越界值一律按顺序处理。 */
    @PluginMethod
    public void setMode(PluginCall call) {
        int mode = call.getInt("mode", MODE_ORDER);
        playMode = (mode == MODE_SHUFFLE || mode == MODE_ONE) ? mode : MODE_ORDER;
        mainHandler.post(() -> {
            try {
                if (player != null) applyMode(player);
                syncNotification();
                call.resolve(stateSnapshot());
            } catch (Throwable t) {
                call.reject(safeMsg(t));
            }
        });
    }

    /** 把记住的模式套到 ExoPlayer 上 */
    private void applyMode(ExoPlayer p) {
        try {
            p.setShuffleModeEnabled(playMode == MODE_SHUFFLE);
            p.setRepeatMode(playMode == MODE_ONE ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_ALL);
        } catch (Throwable ignored) { }
    }

    static long clampSeekPosition(long requestedMs, long durationMs) {
        long target = Math.max(0L, requestedMs);
        return durationMs > 0L ? Math.min(target, durationMs) : target;
    }

    /**
     * 解析 JS 传来的跳转位置。
     *
     * 这里不能用 Capacitor 的 {@code PluginCall.getLong("position", 0L)}：
     * 它内部只接受 {@code Long}，而 JSON 里的整数会被解析成 {@code Integer}、
     * 小数是 {@code Double}。类型不匹配时它静默返回默认值 0，原生就会执行
     * seekTo(当前曲, 0)——界面圆球到了手指位置，声音却从头播放。
     *
     * 统一按 {@link Number} 读取，再兼容数字字符串；非法值一律回落到 0。
     */
    static long parsePositionValue(Object raw) {
        if (raw instanceof Number) {
            double value = ((Number) raw).doubleValue();
            if (Double.isNaN(value) || Double.isInfinite(value)) return 0L;
            return Math.round(value);
        }
        if (raw instanceof String) {
            try {
                double value = Double.parseDouble(((String) raw).trim());
                if (Double.isNaN(value) || Double.isInfinite(value)) return 0L;
                return Math.round(value);
            } catch (NumberFormatException ignored) {
                return 0L;
            }
        }
        return 0L;
    }

    @PluginMethod
    public void seek(PluginCall call) {
        JSObject data = call.getData();
        long ms = parsePositionValue(data == null ? null : data.opt("position"));
        mainHandler.post(() -> {
            try {
                ExoPlayer p = player;
                if (p == null || p.getMediaItemCount() == 0 || p.getCurrentMediaItemIndex() < 0) {
                    call.reject("还没有可跳转的曲目");
                    return;
                }
                long duration = p.getDuration();
                long knownDuration = duration == androidx.media3.common.C.TIME_UNSET ? 0L : duration;
                long target = clampSeekPosition(ms, knownDuration);
                // 显式带上当前曲目下标，绝不能让列表跳转回第一首 / 当前曲起点。
                p.seekTo(p.getCurrentMediaItemIndex(), target);
                JSObject state = stateSnapshot();
                // 部分解码器在 seek 刚发出时 getCurrentPosition() 还是旧值（甚至是 0）。
                // 这里明确回填目标位置，前端和通知栏都不会把进度条弹回起点。
                state.put("position", target);
                notifyListeners(EVENT_STATE, state);
                syncNotification();
                call.resolve(state);
            } catch (Throwable t) {
                call.reject("进度跳转失败：" + safeMsg(t));
            }
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        double raw = call.getDouble("volume", 1.0);
        final float clamped = (float) Math.max(0.0, Math.min(1.0, raw));
        mainHandler.post(() -> {
            try {
                setPlayerVolume(clamped);
                call.resolve();
            } catch (Throwable t) {
                call.reject(safeMsg(t));
            }
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        mainHandler.post(() -> {
            try {
                call.resolve(stateSnapshot());
            } catch (Throwable t) {
                call.reject(safeMsg(t));
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (player != null) {
                    player.stop();
                    player.clearMediaItems();
                }
                stopLevelUpdates();
                stopStateUpdates();
                Context app = getContext() != null ? getContext().getApplicationContext() : null;
                if (app != null) MusicNotificationService.stop(app);
                call.resolve(stateSnapshot());
            } catch (Throwable t) {
                call.reject(safeMsg(t));
            }
        });
    }

    // ---------- 音频焦点 ----------
    // v4.2.2：音频焦点完全交给 ExoPlayer 自己处理（setAudioAttributes 第二个参数为 true）。
    // 之前这里还有一套手动 requestAudioFocus/放弃焦点/OnAudioFocusChangeListener，
    // 和 ExoPlayer 内置的那套打架：ExoPlayer 把"同一 App 手动申请焦点"误判成被抢焦点，
    // 刚 setPlayWhenReady(true) 就自己暂停——正是"点一下三角瞬间停"的根因。
    // 现在手动这套整体删除；来电、别的 App 抢焦点、 duck 都由 ExoPlayer 按系统规则处理。

    // ---------- 给 TTS 的 duck 接口 ----------

    /** 单词发音开始时调用：压低音乐，并在延时后自动恢复（覆盖多次连续发音） */
    public static void duckForTts() {
        MusicPlayerPlugin p = shared;
        if (p == null) return;
        try {
            p.mainHandler.removeCallbacks(p.restoreVolumeTask);
            p.mainHandler.post(() -> {
                if (p.player != null && p.player.getPlayWhenReady()) p.setPlayerVolume(DUCK_VOLUME);
            });
            p.mainHandler.postDelayed(p.restoreVolumeTask, DUCK_RESTORE_DELAY_MS);
        } catch (Throwable ignored) { }
    }

    /** 单词发音停止 / 异常时调用：立刻恢复音量 */
    public static void restoreVolumeNow() {
        MusicPlayerPlugin p = shared;
        if (p == null) return;
        try {
            p.mainHandler.removeCallbacks(p.restoreVolumeTask);
            p.mainHandler.post(() -> p.setPlayerVolume(NORMAL_VOLUME));
        } catch (Throwable ignored) { }
    }

    private void setPlayerVolume(float v) {
        try {
            if (player != null) player.setVolume(v);
        } catch (Throwable ignored) { }
    }

    // ---------- 真实音频律动（v5.1.0）----------

    private void startLevelUpdates() {
        if (levelUpdatesRunning) return;
        levelUpdatesRunning = true;
        levelAnalyzer.reset();
        mainHandler.removeCallbacks(levelUpdateTask);
        mainHandler.post(levelUpdateTask);
    }

    private void stopLevelUpdates() {
        levelUpdatesRunning = false;
        mainHandler.removeCallbacks(levelUpdateTask);
        levelAnalyzer.reset();
        try {
            JSObject zero = new JSObject();
            zero.put("level", 0d);
            zero.put("bass", 0d);
            zero.put("beat", false);
            notifyListeners(EVENT_LEVEL, zero);
        } catch (Throwable ignored) { }
    }

    private void startStateUpdates() {
        if (stateUpdatesRunning) return;
        stateUpdatesRunning = true;
        mainHandler.removeCallbacks(stateUpdateTask);
        mainHandler.post(stateUpdateTask);
    }

    private void stopStateUpdates() {
        stateUpdatesRunning = false;
        mainHandler.removeCallbacks(stateUpdateTask);
    }

    // ---------- Player 监听 ----------

    @Override
    public void onIsPlayingChanged(boolean isPlaying) {
        if (isPlaying) {
            startLevelUpdates();
            startStateUpdates();
        } else {
            stopLevelUpdates();
            stopStateUpdates();
        }
        notifyListeners(EVENT_STATE, stateSnapshot());
        syncNotification();
    }

    @Override
    public void onMediaItemTransition(MediaItem mediaItem, int reason) {
        notifyListeners(EVENT_STATE, stateSnapshot());
        syncNotification();
    }

    @Override
    public void onPlaybackStateChanged(int playbackState) {
        if (playbackState == Player.STATE_ENDED) {
            notifyListeners(EVENT_STATE, stateSnapshot());
            syncNotification();
        }
    }

    private JSObject stateSnapshot() {
        JSObject o = new JSObject();
        try {
            if (player == null) {
                o.put("playing", false);
                o.put("index", -1);
                o.put("count", 0);
                o.put("position", 0);
                o.put("duration", 0);
                o.put("title", "");
                o.put("mode", playMode);
                if (initError != null) o.put("error", initError);
                return o;
            }
            o.put("playing", player.getPlayWhenReady() && player.getPlaybackState() == Player.STATE_READY);
            o.put("index", player.getCurrentMediaItemIndex());
            o.put("count", player.getMediaItemCount());
            o.put("position", player.getCurrentPosition());
            long dur = player.getDuration();
            o.put("duration", dur == androidx.media3.common.C.TIME_UNSET ? 0L : dur);
            if (player.getCurrentMediaItem() != null
                    && player.getCurrentMediaItem().mediaMetadata != null
                    && player.getCurrentMediaItem().mediaMetadata.title != null) {
                o.put("title", player.getCurrentMediaItem().mediaMetadata.title.toString());
            } else {
                o.put("title", "");
            }
            o.put("mode", playMode);
        } catch (Throwable t) {
            o.put("playing", false);
            o.put("error", safeMsg(t));
        }
        return o;
    }

    private static String safeMsg(Throwable t) {
        String m = t.getMessage();
        return (m == null || m.isEmpty()) ? t.getClass().getSimpleName() : m;
    }

    @Override
    protected void handleOnDestroy() {
        if (shared == this) shared = null;
        stopLevelUpdates();
        stopStateUpdates();
        try {
            mainHandler.removeCallbacks(restoreVolumeTask);
            Context app = getContext() != null ? getContext().getApplicationContext() : null;
            if (app != null) MusicNotificationService.stop(app);
            if (player != null) {
                player.release();
                player = null;
            }
        } catch (Throwable ignored) { }
        super.handleOnDestroy();
    }
}
