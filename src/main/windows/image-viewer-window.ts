import { BrowserWindow } from 'electron';
import { createWindow } from './window-factory';

// Image-viewer window (lightbox) extracted from `window-ipc.ts` (plan 2.8).
// A single reusable fullscreen window whose file list is pushed over IPC.

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
      // The window can be closed before this fires; touching a destroyed
      // BrowserWindow throws an uncaught exception in the main process.
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
