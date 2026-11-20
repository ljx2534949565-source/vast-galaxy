package com.kaoyan.memory;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * 进度跳转的边界：负数归零、未知时长不 clamp、超长不越过当前曲结尾；
 * 以及 JS 数字进入原生后的类型解析（Integer / Long / Double 都要认）。
 */
public class MusicPlayerSeekTest {
    @Test
    public void negativePositionSeeksToStart() {
        assertEquals(0L, MusicPlayerPlugin.clampSeekPosition(-500L, 20000L));
    }

    @Test
    public void middlePositionIsPreserved() {
        assertEquals(12345L, MusicPlayerPlugin.clampSeekPosition(12345L, 20000L));
    }

    @Test
    public void positionBeyondDurationStopsAtDuration() {
        assertEquals(20000L, MusicPlayerPlugin.clampSeekPosition(25000L, 20000L));
    }

    @Test
    public void unknownDurationKeepsRequestedPosition() {
        assertEquals(12345L, MusicPlayerPlugin.clampSeekPosition(12345L, 0L));
    }

    /** JSON 里的整数是 Integer，Capacitor 的 getLong 不认，必须由这里解析。 */
    @Test
    public void readsIntegerPosition() {
        assertEquals(44250L, MusicPlayerPlugin.parsePositionValue(Integer.valueOf(44250)));
    }

    @Test
    public void readsLongPosition() {
        assertEquals(44250L, MusicPlayerPlugin.parsePositionValue(Long.valueOf(44250L)));
    }

    @Test
    public void readsDoublePosition() {
        assertEquals(44251L, MusicPlayerPlugin.parsePositionValue(Double.valueOf(44250.6)));
    }

    @Test
    public void readsNumericStringPosition() {
        assertEquals(44250L, MusicPlayerPlugin.parsePositionValue(" 44250 "));
    }

    @Test
    public void missingPositionFallsBackToZero() {
        assertEquals(0L, MusicPlayerPlugin.parsePositionValue(null));
    }

    @Test
    public void invalidStringFallsBackToZero() {
        assertEquals(0L, MusicPlayerPlugin.parsePositionValue("not-a-number"));
    }

    @Test
    public void nonFinitePositionFallsBackToZero() {
        assertEquals(0L, MusicPlayerPlugin.parsePositionValue(Double.NaN));
        assertEquals(0L, MusicPlayerPlugin.parsePositionValue(Double.POSITIVE_INFINITY));
    }

    @Test
    public void negativePositionIsParsedThenClamped() {
        assertEquals(-500L, MusicPlayerPlugin.parsePositionValue(Integer.valueOf(-500)));
    }
}
