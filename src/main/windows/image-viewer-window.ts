import { BrowserWindow } from 'electron';
import { createWindow } from './window-factory';

// Okno podglądu zdjęć (lightbox) wyodrębnione z `window-ipc.ts` (plan 2.8).
// Jedno reużywalne okno pełnoekranowe, którego lista plików jest wysyłana przez IPC.

let imageViewerWindow: BrowserWindow | null = null;
let imageViewerData: { files: unknown[]; index: number } | null = null;
// Główne okno bywa przypięte (always-on-top); na czas podglądu zdejmujemy ten
// poziom, żeby pełnoekranowy lightbox nie chował się pod aplikacją.
let ownerWindow: BrowserWindow | null = null;
let ownerWasOnTop = false;

function raiseViewer(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.setAlwaysOnTop(true, 'floating');
  win.focus();
  win.moveTop();
}

function demoteOwner(owner?: BrowserWindow | null): void {
  if (!owner || owner.isDestroyed()) return;
  ownerWindow = owner;
  ownerWasOnTop = owner.isAlwaysOnTop();
  if (ownerWasOnTop) owner.setAlwaysOnTop(false);
}

function restoreOwner(): void {
  if (ownerWindow && !ownerWindow.isDestroyed() && ownerWasOnTop) {
    ownerWindow.setAlwaysOnTop(true);
  }
  ownerWindow = null;
  ownerWasOnTop = false;
}

export function openImageViewer(
  files: unknown[],
  index: number,
  owner?: BrowserWindow | null
): number {
  imageViewerData = { files, index };
  demoteOwner(owner);
  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    imageViewerWindow.webContents.send('imageViewer:files', imageViewerData);
    raiseViewer(imageViewerWindow);
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
      win.setFullScreen(true);
      raiseViewer(win);
      // Przejście w pełny ekran potrafi odebrać fokus oknu głównemu; po jego
      // zakończeniu podnosimy podgląd ponownie.
      win.once('enter-full-screen', () => raiseViewer(win));
      setTimeout(() => raiseViewer(win), 250);
    },
    onClosed: () => {
      imageViewerWindow = null;
      restoreOwner();
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
