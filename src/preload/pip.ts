import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_SEND_CHANNELS = new Set<string>([
  'pip:ended',
  'pip:timeUpdate',
  'pip:maximize',
  'pip:hidden'
]);

const ALLOWED_RECEIVE_CHANNELS = new Set<string>([
  'pip:videoSrc',
  'pip:play',
  'pip:requestTime',
  'pip:pause',
  'pip:clear',
  'pip:subtitle',
  'pip:clearSubtitle',
  'pip:theme',
  'pip:locale'
]);

const api = {
  // Okna PiP nie potrzebują URL-a serwera mediów (dostają gotowy `videoSrc`),
  // więc nie robimy tu `sendSync` — to była zbędna blokada przy starcie.
  send: (channel: string, ...args: unknown[]): void => {
    if (!ALLOWED_SEND_CHANNELS.has(channel)) return;
    try {
      ipcRenderer.send(channel, ...args);
    } catch {
      /* noop */
    }
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) return () => {};
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  }
};

// Błąd konfiguracji musi być głośny: bez izolacji kontekstu mostek wystawiłby
// całe API do niezaufanej strony.
if (!process.contextIsolated) {
  throw new Error('Onda pip preload requires contextIsolation');
}
try {
  contextBridge.exposeInMainWorld('api', api);
} catch {
  /* noop */
}
