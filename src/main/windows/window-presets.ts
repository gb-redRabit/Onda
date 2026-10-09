import type { BrowserWindowConstructorOptions } from 'electron';

/** Materiał tła ustawiany przy tworzeniu „szklanego" okna (Windows) albo null. */
export const GLASS_WINDOW_MATERIAL: 'acrylic' | null =
  process.platform === 'win32' ? 'acrylic' : null;

/**
 * Bezramkowa "szklana" oprawa wspólna dla okna głównego i okien eksploratora:
 * przezroczyste tło z akrylem na Windows i vibrancy paska bocznego na macOS.
 * Trzymane w jednym miejscu, aby dwa kreatory okien nie rozjechały się.
 */
export const GLASS_WINDOW_OPTS: Partial<BrowserWindowConstructorOptions> = {
  frame: false,
  titleBarStyle: 'hidden',
  hasShadow: false,
  transparent: true,
  backgroundColor: '#00000000',
  ...(GLASS_WINDOW_MATERIAL ? { backgroundMaterial: GLASS_WINDOW_MATERIAL } : {}),
  ...(process.platform === 'darwin'
    ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
    : {})
};
