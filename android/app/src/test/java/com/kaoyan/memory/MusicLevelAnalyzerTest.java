package com.kaoyan.memory;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import androidx.media3.common.C;

import org.junit.Test;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class MusicLevelAnalyzerTest {

    @Test
    public void silenceProducesNoMotion() {
        MusicLevelAnalyzer analyzer = new MusicLevelAnalyzer();
        analyzer.flush(44100, 1, C.ENCODING_PCM_16BIT);
        ByteBuffer input = ByteBuffer.allocate(4096).order(ByteOrder.LITTLE_ENDIAN);
        while (input.hasRemaining()) input.putShort((short) 0);
        input.flip();
        analyzer.handleBuffer(input);

        MusicLevelAnalyzer.Snapshot sample = analyzer.snapshot();
        assertEquals(0f, sample.level, 0.0001f);
        assertEquals(0f, sample.bass, 0.0001f);
    }

    @Test
    public void audiblePcmProducesRealLevelAndBass() {
        MusicLevelAnalyzer analyzer = new MusicLevelAnalyzer();
        analyzer.flush(44100, 1, C.ENCODING_PCM_16BIT);
        ByteBuffer input = ByteBuffer.allocate(44100 * 2).order(ByteOrder.LITTLE_ENDIAN);
        for (int index = 0; index < 44100; index++) {
            short value = (short) (Math.sin(index * 2 * Math.PI * 100 / 44100) * 18000);
            input.putShort(value);
        }
        input.flip();
        analyzer.handleBuffer(input);

        MusicLevelAnalyzer.Snapshot sample = analyzer.snapshot();
        assertTrue(sample.level > 0.8f);
        assertTrue(sample.bass > 0.3f);
    }

    @Test
    public void analysisDoesNotConsumeOriginalBuffer() {
        MusicLevelAnalyzer analyzer = new MusicLevelAnalyzer();
        analyzer.flush(44100, 1, C.ENCODING_PCM_16BIT);
        ByteBuffer input = ByteBuffer.allocate(128).order(ByteOrder.LITTLE_ENDIAN);
        while (input.hasRemaining()) input.putShort((short) 12000);
        input.flip();
        int originalPosition = input.position();
        analyzer.handleBuffer(input);
        assertEquals(originalPosition, input.position());
        assertTrue(analyzer.snapshot().level > 0f);
    }
}
