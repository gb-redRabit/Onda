import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  appPath: vi.fn(() => 'C:/app'),
  quit: vi.fn(),
  showErrorBox: vi.fn(),
  defaultSession: null as any,
  fromPartition: vi.fn(),
  isPathInside: vi.fn((_root: string, path: string) => {
    // `fileURLToPath` zwraca na POSIX `/C:/app/...`, a na Windows `C:\app\...`;
    // normalizuj oba warianty, żeby test nie zależał od platformy CI.
    const norm = (value: string) =>
      value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
    const root = norm(_root);
    const target = norm(path);
    return target === root || target.startsWith(`${root}/`);
  }),
  messages: {
    loadFailedTitle: 'Failed',
    rendererCrashMessage: (reason: string) => `crashed:${reason}`
  },
  authPartition: 'persist:auth',
  previewPartition: 'persist:preview',
  providerPartitions: ['persist:provider-a'],
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  processOn: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getAppPath: state.appPath, quit: state.quit },
  dialog: { showErrorBox: state.showErrorBox },
  session: {
    get defaultSession() {
      return state.defaultSession;
    },
    fromPartition: state.fromPartition
  }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, error: state.loggerError, info: vi.fn() }
}));
vi.mock('../../path-security', () => ({ isPathInside: state.isPathInside }));
vi.mock('../../i18n-main', () => ({ mainMessages: () => state.messages }));
vi.mock('../../youtube/youtube-auth-session', () => ({
  AUTH_PARTITION: state.authPartition
}));
vi.mock('../../ipc/providers/provider-login', () => ({
  providerLoginPartitions: () => state.providerPartitions
}));
vi.mock('../../preview/preview-session', () => ({
  PREVIEW_PARTITION: state.previewPartition
}));

import {
  hardenSessionPermissions,
  installProcessSafetyNets,
  installRendererRecovery,
  installSessionHardening
} from '../safety-nets';

function sessionMock() {
  return {
    checkHandler: null as any,
    requestHandler: null as any,
    setPermissionCheckHandler: vi.fn(function (this: any, handler: any) {
      this.checkHandler = handler;
    }),
    setPermissionRequestHandler: vi.fn(function (this: any, handler: any) {
      this.requestHandler = handler;
    })
  };
}

function browserWindow(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, (...args: any[]) => void>();
  return {
    handlers,
    isDestroyed: vi.fn(() => false),
    webContents: {
      reload: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        handlers.set(event, handler);
      })
    },
    ...overrides
  } as any;
}

beforeEach(() => {
  state.appPath.mockClear();
  state.quit.mockReset();
  state.showErrorBox.mockReset();
  state.fromPartition.mockReset();
  state.defaultSession = sessionMock();
  state.fromPartition.mockImplementation(() => sessionMock());
  state.isPathInside.mockClear();
  state.loggerWarn.mockReset();
  state.loggerError.mockReset();
  state.providerPartitions = ['persist:provider-a'];
  delete (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'];
});

afterEach(() => {
  delete (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'];
  vi.restoreAllMocks();
});

describe('session hardening', () => {
  it('allows only trusted origins and safe permissions', () => {
    const ses = sessionMock();
    hardenSessionPermissions(ses as never, (origin) => origin === 'https://ok');

    expect(ses.checkHandler({}, 'fullscreen', 'https://ok')).toBe(true);
    expect(ses.checkHandler({}, 'camera', 'https://ok')).toBe(false);
    expect(ses.checkHandler({}, 'fullscreen', 'https://bad')).toBe(false);

    const callback = vi.fn();
    ses.requestHandler({}, 'clipboard-sanitized-write', callback, {
      requestingUrl: 'https://ok'
    });
    expect(callback).toHaveBeenCalledWith(true);

    callback.mockClear();
    ses.requestHandler({}, 'fullscreen', callback, { requestingUrl: 'https://bad' });
    expect(callback).toHaveBeenCalledWith(false);
  });

  it('trusts packaged file URLs inside the app path', () => {
    installSessionHardening();
    const handler = (state.defaultSession as any).checkHandler;

    expect(handler({}, 'fullscreen', 'file:///C:/app/renderer/index.html')).toBe(true);
    expect(handler({}, 'fullscreen', 'file:///C:/other/index.html')).toBe(false);
    expect(state.isPathInside).toHaveBeenCalledWith('C:/app', expect.any(String));
  });

  it('trusts the dev renderer origin when configured', () => {
    (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'] =
      'http://localhost:5173';
    installSessionHardening();
    const handler = (state.defaultSession as any).checkHandler;

    expect(handler({}, 'fullscreen', 'http://localhost:5173')).toBe(true);
    expect(handler({}, 'fullscreen', 'http://localhost:9999')).toBe(false);
  });

  it('rejects malformed origins', () => {
    installSessionHardening();
    const handler = (state.defaultSession as any).checkHandler;
    expect(handler({}, 'fullscreen', 'not a url')).toBe(false);
  });

  it('hardens remote partitions and tolerates failures', () => {
    state.fromPartition
      .mockImplementationOnce(() => sessionMock())
      .mockImplementationOnce(() => {
        throw new Error('missing');
      });

    installSessionHardening();

    expect(state.fromPartition.mock.calls.map(([partition]) => partition)).toEqual([
      'persist:auth',
      'persist:provider-a',
      'persist:preview'
    ]);
    const hardened = state.fromPartition.mock.results[0].value as ReturnType<typeof sessionMock>;
    expect(hardened.checkHandler({}, 'fullscreen', 'https://anything')).toBe(false);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'main',
      'failed to harden partition permissions (persist:provider-a)',
      expect.any(Error)
    );
  });
});

describe('process safety nets', () => {
  it('logs uncaught exceptions and unhandled rejections', () => {
    const handlers = new Map<string, (arg: unknown) => void>();
    vi.spyOn(process, 'on').mockImplementation(((event: string, handler: any) => {
      handlers.set(event, handler);
      return process;
    }) as any);

    installProcessSafetyNets();
    const error = new Error('boom');
    handlers.get('uncaughtException')!(error);
    handlers.get('unhandledRejection')!('reason');

    expect(state.loggerError).toHaveBeenCalledWith('main', 'uncaughtException', error);
    expect(state.loggerError).toHaveBeenCalledWith('main', 'unhandledRejection', 'reason');
  });
});

describe('renderer recovery', () => {
  it('ignores clean exits and killed windows', () => {
    const win = browserWindow();
    const onGone = vi.fn();
    installRendererRecovery(win, onGone);
    const handler = win.handlers.get('render-process-gone');

    handler!({}, { reason: 'clean-exit' });
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(win.webContents.reload).not.toHaveBeenCalled();

    handler!({}, { reason: 'killed' });
    expect(win.webContents.reload).not.toHaveBeenCalled();
  });

  it('ignores crashes when the window is destroyed', () => {
    const win = browserWindow({ isDestroyed: vi.fn(() => true) });
    installRendererRecovery(win, vi.fn());

    win.handlers.get('render-process-gone')!({}, { reason: 'crashed' });

    expect(win.webContents.reload).not.toHaveBeenCalled();
    expect(state.quit).not.toHaveBeenCalled();
  });

  it('reloads at most twice', () => {
    const win = browserWindow();
    installRendererRecovery(win, vi.fn());
    const handler = win.handlers.get('render-process-gone');

    handler!({}, { reason: 'crashed' });
    handler!({}, { reason: 'oom' });

    expect(win.webContents.reload).toHaveBeenCalledTimes(2);
    expect(state.loggerWarn).toHaveBeenCalledWith('main', 'reloading renderer after crash (1/2)');
    expect(state.loggerWarn).toHaveBeenCalledWith('main', 'reloading renderer after crash (2/2)');
  });

  it('delegates to a custom fallback when recovery is exhausted', () => {
    const win = browserWindow();
    const onExhausted = vi.fn();
    installRendererRecovery(win, vi.fn(), { onExhausted });
    const handler = win.handlers.get('render-process-gone');

    handler!({}, { reason: 'crashed' });
    handler!({}, { reason: 'crashed' });
    handler!({}, { reason: 'crashed' });

    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(state.showErrorBox).not.toHaveBeenCalled();
    expect(state.quit).not.toHaveBeenCalled();
  });

  it('shows an error and quits without a fallback', () => {
    const win = browserWindow();
    installRendererRecovery(win, vi.fn());
    const handler = win.handlers.get('render-process-gone');

    handler!({}, { reason: 'crashed' });
    handler!({}, { reason: 'crashed' });
    handler!({}, { reason: 'oom' });

    expect(state.showErrorBox).toHaveBeenCalledWith('Failed', 'crashed:oom');
    expect(state.quit).toHaveBeenCalledTimes(1);
  });

  it('logs unresponsive renderers', () => {
    const win = browserWindow();
    installRendererRecovery(win, vi.fn());

    win.handlers.get('unresponsive')!();

    expect(state.loggerWarn).toHaveBeenCalledWith('main', 'renderer unresponsive - UI frozen');
  });
});
