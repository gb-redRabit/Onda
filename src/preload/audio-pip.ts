import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_SEND_CHANNELS = new Set<string>([
  'audio-pip:showMain',
  'audio-pip:action',
  'audio-pip:progressClick',
  'audio-pip:unpeek',
  'audio-pip:peekDelay'
]);

const ALLOWED_RECEIVE_CHANNELS = new Set<string>([
  'audio-pip:update',
  'audio-pip:vizData',
  'audio-pip:theme'
]);

const api = {
  // Okno audio-PiP nie potrzebuje URL-a serwera mediów (okładka przychodzi jako
  // dane), więc nie robimy tu blokującego `sendSync`.
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

if (!process.contextIsolated) {
  throw new Error('Onda audio-pip preload requires contextIsolation');
}
try {
  contextBridge.exposeInMainWorld('api', api);
} catch {
  /* noop */
}
