import { fileURLToPath } from 'node:url';
import { win32 } from 'node:path';

function normalizeForPlatform(path: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') return win32.normalize(path).toLowerCase();
  return path;
}

function fileUrlToFilesystemPath(raw: string, platform: NodeJS.Platform): string {
  // `fileURLToPath` używa gramatyki hosta; w testach uruchamianych na Windows
  // potrzebujemy też poprawnej ścieżki POSIX i odwrotnie (CI Linux/macOS testuje
  // ścieżki Windows).
  if (platform === process.platform) return fileURLToPath(raw);
  const decoded = decodeURIComponent(new URL(raw).pathname);
  if (platform === 'win32') {
    // `file:///D:/Music/A.mp3` → `D:\Music\A.mp3` (bez wiodącego backslasha).
    return win32.normalize(decoded.replace(/^\/([A-Za-z]:)/, '$1'));
  }
  return decoded;
}

/**
 * Rozwiązuje src mediów (`onda://`, `file:///` lub zwykłą ścieżkę) do ścieżki
 * systemu plików. Separatory zamieniamy tylko na Windows, a zwykłych ścieżek
 * nie przepuszczamy przez `decodeURIComponent` (nazwa `100%20Pure.mp3` jest
 * legalna i nie może zmienić się w `100 Pure.mp3`).
 */
export function resolveMediaPathForPlatform(src: string, platform: NodeJS.Platform): string {
  if (/^onda:\/\//i.test(src)) {
    const path = new URL(src).searchParams.get('path');
    if (path) return normalizeForPlatform(path, platform);
  }
  if (/^file:\/\//i.test(src)) {
    return normalizeForPlatform(fileUrlToFilesystemPath(src, platform), platform);
  }
  return normalizeForPlatform(src, platform);
}

/** Wariant produkcyjny: platforma bieżącego procesu. */
export function resolveMediaPath(src: string): string {
  try {
    return resolveMediaPathForPlatform(src, process.platform);
  } catch {
    return src;
  }
}
