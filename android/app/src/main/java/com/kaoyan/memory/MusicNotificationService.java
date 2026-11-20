package com.kaoyan.memory;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

/**
 * v4.9.0：音乐播放的前台服务 + MediaSession。
 *
 * 职责：
 * 1. 前台服务把播放通知常驻在通知栏——退到后台 / 锁屏后系统不会杀掉播放。
 * 2. MediaSessionCompat 把播放状态交给系统，锁屏界面、蓝牙耳机、系统媒体面板
 *    都能看到"正在播放"并控制播放/暂停/上一首/下一首。
 * 3. MediaStyle 通知上的按钮、锁屏上的按钮被点击后，通过 MusicPlayerPlugin 的
 *    静态桥接方法直接操控 ExoPlayer——播放内核仍是原来的插件，这里只加一层壳。
 *
 * 稳定性：整个类所有入口都包 try-catch。通知/媒体会话出任何问题，最多是没有通知，
 * 绝不能拖垮播放本身，更不能让 App 启动崩溃。
 */
public class MusicNotificationService extends Service {

    private static final String TAG = "MusicNotification";
    private static final String CHANNEL_ID = "vast_galaxy_music_playback";
    private static final int NOTIFICATION_ID = 40901;

    /** 通知按钮点击后由 onStartCommand 识别的 action */
    public static final String ACTION_PLAY = "com.kaoyan.memory.music.PLAY";
    public static final String ACTION_PAUSE = "com.kaoyan.memory.music.PAUSE";
    public static final String ACTION_NEXT = "com.kaoyan.memory.music.NEXT";
    public static final String ACTION_PREV = "com.kaoyan.memory.music.PREV";
    public static final String ACTION_STOP = "com.kaoyan.memory.music.STOP";

    private MediaSessionCompat mediaSession;
    private boolean sessionReady = false;

    /** 最近一次同步的状态，onCreate 之后立刻据此画一版通知，避免锁屏先空一帧 */
    private static volatile String lastTitle = "";
    private static volatile boolean lastPlaying = false;

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            createChannel();
            initSession();
        } catch (Throwable ignored) { }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (intent != null) {
                String action = intent.getAction();
                if (action != null) {
                    handleAction(action);
                } else {
                    // 正常同步：带上插件给的最新状态，立刻画通知（满足 startForeground 时限）
                    String t = intent.getStringExtra("title");
                    boolean p = intent.getBooleanExtra("playing", false);
                    applyState(t, p);
                }
            } else {
                // 系统重建服务：用记住的状态恢复通知
                applyState(lastTitle, lastPlaying);
            }
        } catch (Throwable ignored) { }
        // 前台服务被杀后不自动重建：用户点停止 / 清空曲库后通知不该自己回来
        return START_NOT_STICKY;
    }

    /** 处理通知按钮 / 锁屏按钮点出来的 action */
    private void handleAction(String action) {
        switch (action) {
            case ACTION_PLAY:
                MusicPlayerPlugin.controlFromNotification("play");
                break;
            case ACTION_PAUSE:
                MusicPlayerPlugin.controlFromNotification("pause");
                break;
            case ACTION_NEXT:
                MusicPlayerPlugin.controlFromNotification("next");
                break;
            case ACTION_PREV:
                MusicPlayerPlugin.controlFromNotification("prev");
                break;
            case ACTION_STOP:
                MusicPlayerPlugin.controlFromNotification("stop");
                stopSelf();
                break;
            default:
                break;
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "音乐播放", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("本地音乐播放控制（上一首 / 播放暂停 / 下一首）");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    private void initSession() {
        // 点通知回到 App 的音乐页
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flag |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent openPi = PendingIntent.getActivity(this, 0, open, flag);

        mediaSession = new MediaSessionCompat(this, "VastGalaxyMusic");
        mediaSession.setSessionActivity(openPi);
        mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { MusicPlayerPlugin.controlFromNotification("play"); }
            @Override public void onPause() { MusicPlayerPlugin.controlFromNotification("pause"); }
            @Override public void onSkipToNext() { MusicPlayerPlugin.controlFromNotification("next"); }
            @Override public void onSkipToPrevious() { MusicPlayerPlugin.controlFromNotification("prev"); }
            @Override public void onStop() { MusicPlayerPlugin.controlFromNotification("stop"); stopSelf(); }
        });
        mediaSession.setActive(true);
        sessionReady = true;
    }

    /**
     * 由插件在播放状态变化时调用，刷新通知 + 媒体会话。
     * 可重复调用；只有真正播放时才 startForeground，暂停时通知仍在但不再是 ongoing。
     */
    private void applyState(String title, boolean playing) {
        lastTitle = title == null ? "" : title;
        lastPlaying = playing;
        try {
            buildAndShow(lastTitle, playing);
        } catch (Throwable ignored) { }
    }

    private void buildAndShow(String title, boolean playing) {
        if (!sessionReady || mediaSession == null) return;
        String shown = (title == null || title.isEmpty()) ? "本地音乐" : title;

        // 元数据 → 锁屏 / 系统媒体面板显示的曲名
        try {
            MediaMetadataCompat meta = new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, shown)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Vast Galaxy · 本地播放")
                    .build();
            mediaSession.setMetadata(meta);
        } catch (Throwable ignored) { }

        // 播放状态 → 锁屏按钮可点、图标跟随播放/暂停
        try {
            long actions = PlaybackStateCompat.ACTION_PLAY
                    | PlaybackStateCompat.ACTION_PAUSE
                    | PlaybackStateCompat.ACTION_PLAY_PAUSE
                    | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                    | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackStateCompat.ACTION_STOP;
            int state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
            PlaybackStateCompat ps = new PlaybackStateCompat.Builder()
                    .setActions(actions)
                    .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                    .build();
            mediaSession.setPlaybackState(ps);
        } catch (Throwable ignored) { }

        Notification notification = buildNotification(shown, playing);
        // 安卓 14 (API 34) 起：媒体类前台服务必须带 foregroundServiceType，
        // 否则抛 MissingForegroundServiceTypeException 直接崩。三参数版本从 29 起可用。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification(String title, boolean playing) {
        Context c = this;
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlag |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent openPi = PendingIntent.getActivity(c, 11, open, piFlag);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notif_music)
                .setContentTitle(title)
                .setContentText(playing ? "正在播放 · Vast Galaxy" : "已暂停 · Vast Galaxy")
                .setContentIntent(openPi)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        // 收起态显示 上一首 / 播放暂停 / 下一首 三个按钮
        b.addAction(new NotificationCompat.Action(R.drawable.ic_notif_prev, "上一首", actionPi(ACTION_PREV, 21)));
        b.addAction(playing
                ? new NotificationCompat.Action(R.drawable.ic_notif_pause, "暂停", actionPi(ACTION_PAUSE, 22))
                : new NotificationCompat.Action(R.drawable.ic_notif_play, "播放", actionPi(ACTION_PLAY, 22)));
        b.addAction(new NotificationCompat.Action(R.drawable.ic_notif_next, "下一首", actionPi(ACTION_NEXT, 23)));

        MediaStyle style = new MediaStyle()
                .setShowActionsInCompactView(0, 1, 2);
        if (mediaSession != null) style.setMediaSession(mediaSession.getSessionToken());
        b.setStyle(style);
        return b.build();
    }

    private PendingIntent actionPi(String action, int reqCode) {
        Intent i = new Intent(this, MusicNotificationService.class);
        i.setAction(action);
        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flag |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, reqCode, i, flag);
    }

    /** 插件调用：同步状态到通知 / 锁屏 */
    public static void sync(Context context, String title, boolean playing) {
        try {
            lastTitle = title == null ? "" : title;
            lastPlaying = playing;
            Intent i = new Intent(context, MusicNotificationService.class);
            i.putExtra("title", lastTitle);
            i.putExtra("playing", playing);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(i);
            } else {
                context.startService(i);
            }
        } catch (Throwable ignored) { }
    }

    /** 插件调用：停止播放时把通知也撤掉 */
    public static void stop(Context context) {
        try {
            lastTitle = "";
            lastPlaying = false;
            context.stopService(new Intent(context, MusicNotificationService.class));
        } catch (Throwable ignored) { }
    }

    @Override
    public void onDestroy() {
        try {
            if (mediaSession != null) {
                mediaSession.setActive(false);
                mediaSession.release();
                mediaSession = null;
            }
            sessionReady = false;
        } catch (Throwable ignored) { }
        super.onDestroy();
    }
}
