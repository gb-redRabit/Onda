import type { BrowserWindowConstructorOptions } from 'electron';

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
  ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
  ...(process.platform === 'darwin'
    ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
    : {})
};
