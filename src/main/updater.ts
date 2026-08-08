import { app, type WebContents } from 'electron';
import { autoUpdater } from 'electron-updater';
import { logger } from '../shared/logger';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdaterState {
  status: UpdaterStatus;
  current: string;
  version: string;
  progress: number;
  error: string;
  enabled: boolean;
}

let mainWC: WebContents | null = null;
let status: UpdaterStatus = 'idle';
let version = '';
let progress = 0;
let error = '';

function send(event: string, data: Record<string, unknown> = {}): void {
  if (mainWC && !mainWC.isDestroyed()) {
    mainWC.send('updater:event', { event, ...data });
  }
}

export function initAutoUpdater(getWebContents: () => WebContents | null): void {
  if (!app.isPackaged) {
    logger.info('updater', 'auto-update disabled in dev mode');
    return;
  }
  mainWC = getWebContents();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  // Signature verification is driven by the embedded build config
  // (win.verifyUpdateCodeSignature + win.publisherName in electron-builder.yml),
  // which electron-updater reads automatically at runtime. No override needed
  // here — leave it to the build-time config so unsigned test builds still
  // install updates.

  autoUpdater.on('checking-for-update', () => {
    status = 'checking';
    send('checking-for-update');
  });
  autoUpdater.on('update-available', (info) => {
    status = 'available';
    version = info.version;
    error = '';
    send('update-available', { version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    status = 'not-available';
    send('update-not-available');
  });
  autoUpdater.on('download-progress', (p) => {
    status = 'downloading';
    progress = p.percent;
    send('download-progress', { percent: p.percent, bytesPerSecond: p.bytesPerSecond });
  });
  autoUpdater.on('update-downloaded', (info) => {
    status = 'downloaded';
    version = info.version;
    progress = 100;
    send('update-downloaded', { version: info.version });
  });
  autoUpdater.on('error', (e) => {
    status = 'error';
    error = String(e && typeof e === 'object' && 'message' in e ? (e as Error).message : e);
    send('error', { error });
  });

  logger.info('updater', `auto-updater ready (current ${app.getVersion()})`);
}

export function getUpdaterState(): UpdaterState {
  return { status, current: app.getVersion(), version, progress, error, enabled: app.isPackaged };
}

export async function checkForUpdates(): Promise<{ checking: boolean }> {
  if (!app.isPackaged) return { checking: false };
  try {
    status = 'checking';
    send('checking-for-update');
    await autoUpdater.checkForUpdates();
    return { checking: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status = 'error';
    error = msg;
    send('error', { error: msg });
    return { checking: false };
  }
}

export function downloadUpdate(): boolean {
  if (status === 'available' || status === 'downloading') {
    autoUpdater.downloadUpdate().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      status = 'error';
      error = msg;
      send('error', { error: msg });
    });
    return true;
  }
  return false;
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}
