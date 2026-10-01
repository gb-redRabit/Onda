import { BrowserWindow } from 'electron';
import { createWindow } from './window-factory';

// Okno podglądu zdjęć (lightbox) wyodrębnione z `window-ipc.ts` (plan 2.8).
// Jedno reużywalne okno pełnoekranowe, którego lista plików jest wysyłana przez IPC.

let imageViewerWindow: BrowserWindow | null = null;
let imageViewerData: { files: unknown[]; index: number } | null = null;

export function openImageViewer(files: unknown[], index: number): number {
  imageViewerData = { files, index };
  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    imageViewerWindow.webContents.send('imageViewer:files', imageViewerData);
    imageViewerWindow.focus();
    return imageViewerWindow.id;
  }
  imageViewerWindow = createWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'Image Viewer',
    backgroundColor: '#0f0f17',
    fullscreen: true,
    fullscreenable: true,
    hash: '/image-viewer',
    onReadyToShow: (win) => {
      win.show();
      win.focus();
      win.moveTop();
      win.setFullScreen(true);
      win.setAlwaysOnTop(true);
      // Okno może zostać zamknięte, zanim to zadziała; dotknięcie zniszczonego
      // BrowserWindow rzuca nieprzechwycony wyjątek w procesie głównym.
      setTimeout(() => {
        if (!win.isDestroyed()) win.setAlwaysOnTop(false);
      }, 100);
    },
    onClosed: () => {
      imageViewerWindow = null;
    }
  });
  imageViewerWindow.setMenuBarVisibility(false);
  return imageViewerWindow.id;
}

export function getImageViewerData(): { files: unknown[]; index: number } | null {
  return imageViewerData;
}

export function closeImageViewer(): void {
  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    imageViewerWindow.close();
  }
}
