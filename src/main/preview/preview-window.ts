import { BrowserWindow, ipcMain, shell } from 'electron';
import { createWindow } from '../windows/window-factory';
import { configurePreviewSession, installWebviewGuard } from './preview-session';
import { logger } from '../../shared/logger';

// Okno podglądu playerów: własny renderer (`preview.html`) z paskiem narzędzi i
// `<webview>` w izolowanej partycji (spoof nagłówków + UA). Jedno okno,
// przeładowywane przy każdym otwarciu.
let previewWindow: BrowserWindow | null = null;

function isHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url;
  } catch {
    // nieprawidłowy URL
  }
  return null;
}

export function openPreviewWindow(
  url: string,
  opts?: { title?: string }
): { success: boolean; error?: string } {
  const parsed = isHttpUrl(url);
  if (!parsed) return { success: false, error: 'Invalid URL' };

  configurePreviewSession();

  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.destroy();
    previewWindow = null;
  }

  const hash = `url=${encodeURIComponent(parsed.href)}`;
  const win = createWindow({
    width: 1100,
    height: 720,
    minWidth: 480,
    minHeight: 360,
    show: false,
    backgroundColor: '#0b0b0d',
    title: opts?.title || 'Onda Preview',
    htmlFile: 'preview.html',
    hash,
    autoShow: false,
    webPreferences: { webviewTag: true },
    onReadyToShow: () => win.show(),
    onClosed: () => {
      if (previewWindow === win) previewWindow = null;
    }
  });
  previewWindow = win;

  return { success: true };
}

export function registerPreviewHandlers(): void {
  // Guard `<webview>` obejmuje też osadzenia inline w głównym oknie (modal playera).
  installWebviewGuard();

  ipcMain.handle('preview:open', (_event, url: unknown, opts?: unknown) => {
    if (typeof url !== 'string') return { success: false, error: 'Invalid URL' };
    const title =
      opts && typeof opts === 'object' && typeof (opts as { title?: unknown }).title === 'string'
        ? (opts as { title: string }).title
        : undefined;
    return openPreviewWindow(url, { title });
  });

  // Wołane przez osadzenie inline PRZED utworzeniem `<webview>`: konfiguruje sesję
  // podglądu (UA + spoof nagłówków), aby pierwsze żądania były już poprawnie nagłówkowane.
  ipcMain.handle('preview:prepare', () => {
    configurePreviewSession();
    return { success: true };
  });

  ipcMain.handle('preview:openExternal', (_event, url: unknown): void => {
    if (typeof url !== 'string') return;
    const parsed = isHttpUrl(url);
    if (!parsed) return;
    try {
      void shell.openExternal(parsed.href);
    } catch (e) {
      logger.warn('preview', 'openExternal failed', e);
    }
  });
}
