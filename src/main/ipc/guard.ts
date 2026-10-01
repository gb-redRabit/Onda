import { ipcMain, app } from 'electron';
import type { IpcMainInvokeEvent, IpcMainEvent, WebFrameMain } from 'electron';
import { fileURLToPath } from 'url';
import { logger } from '../../shared/logger';
import { isPathInside } from '../path-security';
import { createRateLimiter } from './rate-limit';

// Expensive or destructive channels: a compromised renderer must not be able to
// hammer them (CPU/disk exhaustion). Cheap, high-frequency channels (progress,
// reads) are deliberately NOT listed.
const RATE_LIMITED_CHANNELS = new Set<string>([
  'library:scan',
  'fs:findDuplicates',
  'fs:copy',
  'fs:move',
  'fs:delete',
  'plugins:installFromFolder',
  'plugins:installExample',
  'coverCache:clear',
  'yt:download:add'
]);

// 20 calls/second per sender+channel: far above any legitimate use, far below a
// denial-of-service burst.
const invokeLimiter = createRateLimiter({ maxCalls: 20, windowMs: 1000 });

function isTrustedAppFile(url: URL): boolean {
  let target: string;
  try {
    target = fileURLToPath(url);
  } catch {
    return false;
  }
  return isPathInside(app.getAppPath(), target);
}

function isTrustedSenderFrame(frame: WebFrameMain | null | undefined): boolean {
  if (!frame) return false;
  try {
    const url = new URL(frame.url);
    // Only the app's own page (production build) is trusted, not any arbitrary
    // file: URL that could be navigated to from within a compromised renderer.
    if (url.protocol === 'file:') return isTrustedAppFile(url);
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      return url.origin === new URL(devUrl).origin;
    }
  } catch {
    return false;
  }
  return false;
}

function blockLog(kind: string, channel: string): void {
  logger.warn('ipc', `Blocked ${kind} '${channel}' from untrusted sender frame`);
}

export function installIpcGuards(): void {
  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);
  const originalOnce = ipcMain.once.bind(ipcMain);

  ipcMain.handle = ((
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => any
  ) => {
    originalHandle(channel, (event, ...args) => {
      if (!isTrustedSenderFrame(event.senderFrame)) {
        blockLog('invoke', channel);
        return undefined;
      }
      if (RATE_LIMITED_CHANNELS.has(channel)) {
        const key = `${event.sender?.id ?? 'unknown'}:${channel}`;
        if (!invokeLimiter.tryAcquire(key)) {
          blockLog('rate-limited invoke', channel);
          return undefined;
        }
      }
      return listener(event, ...args);
    });
  }) as typeof ipcMain.handle;

  ipcMain.on = ((channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) => {
    originalOn(channel, (event, ...args) => {
      if (!isTrustedSenderFrame(event.senderFrame)) {
        blockLog('event', channel);
        // `ipcRenderer.sendSync` waits for `event.returnValue`; without this a
        // blocked sync bootstrap (e.g. media:getServerUrl from the initial
        // about:blank preload) would hang the renderer forever.
        event.returnValue = undefined;
        return;
      }
      listener(event, ...args);
    });
  }) as typeof ipcMain.on;

  ipcMain.once = ((channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) => {
    originalOnce(channel, (event, ...args) => {
      if (!isTrustedSenderFrame(event.senderFrame)) {
        blockLog('once event', channel);
        event.returnValue = undefined;
        return;
      }
      listener(event, ...args);
    });
  }) as typeof ipcMain.once;
}
