import type { BrowserWindow } from 'electron';

/**
 * Poziom zawsze-na-wierzchu zależny od platformy.
 *
 * Na Windows Electron interpretuje `floating` (domyślny poziom) jako okno,
 * które ma trafić ZA pasek zadań: `SetWindowPos` względem `Shell_TrayWnd`
 * zdejmuje `WS_EX_TOPMOST`, więc `isAlwaysOnTop()` wraca `false`, a pin
 * przestaje działać. `screen-saver` nie jest w tej grupie i jako jedyny
 * faktycznie utrzymuje okno nad innymi. Na macOS zostaje standardowy
 * `floating` — `screen-saver` przykrywałby menu bar i Dock.
 */
export function alwaysOnTopLevel(
  platform: NodeJS.Platform = process.platform
): 'screen-saver' | 'floating' {
  return platform === 'win32' ? 'screen-saver' : 'floating';
}

/** Ustawia lub zdejmuje pin okna, używając poziomu, który działa na danej platformie. */
export function setWindowAlwaysOnTop(win: BrowserWindow, pinned: boolean): void {
  if (!pinned) {
    win.setAlwaysOnTop(false);
    return;
  }
  win.setAlwaysOnTop(true, alwaysOnTopLevel());
}
