import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * Frameless "glass" chrome shared by the main window and the explorer windows:
 * transparent background with acrylic on Windows and sidebar vibrancy on macOS.
 * Kept in one place so the two window creators cannot drift apart.
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
