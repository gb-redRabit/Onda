import { app, type WebContents } from 'electron';
import { autoUpdater } from 'electron-updater';
import { logger } from '../shared/logger';
import type { IpcUpdaterEvent, UpdaterEventName } from '../shared/types/ipc';

type UpdaterStatus =
  'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdaterState {
  status: UpdaterStatus;
  current: string;
  version: string;
  progress: number;
  error: string;
  enabled: boolean;
}

let getMainWC: () => WebContents | null = () => null;
let status: UpdaterStatus = 'idle';
let version = '';
let progress = 0;
let error = '';
let lastEvent: IpcUpdaterEvent | null = null;

function send(
  event: UpdaterEventName,
  data: Omit<IpcUpdaterEvent, 'event'> = {},
  target?: WebContents
): void {
  lastEvent = { event, ...data };
  const wc = target ?? getMainWC();
  if (wc && !wc.isDestroyed()) {
    wc.send('updater:event', lastEvent);
  }
}

/**
 * Replays the most recent `updater:event` to a renderer that just became ready.
 * Events are one-shot broadcasts, so a window that mounts late (startup check,
 * reload, macOS re-activate) would otherwise miss the update notification.
 */
export function replayUpdaterEvent(target?: WebContents): void {
  const wc = target ?? getMainWC();
  if (!lastEvent || !wc || wc.isDestroyed()) return;
  wc.send('updater:event', lastEvent);
}

export function initAutoUpdater(getWebContents: () => WebContents | null): void {
  if (!app.isPackaged) {
    logger.info('updater', 'auto-update disabled in dev mode');
    return;
  }
  getMainWC = getWebContents;
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
