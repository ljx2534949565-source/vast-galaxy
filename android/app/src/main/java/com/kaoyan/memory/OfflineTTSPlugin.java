package com.kaoyan.memory;

import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "OfflineTTS")
public class OfflineTTSPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech textToSpeech;
    private boolean ready = false;
    private boolean initFailed = false;
    private PluginCall pendingCall;
    /**
     * 距离上次播放超过这么久，就认为音频通道已经被系统收回去了。
     *
     * 「每个界面第一次点喇叭都被截掉半句」就是这个原因：闲置后 AudioTrack 与
     * 音频焦点都释放了，第一句的开头几百毫秒花在重建通道上，直接被吞掉。
     * 连续点的时候通道还热着，所以第二句起总是完整的。
     */
    private static final long IDLE_GAP_MS = 1200;
    /** 先排一段静音把通道推开，正文跟在后面排队，开头就不会被吃 */
    private static final long WARMUP_MS = 240;
    /** 单次 speak 的文本上限：过长部分系统直接拒播或截断，按标点切段排队 */
    private static final int MAX_UTTERANCE = 180;
    private long lastSpeakAt = 0;

    @Override
    public void load() {
        initialize();
    }

    private synchronized void initialize() {
        if (textToSpeech == null) {
            textToSpeech = new TextToSpeech(getContext(), this);
        }
    }

    @Override
    public synchronized void onInit(int status) {
        if (status != TextToSpeech.SUCCESS || textToSpeech == null) {
            initFailed = true;
            rejectPending("系统文字转语音引擎初始化失败", "NOT_AVAILABLE");
            if (textToSpeech != null) {
                textToSpeech.shutdown();
                textToSpeech = null;
            }
            return;
        }
        // v3.9.14：不再锁死英文。初始化只看引擎本身可用；具体语言在朗读时按文本选。
        // 但至少要能读一种语言，否则英文单词这项核心功能就没了 —— 仍以英文可用为底线。
        int availability = textToSpeech.isLanguageAvailable(Locale.US);
        if (availability < 0) {
            initFailed = true;
            rejectPending("请在系统设置中安装英文离线语音", "ERROR_LANGUAGE_MISSING");
            textToSpeech.shutdown();
            textToSpeech = null;
            return;
        }
        textToSpeech.setLanguage(Locale.US);
        initFailed = false;
        ready = true;
        if (pendingCall != null) {
            PluginCall call = pendingCall;
            pendingCall = null;
            performSpeak(call);
        }
    }

    private void rejectPending(String message, String code) {
        if (pendingCall != null) {
            pendingCall.reject(message, code);
            pendingCall = null;
        }
    }

    @PluginMethod
    public synchronized void speak(PluginCall call) {
        if (initFailed) {
            initFailed = false;
            ready = false;
            pendingCall = call;
            initialize();
            return;
        }
        if (!ready) {
            if (pendingCall != null) pendingCall.reject("另一个发音正在等待初始化");
            pendingCall = call;
            initialize();
            return;
        }
        performSpeak(call);
    }

    /** 文本里有没有中日韩表意文字：决定用中文语音读还是英文语音读 */
    private static boolean hasCJK(String text) {
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= 0x4e00 && c <= 0x9fff) return true;   // CJK 统一汉字
            if (c >= 0x3400 && c <= 0x4dbf) return true;   // 扩展 A
        }
        return false;
    }

    /**
     * 按标点把长文本切成多段，每段不超过 MAX_UTTERANCE。
     * 中英都按句读标点切；找不到标点时按长度硬切，绝不丢字。
     */
    private static List<String> splitText(String text) {
        List<String> parts = new ArrayList<>();
        String remaining = text.trim();
        while (remaining.length() > MAX_UTTERANCE) {
            // 在窗口内从后往前找一个合适的断点，优先句号/问号/叹号/分号，其次逗号/换行/空格
            int window = MAX_UTTERANCE;
            int cut = -1;
            char[] strong = { '。', '！', '？', '!', '?', '；', ';', '\n' };
            char[] weak = { '，', ',', '、', ' ' };
            for (char p : strong) {
                cut = remaining.lastIndexOf(p, window - 1);
                if (cut > MAX_UTTERANCE / 2) break;
            }
            if (cut <= MAX_UTTERANCE / 2) {
                for (char p : weak) {
                    cut = remaining.lastIndexOf(p, window - 1);
                    if (cut > MAX_UTTERANCE / 2) break;
                }
            }
            if (cut <= MAX_UTTERANCE / 2) cut = window; // 没标点就硬切
            String piece = remaining.substring(0, cut + 1).trim();
            if (!piece.isEmpty()) parts.add(piece);
            remaining = remaining.substring(cut + 1).trim();
        }
        if (!remaining.isEmpty()) parts.add(remaining);
        if (parts.isEmpty()) parts.add(text);
        return parts;
    }

    private void performSpeak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.reject("发音文本不能为空");
            return;
        }

        // v4.2.0：背景音乐正在播时，发音前先把音乐压低，读完由 MusicPlayerPlugin 自动恢复。
        // 用 try-catch 包住，duck 出任何问题都不影响单词发音这条核心链路。
        try {
            MusicPlayerPlugin.duckForTts();
        } catch (Throwable ignored) { }

        // 选语言：含中文就用中文语音（前提是系统装了中文数据包），否则英文。
        Locale chosen = Locale.US;
        if (hasCJK(text)) {
            try {
                if (textToSpeech.isLanguageAvailable(Locale.CHINA) >= 0) {
                    chosen = Locale.CHINA;
                }
            } catch (Throwable ignored) {
                // 拿不到中文可用性就退回英文，不让朗读整体失败
            }
        }
        int langResult = textToSpeech.setLanguage(chosen);
        if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            // 选中的语言不可用，退回英文（英文在 onInit 已确认可用）
            chosen = Locale.US;
            textToSpeech.setLanguage(chosen);
        }

        long now = SystemClock.elapsedRealtime();
        boolean cold = lastSpeakAt == 0 || now - lastSpeakAt > IDLE_GAP_MS;
        List<String> parts = splitText(text);

        int result = TextToSpeech.SUCCESS;
        if (cold) {
            // 冷通道：静音 240ms 先把音频流打通，正文用 QUEUE_ADD 接在它后面。
            // 代价只是第一次发音晚 0.24 秒出声，换来整句完整。
            textToSpeech.playSilentUtterance(WARMUP_MS, TextToSpeech.QUEUE_FLUSH, "kaoyan-warmup");
            for (int i = 0; i < parts.size(); i++) {
                result = textToSpeech.speak(parts.get(i), TextToSpeech.QUEUE_ADD, null, "kaoyan-answer-" + i);
                if (result == TextToSpeech.ERROR) break;
            }
        } else {
            // 通道还热着：第一句 FLUSH 打断上一句，其余排队，保持连续点击跟手感
            for (int i = 0; i < parts.size(); i++) {
                int queue = i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;
                result = textToSpeech.speak(parts.get(i), queue, null, "kaoyan-answer-" + i);
                if (result == TextToSpeech.ERROR) break;
            }
        }
        lastSpeakAt = now;
        if (result == TextToSpeech.ERROR) {
            call.reject("系统 TTS 无法播放", "NOT_AVAILABLE");
        } else {
            call.resolve(new JSObject());
        }
    }

    @PluginMethod
    public synchronized void stop(PluginCall call) {
        if (textToSpeech != null) textToSpeech.stop();
        // 主动停过就别假设通道还热着，下一句重新预热
        lastSpeakAt = 0;
        // v4.2.0：发音被打断，立刻把背景音乐音量恢复正常
        try {
            MusicPlayerPlugin.restoreVolumeNow();
        } catch (Throwable ignored) { }
        call.resolve();
    }

    @Override
    protected synchronized void handleOnDestroy() {
        ready = false;
        rejectPending("页面已关闭", "CANCELLED");
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }
}
