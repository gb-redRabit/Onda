import { contextBridge, ipcRenderer } from 'electron';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const mediaServerUrl: string = getArg('onda-media-url') ?? '';

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
  mediaServerUrl,
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

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch {
    /* noop */
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api;
}
