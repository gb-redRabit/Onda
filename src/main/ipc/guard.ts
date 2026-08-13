import { ipcMain, app } from 'electron';
import type { IpcMainInvokeEvent, IpcMainEvent, WebFrameMain } from 'electron';
import { fileURLToPath } from 'url';
import { normalize } from 'path';
import { logger } from '../../shared/logger';

function isTrustedAppFile(url: URL): boolean {
  let target: string;
  try {
    target = normalize(fileURLToPath(url));
  } catch {
    return false;
  }
  const appPath = normalize(app.getAppPath());
  if (process.platform === 'win32') {
    return target.toLowerCase().startsWith(appPath.toLowerCase());
  }
  return target.startsWith(appPath);
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
      return listener(event, ...args);
    });
  }) as typeof ipcMain.handle;

  ipcMain.on = ((channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) => {
    originalOn(channel, (event, ...args) => {
      if (!isTrustedSenderFrame(event.senderFrame)) {
        blockLog('event', channel);
        return;
      }
      listener(event, ...args);
    });
  }) as typeof ipcMain.on;

  ipcMain.once = ((channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) => {
    originalOnce(channel, (event, ...args) => {
      if (!isTrustedSenderFrame(event.senderFrame)) {
        blockLog('once event', channel);
        return;
      }
      listener(event, ...args);
    });
  }) as typeof ipcMain.once;
}
