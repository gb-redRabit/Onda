import { ipcMain } from 'electron';

// URL serwera mediów zawiera token uwierzytelniający na jeden przebieg. Nigdy nie
// może być przekazywany przez argumenty CLI (widoczne przez `Get-Process` /
// `/proc/pid/cmdline`), więc okna pobierają go przez IPC.
//
// Wcześniej był to `sendSync`, który blokuje wątek renderera przy starcie każdego
// okna. Teraz to zwykły `invoke`; preload pobiera URL raz, asynchronicznie, i cache'uje.
let currentMediaServerUrl = '';

export function setMediaServerUrl(url: string): void {
  currentMediaServerUrl = url;
}

function getMediaServerUrl(): string {
  return currentMediaServerUrl;
}

export function registerMediaUrlHandler(): void {
  ipcMain.handle('media:getServerUrl', () => getMediaServerUrl());
}
