package com.kaoyan.memory;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 答题触感反馈，不依赖网络或第三方 SDK。
 *
 * v2.6.0 按用户手感把两套波形对调：
 * - 答对：三下短促「哒-哒-哒」（28/62/28/62/34），轻快、向上
 * - 答错：45ms「哒」→ 55ms 停顿 → 70ms 加重「哒」，一顿一沉，像盖章否定
 * 另有 tap（极短点按，给设置里的开关）和 celebrate（满分通关的连击 + 长震）。
 *
 * 有振幅控制的马达用 amplitude 波形；转子马达自动退化为纯时长波形。
 */
@CapacitorPlugin(name = "StudyFeedback")
public class StudyFeedbackPlugin extends Plugin {

    private static final long[] CORRECT_TIMINGS = {0, 28, 62, 28, 62, 34};
    private static final int[] CORRECT_AMPLITUDES = {0, 210, 0, 215, 0, 250};

    private static final long[] WRONG_TIMINGS = {0, 45, 55, 70};
    private static final int[] WRONG_AMPLITUDES = {0, 190, 0, 255};

    private static final long[] TAP_TIMINGS = {0, 14};
    private static final int[] TAP_AMPLITUDES = {0, 130};

    private static final long[] CELEBRATE_TIMINGS = {0, 30, 45, 30, 45, 30, 45, 30, 130, 90};
    private static final int[] CELEBRATE_AMPLITUDES = {0, 150, 0, 190, 0, 220, 0, 255, 0, 255};

    /* ── 答题音效（v3.10）──
       SoundPool 专为短提示音设计：常驻内存、延迟极低，比 MediaPlayer 每次 new 稳。
       音效放 res/raw，JS 传资源名（不带扩展名），这里用反射查 raw.<name> 拿 id，
       避免为四个文件写死四段 id 判断；查不到就静默跳过。 */
    private SoundPool soundPool;

    private SoundPool getSoundPool() {
        if (soundPool == null) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            soundPool = new SoundPool.Builder().setMaxStreams(2).setAudioAttributes(attrs).build();
        }
        return soundPool;
    }

    @PluginMethod
    public void sound(PluginCall call) {
        String name = call.getString("name", "");
        if (name == null || name.isEmpty() || !name.matches("[a-z0-9_]+")) {
            call.resolve();
            return;
        }
        Context context = getContext();
        if (context == null) {
            call.resolve();
            return;
        }
        int resId = context.getResources().getIdentifier(name, "raw", context.getPackageName());
        if (resId == 0) {
            call.resolve();
            return;
        }
        try {
            int soundId = getSoundPool().load(context, resId, 1);
            // load 是异步的，setOnLoadCompleteListener 里再播，避免首声没出来
            getSoundPool().setOnLoadCompleteListener(new SoundPool.OnLoadCompleteListener() {
                @Override
                public void onLoadComplete(SoundPool pool, int sampleId, int status) {
                    if (status == 0 && sampleId == soundId) {
                        // 素材峰值偏低（约 9000/32767），用一个略大于 1 的增益补偿；上限 1
                        pool.play(soundId, 1.0f, 1.0f, 1, 0, 1.0f);
                    }
                }
            });
        } catch (Exception error) {
            // 音效是润色，失败不影响答题
        }
        JSObject result = new JSObject();
        result.put("played", true);
        call.resolve(result);
    }

    @PluginMethod
    public void correct(PluginCall call) {
        play(CORRECT_TIMINGS, CORRECT_AMPLITUDES, call);
    }

    @PluginMethod
    public void wrong(PluginCall call) {
        play(WRONG_TIMINGS, WRONG_AMPLITUDES, call);
    }

    @PluginMethod
    public void tap(PluginCall call) {
        play(TAP_TIMINGS, TAP_AMPLITUDES, call);
    }

    @PluginMethod
    public void celebrate(PluginCall call) {
        play(CELEBRATE_TIMINGS, CELEBRATE_AMPLITUDES, call);
    }

    private void play(long[] timings, int[] amplitudes, PluginCall call) {
        Vibrator vibrator = resolveVibrator();
        if (vibrator == null || !vibrator.hasVibrator()) {
            call.reject("设备没有可用的振动马达", "NO_VIBRATOR");
            return;
        }

        try {
            boolean precise = vibrate(vibrator, timings, amplitudes);
            JSObject result = new JSObject();
            result.put("mode", precise ? "amplitude" : "timing");
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("系统未授予震动权限", "VIBRATE_DENIED", error);
        } catch (Exception error) {
            call.reject("震动调用失败", "VIBRATE_FAILED", error);
        }
    }

    /** Android 12 起优先走 VibratorManager，取到的是用户当前选中的默认马达。 */
    private Vibrator resolveVibrator() {
        Context context = getContext();
        if (context == null) return null;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager =
                (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (manager != null) {
                Vibrator fromManager = manager.getDefaultVibrator();
                if (fromManager != null) return fromManager;
            }
        }

        Object service = context.getSystemService(Context.VIBRATOR_SERVICE);
        return service instanceof Vibrator ? (Vibrator) service : null;
    }

    /** @return true 表示用上了振幅波形，false 表示退化为纯时长波形。 */
    private boolean vibrate(Vibrator vibrator, long[] timings, int[] amplitudes) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (vibrator.hasAmplitudeControl()) {
                vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1));
                return true;
            }
            vibrator.vibrate(VibrationEffect.createWaveform(timings, -1));
            return false;
        }
        vibrator.vibrate(timings, -1);
        return false;
    }

    @Override
    public void handleOnDestroy() {
        if (soundPool != null) {
            soundPool.release();
            soundPool = null;
        }
        super.handleOnDestroy();
    }
}
