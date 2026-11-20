import { ipcMain, app } from 'electron';
import type { WebFrameMain } from 'electron';
import { fileURLToPath } from 'url';
import { logger } from '../../shared/logger';
import { isPathInside } from '../path-security';
import { createRateLimiter } from './rate-limit';

// Kanały kosztowne lub destrukcyjne: przejęty renderer nie może móc
// ich bombardować (wyczerpanie CPU/dysku). Tanie, wysokoczęstotliwościowe kanały (postęp,
// odczyty) celowo NIE są tu wymienione.
const RATE_LIMITED_CHANNELS = new Set<string>([
  'library:scan',
  'fs:findDuplicates',
  'fs:copy',
  'fs:move',
  'fs:delete',
  'plugins:installFromFolder',
  'plugins:installExample',
  'plugins:fetch',
  'coverCache:clear',
  'yt:download:add',
  // Transkodowanie spawnuje ffmpeg (także per-chunk dla nieznanego zakresu), a
  // instalacje zależności pobierają i uruchamiają narzędzia — przejęty renderer
  // nie może zalewać nimi systemu.
  'media:transcodeAudio',
  'media:getWaveform',
  'media:transcodeAudioChunk',
  'media:transcodeVideo',
  'tools:convert',
  'tools:clip',
  'tools:concat',
  'tools:clipThumbnails',
  'dep:installFfmpeg',
  'dep:installMkvextract',
  'dep:installYtdlp',
  'app:factoryReset',
  'providers:cred:login',
  'providers:subs:checkAll',
  'sources:enqueue'
]);

// 20 wywołań/sekundę na nadawcę+kanał: znacznie powyżej każdego legalnego użycia, znacznie poniżej
// burstu denial-of-service.
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
    // Zaufana jest tylko własna strona aplikacji (build produkcyjny), a nie dowolny
    // file: URL, do którego można nawigować z przejętego renderera.
    if (url.protocol === 'file:') return isTrustedAppFile(url);
    const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
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

let guardsInstalled = false;

export function installIpcGuards(): void {
  if (guardsInstalled) return;
  guardsInstalled = true;

  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);
  const originalOnce = ipcMain.once.bind(ipcMain);
  const originalRemoveListener = ipcMain.removeListener.bind(ipcMain);

  // Oryginalny listener → wrapper per kanał. Bez tego `removeListener(listener)`
  // nie znajdował wrappera i listener zostawał w `ipcMain` (np. timeout
  // `app:session-handoff-ready` w prepareSessionHandoff).
  type GuardedListener = (event: Electron.IpcMainEvent, ...args: unknown[]) => void;
  const wrappers = new WeakMap<object, Map<string, GuardedListener>>();
  const remember = (channel: string, listener: GuardedListener, wrapper: GuardedListener): void => {
    let byChannel = wrappers.get(listener);
    if (!byChannel) {
      byChannel = new Map();
      wrappers.set(listener, byChannel);
    }
    byChannel.set(channel, wrapper);
  };

  // Typy parametrów pochodzą z samego Electrona (`typeof ipcMain.handle`), więc
  // nie trzeba przepisywać `any[]` z jego sygnatury ani rzutować całej lambdy.
  const handle: typeof ipcMain.handle = (channel, listener) => {
    originalHandle(channel, (event, ...args) => {
      if (!isTrustedSenderFrame(event.senderFrame)) {
        blockLog('invoke', channel);
        throw new Error(`IPC '${channel}' blocked: untrusted sender`);
      }
      if (RATE_LIMITED_CHANNELS.has(channel)) {
        // Missing sender id groups under the same "undefined" key (stable per channel).
        const key = `${event.sender?.id}:${channel}`;
        if (!invokeLimiter.tryAcquire(key)) {
          blockLog('rate-limited invoke', channel);
          throw new Error(`IPC '${channel}' blocked: rate limit exceeded`);
        }
      }
      return listener(event, ...args);
    });
  };
  ipcMain.handle = handle;

  const on: typeof ipcMain.on = (channel, listener) => {
    const wrapped = (event: Electron.IpcMainEvent, ...args: unknown[]): void => {
      if (!isTrustedSenderFrame(event.senderFrame)) {
        blockLog('event', channel);
        // `ipcRenderer.sendSync` czeka na `event.returnValue`; bez tego zablokowany
        // sync bootstrap (np. media:getServerUrl z początkowego preloadu
        // about:blank) zawiesiłby renderer na zawsze.
        event.returnValue = undefined;
        return;
      }
      listener(event, ...args);
    };
    remember(channel, listener as GuardedListener, wrapped);
    originalOn(channel, wrapped);
    return ipcMain;
  };
  ipcMain.on = on;

  const once: typeof ipcMain.once = (channel, listener) => {
    const wrapped = (event: Electron.IpcMainEvent, ...args: unknown[]): void => {
      if (!isTrustedSenderFrame(event.senderFrame)) {
        blockLog('once event', channel);
        event.returnValue = undefined;
        return;
      }
      listener(event, ...args);
    };
    remember(channel, listener as GuardedListener, wrapped);
    originalOnce(channel, wrapped);
    return ipcMain;
  };
  ipcMain.once = once;

  const removeListener: typeof ipcMain.removeListener = (channel, listener) => {
    const wrapper = wrappers.get(listener as GuardedListener)?.get(channel);
    originalRemoveListener(channel, (wrapper ?? listener) as GuardedListener);
    return ipcMain;
  };
  ipcMain.removeListener = removeListener;
  ipcMain.off = removeListener;
}
