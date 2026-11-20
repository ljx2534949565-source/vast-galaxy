import { describe, expect, it } from 'vitest';
import {
  ACCENT_THEMES,
  accentCssVariables,
  accentThemePalette,
  normalizeAccentTheme
} from '@/utils/accentTheme';

describe('全局渐变主题色', () => {
  it('提供十二色水彩笔色序，每套都是不同的三色渐变且没有灰色', () => {
    expect(ACCENT_THEMES).toHaveLength(12);
    expect(ACCENT_THEMES.map((theme) => theme.label)).toEqual([
      '朱砂红', '落日橙', '荧光黄', '嫩芽绿', '青野绿', '孔雀青',
      '晴空蓝', '海盐蓝', '星云紫', '品红', '蔷薇粉', '可可棕'
    ]);
    expect(ACCENT_THEMES.map((theme) => theme.name as string)).not.toContain('slate');
    const signatures = ACCENT_THEMES.map((theme) =>
      [theme.light.accent, theme.light.accent2, theme.light.accent3].join('-')
    );
    expect(new Set(signatures).size).toBe(12);
    for (const theme of ACCENT_THEMES) {
      expect(new Set([theme.light.accent, theme.light.accent2, theme.light.accent3]).size).toBe(3);
      expect(new Set([theme.dark.accent, theme.dark.accent2, theme.dark.accent3]).size).toBe(3);
    }
  });

  it('旧存档、已删除的灰色和脏值回到星云紫', () => {
    expect(normalizeAccentTheme(undefined)).toBe('violet');
    expect(normalizeAccentTheme('not-a-theme')).toBe('violet');
    expect(normalizeAccentTheme('slate')).toBe('violet');
    expect(normalizeAccentTheme('ocean')).toBe('ocean');
    expect(normalizeAccentTheme('lemon')).toBe('lemon');
  });

  it('深色模式使用同色系的高亮渐变，不是沿用浅色单色', () => {
    const light = accentThemePalette('forest', 'light');
    const dark = accentThemePalette('forest', 'dark');
    expect(dark.accent).not.toBe(light.accent);
    expect(dark.accent2).not.toBe(light.accent2);
    expect(dark.contrast).not.toBe('#FFFFFF');
  });

  it('按钮渐变、浅选中渐变、滑轨和光晕一起更新', () => {
    const variables = accentCssVariables('ocean', 'light');
    expect(variables['--accent']).toBe('#3578E5');
    expect(variables['--accent-2']).toBe('#54B5D3');
    expect(variables['--accent-rgb']).toBe('53, 120, 229');
    expect(variables['--accent-gradient']).toContain('linear-gradient');
    expect(variables['--accent-gradient-soft']).toContain('84, 181, 211');
    expect(variables['--accent-track']).toContain('#55C8C0');
    expect(variables['--glow']).toBe('rgba(53, 120, 229, .24)');
  });

  it('荧光浅黄按钮保持清亮，文字使用独立的可读同色系', () => {
    const palette = accentThemePalette('lemon', 'light');
    const variables = accentCssVariables('lemon', 'light');
    expect(palette.accent).toBe('#DFF75A');
    expect(palette.accent2).toBe('#F0FA8B');
    expect(palette.contrast).toBe('#283300');
    expect(variables['--accent-contrast']).toBe('#283300');
    expect(variables['--accent-ink']).toBe('#667500');
    expect(variables['--accent-ink']).not.toBe(variables['--accent']);
    expect(accentCssVariables('ocean', 'light')['--accent-ink']).toBe('#3578E5');
    expect(accentThemePalette('sprout', 'light').contrast).toBe('#17220C');
  });
});
