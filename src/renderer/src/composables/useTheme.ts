import { watch } from 'vue';
import type { AppearanceSettings } from '@renderer/types/settings';
import { THEME_PALETTES } from '@renderer/utils/constants';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function buildCustomPalette(hex: string) {
  const rgb = hexToRgb(hex) ?? { r: 15, g: 15, b: 23 };
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const light = lum > 0.5;
  const shade = (amt: number): string => {
    const p = Math.max(0, Math.min(1, amt));
    const c = (v: number): number => Math.round(light ? v * (1 - p) : v + (255 - v) * p);
    return `rgb(${c(rgb.r)}, ${c(rgb.g)}, ${c(rgb.b)})`;
  };
  return {
    bgBase: hex,
    bgSurface: shade(0.06),
    bgOverlay: shade(0.12),
    bgElevated: shade(0.18),
    bgHover: shade(0.26),
    bgActive: shade(0.34),
    borderDefault: light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)',
    borderSubtle: light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.14)',
    fgBase: light ? '#1a1a2e' : '#e8e8f0',
    fgMuted: light ? '#4a4a60' : '#a0a0b8',
    fgFaint: light ? '#8a8aa0' : '#7c7c9c'
  };
}

function buildThemeVars(appearance: AppearanceSettings): Record<string, string> {
  let palette = THEME_PALETTES[appearance.theme];
  if (appearance.theme === 'custom') {
    palette = buildCustomPalette(appearance.customBackground || '#0f0f17');
  }
  palette = palette || THEME_PALETTES.dark;
  const rgb = hexToRgb(appearance.accentColor);
  return {
    '--color-bg-base': palette.bgBase,
    '--color-bg-surface': palette.bgSurface,
    '--color-bg-overlay': palette.bgOverlay,
    '--color-bg-elevated': palette.bgElevated,
    '--color-bg-hover': palette.bgHover,
    '--color-bg-active': palette.bgActive,
    '--color-border-default': palette.borderDefault,
    '--color-border-subtle': palette.borderSubtle,
    '--color-fg-base': palette.fgBase,
    '--color-fg-muted': palette.fgMuted,
    '--color-fg-faint': palette.fgFaint,
    '--color-accent-base': appearance.accentColor,
    '--color-accent-hover': rgb
      ? `rgba(${Math.min(255, rgb.r + 20)}, ${Math.min(255, rgb.g + 20)}, ${Math.min(255, rgb.b + 20)}, 1)`
      : appearance.accentColor,
    '--color-accent-strong': rgb
      ? `rgba(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)}, 1)`
      : appearance.accentColor,
    '--color-accent-ghost': rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)` : 'transparent',
    '--font-size': `${appearance.fontSize}px`
  };
}

export function useTheme(appearance: AppearanceSettings) {
  function applyTheme() {
    const root = document.documentElement;
    const vars = buildThemeVars(appearance);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    root.style.fontSize = `${appearance.fontSize}px`;
    window.api?.send('audio-pip:theme', vars);
    window.api?.send('pip:theme', vars);
    window.api?.send('pip:locale', appearance.locale);
  }

  watch(() => appearance.theme, applyTheme);
  watch(() => appearance.accentColor, applyTheme);
  watch(() => appearance.fontSize, applyTheme);
  watch(() => appearance.customBackground, applyTheme);

  return { applyTheme };
}
