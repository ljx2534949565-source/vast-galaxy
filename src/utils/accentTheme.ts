export type AccentThemeName =
  | 'violet' | 'ocean' | 'rose' | 'forest' | 'sunset'
  | 'cinnabar' | 'lemon' | 'sprout' | 'teal' | 'sky' | 'magenta' | 'cocoa';
export type AccentResolved = 'light' | 'dark';

export interface AccentPalette {
  accent: string;
  accent2: string;
  accent3: string;
  contrast: string;
  /** 文字、图标等需要可读性的场景；缺省时与 accent 相同。 */
  ink?: string;
}

export interface AccentTheme {
  name: AccentThemeName;
  label: string;
  light: AccentPalette;
  dark: AccentPalette;
}

/** 十二色水彩笔色序；每套都是三色渐变家族，并分别适配浅色和深色界面。 */
export const ACCENT_THEMES: readonly AccentTheme[] = [
  {
    name: 'cinnabar', label: '朱砂红',
    light: { accent: '#C9424B', accent2: '#E86A5F', accent3: '#E89A7A', contrast: '#FFFFFF' },
    dark: { accent: '#FF8B91', accent2: '#FF9B82', accent3: '#FFC0A1', contrast: '#341316' }
  },
  {
    name: 'sunset', label: '落日橙',
    light: { accent: '#C75B39', accent2: '#E6A13C', accent3: '#DB7C63', contrast: '#FFFFFF' },
    dark: { accent: '#FF9E72', accent2: '#FFD080', accent3: '#FFB08D', contrast: '#321C12' }
  },
  {
    name: 'lemon', label: '荧光黄',
    light: { accent: '#DFF75A', accent2: '#F0FA8B', accent3: '#F7FCB0', contrast: '#283300', ink: '#667500' },
    dark: { accent: '#E8FF7A', accent2: '#F1FF9E', accent3: '#F7FFC0', contrast: '#263000', ink: '#E8FF7A' }
  },
  {
    name: 'sprout', label: '嫩芽绿',
    light: { accent: '#6C8F22', accent2: '#9DB63E', accent3: '#C0CF68', contrast: '#17220C' },
    dark: { accent: '#C2E67C', accent2: '#D8ED9D', accent3: '#E4F2B7', contrast: '#1E2A12' }
  },
  {
    name: 'forest', label: '青野绿',
    light: { accent: '#16866F', accent2: '#67B76F', accent3: '#5CB9B4', contrast: '#FFFFFF' },
    dark: { accent: '#62D6B4', accent2: '#9BDD8C', accent3: '#75DAD2', contrast: '#102A24' }
  },
  {
    name: 'teal', label: '孔雀青',
    light: { accent: '#087F83', accent2: '#19A7A0', accent3: '#50C1B3', contrast: '#FFFFFF' },
    dark: { accent: '#63D8D4', accent2: '#8BE6DB', accent3: '#A3EADD', contrast: '#0D2B2A' }
  },
  {
    name: 'sky', label: '晴空蓝',
    light: { accent: '#1673B5', accent2: '#3D9BD2', accent3: '#7FC2E2', contrast: '#FFFFFF' },
    dark: { accent: '#7FCBFF', accent2: '#A0DFFF', accent3: '#B9E7F5', contrast: '#102936' }
  },
  {
    name: 'ocean', label: '海盐蓝',
    light: { accent: '#3578E5', accent2: '#54B5D3', accent3: '#55C8C0', contrast: '#FFFFFF' },
    dark: { accent: '#78A9FF', accent2: '#76D5E5', accent3: '#7DE2D2', contrast: '#102033' }
  },
  {
    name: 'violet', label: '星云紫',
    light: { accent: '#5D62D9', accent2: '#8E72DB', accent3: '#5BBECF', contrast: '#FFFFFF' },
    dark: { accent: '#9A9DF7', accent2: '#B08DEB', accent3: '#77D6DF', contrast: '#111827' }
  },
  {
    name: 'magenta', label: '品红',
    light: { accent: '#B62B83', accent2: '#DE5CA5', accent3: '#E893B9', contrast: '#FFFFFF' },
    dark: { accent: '#FF8BCD', accent2: '#FFA9D7', accent3: '#FFC0DF', contrast: '#351027' }
  },
  {
    name: 'rose', label: '蔷薇粉',
    light: { accent: '#C84D7D', accent2: '#EE8A83', accent3: '#E2A05C', contrast: '#FFFFFF' },
    dark: { accent: '#FF8EB6', accent2: '#FFA69A', accent3: '#FFC38F', contrast: '#321624' }
  },
  {
    name: 'cocoa', label: '可可棕',
    light: { accent: '#80543D', accent2: '#AA7653', accent3: '#C99B72', contrast: '#FFFFFF' },
    dark: { accent: '#D7AA85', accent2: '#E7C39F', accent3: '#EDD1B3', contrast: '#2C1B13' }
  }
] as const;

export const ACCENT_THEME_DEFAULT: AccentThemeName = 'violet';

export function normalizeAccentTheme(value: unknown): AccentThemeName {
  return ACCENT_THEMES.some((theme) => theme.name === value)
    ? value as AccentThemeName
    : ACCENT_THEME_DEFAULT;
}

export function accentThemePalette(
  name: unknown,
  resolved: AccentResolved = 'light'
): AccentPalette {
  const normalized = normalizeAccentTheme(name);
  const theme = ACCENT_THEMES.find((item) => item.name === normalized) ?? ACCENT_THEMES[0];
  return theme[resolved];
}

function rgb(hex: string): string {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(clean.slice(offset, offset + 2), 16)).join(', ');
}

/** 同时提供 hex、RGB 通道和完整渐变，CSS 中可以保留每一处原来的透明度与层次。 */
export function accentCssVariables(
  name: unknown,
  resolved: AccentResolved = 'light'
): Record<string, string> {
  const palette = accentThemePalette(name, resolved);
  return {
    '--accent': palette.accent,
    '--accent-ink': palette.ink ?? palette.accent,
    '--accent-2': palette.accent2,
    '--accent-3': palette.accent3,
    '--accent-contrast': palette.contrast,
    '--accent-rgb': rgb(palette.accent),
    '--accent-2-rgb': rgb(palette.accent2),
    '--accent-3-rgb': rgb(palette.accent3),
    '--accent-gradient': `linear-gradient(135deg, ${palette.accent}, ${palette.accent2})`,
    '--accent-gradient-soft': `linear-gradient(135deg, rgba(${rgb(palette.accent)}, .22), rgba(${rgb(palette.accent2)}, .16))`,
    '--accent-track': `linear-gradient(90deg, ${palette.accent3}, ${palette.accent} 62%, ${palette.accent2})`,
    '--glow': `rgba(${rgb(palette.accent)}, .24)`
  };
}

export function applyAccentTheme(
  name: unknown,
  resolved: AccentResolved,
  target?: HTMLElement
): void {
  if (!target && typeof document === 'undefined') return;
  const root = target ?? document.documentElement;
  const normalized = normalizeAccentTheme(name);
  root.dataset.accent = normalized;
  const variables = accentCssVariables(normalized, resolved);
  for (const [key, value] of Object.entries(variables)) root.style.setProperty(key, value);
}
