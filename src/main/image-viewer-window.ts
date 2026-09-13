import { BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { installNavigationGuard } from './navigation-guard';
import { pipWindowIcon } from './pip-icon';

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
  imageViewerWindow = new BrowserWindow({
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
    icon: pipWindowIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  imageViewerWindow.setMenuBarVisibility(false);
  imageViewerWindow.on('ready-to-show', () => {
    imageViewerWindow?.show();
    imageViewerWindow?.focus();
    imageViewerWindow?.moveTop();
    imageViewerWindow?.setFullScreen(true);
    imageViewerWindow?.setAlwaysOnTop(true);
    setTimeout(() => imageViewerWindow?.setAlwaysOnTop(false), 100);
  });
  imageViewerWindow.on('closed', () => {
    imageViewerWindow = null;
  });
  installNavigationGuard(imageViewerWindow);
  const hash = '/image-viewer';
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void imageViewerWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#' + hash);
  } else {
    void imageViewerWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash });
  }
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
