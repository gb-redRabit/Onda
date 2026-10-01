import { ipcMain } from 'electron';

// URL serwera mediów zawiera token uwierzytelniający na jeden przebieg. Nigdy nie
// może być przekazywany przez argumenty CLI (widoczne przez `Get-Process` /
// `/proc/pid/cmdline`), więc okna pobierają go synchronicznie przez IPC.
let currentMediaServerUrl = '';

export function setMediaServerUrl(url: string): void {
  currentMediaServerUrl = url;
}

function getMediaServerUrl(): string {
  return currentMediaServerUrl;
}

export function registerMediaUrlHandler(): void {
  ipcMain.on('media:getServerUrl', (event) => {
    event.returnValue = getMediaServerUrl();
  });
}
