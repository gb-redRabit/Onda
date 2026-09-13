import { nativeImage } from 'electron';
import icon from '../../resources/icon.png?asset';
import winIcon from '../../build/icon.ico?asset';

// Window/tray icon selection extracted from `main/index.ts` (plan 2.8).

// BrowserWindow icon: multi-resolution .ico on Windows (PNG would be treated
// 1:1 and look blurry), PNG elsewhere.
export function windowIcon(): string | undefined {
  return process.platform === 'win32' ? winIcon : icon;
}

// A tray with an empty image falls back to Electron's default icon, so pick the
// first candidate that resolves to a real image. On Windows prefer the
// multi-resolution .ico — the OS selects the size matching the current DPI.
export function trayIcon(): Electron.NativeImage | null {
  const candidates = process.platform === 'win32' ? [winIcon, icon] : [icon, winIcon];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return null;
}
