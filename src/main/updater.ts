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
 * Odtwarza najnowszy `updater:event` dla renderera, który właśnie stał się gotowy.
 * Zdarzenia są jednorazowymi transmisjami, więc okno montowane późno (sprawdzenie
 * przy starcie, przeładowanie, ponowna aktywacja macOS) w innym razie przegapiłoby
 * powiadomienie o aktualizacji.
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
  // Weryfikacja podpisu jest sterowana przez wbudowaną konfigurację kompilacji
  // (win.verifyUpdateCodeSignature + win.publisherName w electron-builder.yml),
  // którą electron-updater odczytuje automatycznie w czasie działania. Nie trzeba
  // tu nic nadpisywać — zostaw to konfiguracji z czasu budowania, aby niepodpisane
  // kompilacje testowe nadal instalowały aktualizacje.

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
