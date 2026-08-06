import { ipcMain } from 'electron';

// The media-server URL contains a per-run auth token. It must never be passed
// through CLI arguments (visible via `Get-Process` / `/proc/pid/cmdline`), so
// windows fetch it synchronously over IPC instead.
let currentMediaServerUrl = '';

export function setMediaServerUrl(url: string): void {
  currentMediaServerUrl = url;
}

export function getMediaServerUrl(): string {
  return currentMediaServerUrl;
}

export function registerMediaUrlHandler(): void {
  ipcMain.on('media:getServerUrl', (event) => {
    event.returnValue = getMediaServerUrl();
  });
}
