package com.kaoyan.memory;

import androidx.media3.common.C;
import androidx.media3.exoplayer.audio.TeeAudioProcessor;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * 从 ExoPlayer 实际输出的 PCM 数据中计算音量、低频与节拍。
 *
 * 数据由 TeeAudioProcessor 原样转发给系统音频输出，这里只读取副本；
 * 不使用 Visualizer、不访问麦克风，因此不需要 RECORD_AUDIO 权限。
 */
public final class MusicLevelAnalyzer implements TeeAudioProcessor.AudioBufferSink {

    public static final class Snapshot {
        public final float level;
        public final float bass;
        public final boolean beat;

        Snapshot(float level, float bass, boolean beat) {
            this.level = level;
            this.bass = bass;
            this.beat = beat;
        }
    }

    private int sampleRateHz = 44100;
    private int channelCount = 2;
    private int encoding = C.ENCODING_PCM_16BIT;
    private float lowPassAlpha = 0.025f;
    private float lowPass;
    private double energy;
    private double bassEnergy;
    private long frameCount;
    private float bassAverage;
    private long lastBeatAtMs;
    private boolean pendingBeat;

    @Override
    public synchronized void flush(int sampleRateHz, int channelCount, int encoding) {
        this.sampleRateHz = Math.max(1, sampleRateHz);
        this.channelCount = Math.max(1, channelCount);
        this.encoding = encoding;
        this.lowPassAlpha = (float) (1.0 - Math.exp(-2.0 * Math.PI * 180.0 / this.sampleRateHz));
        resetWindowLocked();
        lowPass = 0f;
    }

    @Override
    public synchronized void handleBuffer(ByteBuffer buffer) {
        if (buffer == null || !buffer.hasRemaining()) return;
        final int bytesPerSample;
        if (encoding == C.ENCODING_PCM_16BIT) {
            bytesPerSample = 2;
        } else if (encoding == C.ENCODING_PCM_FLOAT) {
            bytesPerSample = 4;
        } else {
            // Tee 仍会把数据原样送去播放；不认识的编码只是不做分析。
            return;
        }
        final int frameBytes = bytesPerSample * channelCount;
        if (frameBytes <= 0) return;

        ByteBuffer input = buffer.asReadOnlyBuffer().order(ByteOrder.LITTLE_ENDIAN);
        while (input.remaining() >= frameBytes) {
            float mixed = 0f;
            for (int channel = 0; channel < channelCount; channel++) {
                float sample;
                if (bytesPerSample == 2) {
                    sample = input.getShort() / 32768f;
                } else {
                    sample = input.getFloat();
                    if (!Float.isFinite(sample)) sample = 0f;
                }
                mixed += Math.max(-1f, Math.min(1f, sample));
            }
            mixed /= channelCount;
            lowPass += lowPassAlpha * (mixed - lowPass);
            energy += mixed * mixed;
            bassEnergy += lowPass * lowPass;
            frameCount++;
        }

        // 暂停期间若仍有残留缓冲，避免下一次快照读到很久以前的窗口。
        if (frameCount > sampleRateHz * 2L) resetWindowLocked();
    }

    /** 取走当前约 50ms 的分析窗口；播放线程与主线程通过 synchronized 安全交接。 */
    public synchronized Snapshot snapshot() {
        if (frameCount == 0) {
            pendingBeat = false;
            return new Snapshot(0f, 0f, false);
        }
        float rms = (float) Math.sqrt(energy / frameCount);
        float bassRms = (float) Math.sqrt(bassEnergy / frameCount);
        float level = clamp(rms * 4.2f);
        float bass = clamp(bassRms * 5.2f);

        bassAverage = bassAverage <= 0f ? bass : bassAverage * 0.88f + bass * 0.12f;
        long now = System.nanoTime() / 1_000_000L;
        if (bass > 0.16f && bass > bassAverage * 1.18f && now - lastBeatAtMs > 160L) {
            pendingBeat = true;
            lastBeatAtMs = now;
        }
        Snapshot result = new Snapshot(level, bass, pendingBeat);
        pendingBeat = false;
        resetWindowLocked();
        return result;
    }

    public synchronized void reset() {
        resetWindowLocked();
        lowPass = 0f;
        bassAverage = 0f;
        lastBeatAtMs = 0L;
        pendingBeat = false;
    }

    private void resetWindowLocked() {
        energy = 0d;
        bassEnergy = 0d;
        frameCount = 0L;
    }

    private static float clamp(float value) {
        return Math.max(0f, Math.min(1f, value));
    }
}
