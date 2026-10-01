import { nativeImage } from 'electron';
import icon from '../../../resources/icon.png?asset';
import winIcon from '../../../build/icon.ico?asset';

// Wybór ikony okna/tray wyodrębniony z `main/index.ts` (plan 2.8).

// Ikona BrowserWindow: wielorozdzielczościowy .ico na Windows (PNG byłby
// traktowany 1:1 i wyglądał na rozmyty), PNG gdzie indziej.
export function windowIcon(): string | undefined {
  return process.platform === 'win32' ? winIcon : icon;
}

// Tray z pustym obrazem spada do domyślnej ikony Electrona, więc wybierz
// pierwszego kandydata, który rozwiązuje się do prawdziwego obrazu. Na Windows
// preferuj wielorozdzielczościowy .ico — OS wybiera rozmiar pasujący do bieżącego DPI.
export function trayIcon(): Electron.NativeImage | null {
  const candidates = process.platform === 'win32' ? [winIcon, icon] : [icon, winIcon];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return null;
}
