import { watch } from 'vue';
import type { AppearanceSettings } from '@renderer/types/settings';
import { THEME_PALETTES } from '@renderer/utils/constants';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : null;
}

function buildThemeVars(appearance: AppearanceSettings): Record<string, string> {
  const palette = THEME_PALETTES[appearance.theme] || THEME_PALETTES.dark;
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
    '--color-accent-ghost': rgb
      ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`
      : 'transparent',
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

  return { applyTheme };
}
