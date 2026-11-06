import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Preload: contextBridge/IPC są podstawione; allowlisty pochodzą z prawdziwego
// wygenerowanego pliku, więc test pilnuje też kontraktu kanałów.
const state = vi.hoisted(() => ({
  expose: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  getPathForFile: vi.fn(() => '/tmp/file.txt'),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: state.expose },
  ipcRenderer: {
    send: state.send,
    invoke: state.invoke,
    on: state.on,
    once: state.once,
    removeListener: state.removeListener
  },
  webUtils: { getPathForFile: state.getPathForFile }
}));
vi.mock('../../shared/logger', () => ({ logger: state.logger }));

let api: Record<string, (...args: any[]) => any>;

beforeEach(async () => {
  Object.defineProperty(process, 'contextIsolated', { value: true, configurable: true });
  state.expose.mockClear();
  state.send.mockClear();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.on.mockClear();
  state.once.mockClear();
  state.removeListener.mockClear();
  state.getPathForFile.mockClear();
  state.logger.warn.mockClear();
  state.logger.error.mockClear();
  vi.resetModules();
  await import('../index');
  api = state.expose.mock.calls.at(-1)![1] as Record<string, (...args: any[]) => any>;
});

afterEach(() => {
  vi.resetModules();
});

describe('exposure', () => {
  it('exposes the API through contextBridge', () => {
    expect(state.expose).toHaveBeenCalledWith('api', expect.any(Object));
    expect(api.invoke).toBeTypeOf('function');
    expect(api.on).toBeTypeOf('function');
  });

  it('fails loudly without context isolation', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'contextIsolated');
    Object.defineProperty(process, 'contextIsolated', { value: false, configurable: true });
    vi.resetModules();
    await expect(import('../index')).rejects.toThrow('contextIsolation');
    if (descriptor) {
      Object.defineProperty(process, 'contextIsolated', descriptor);
    } else {
      delete (process as { contextIsolated?: boolean }).contextIsolated;
    }
  });

  it('logs an exposeInMainWorld failure', async () => {
    state.expose.mockImplementationOnce(() => {
      throw new Error('bridge busy');
    });
    vi.resetModules();
    await expect(import('../index')).resolves.toBeDefined();
    expect(state.logger.error).toHaveBeenCalledWith(
      'preload',
      'exposeInMainWorld failed',
      expect.any(Error)
    );
  });
});

describe('invoke guard', () => {
  it('forwards an allowed channel and returns the result', async () => {
    state.invoke.mockResolvedValue(7);
    await expect(api.getWindowId()).resolves.toBe(7);
    expect(state.invoke).toHaveBeenCalledWith('window:id');
  });

  it('rejects a channel outside the allowlist', async () => {
    await expect(api.invoke('evil:channel' as never, 1 as never)).rejects.toThrow(
      'non-allowlisted'
    );
    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.logger.warn).toHaveBeenCalled();
  });

  it('propagates rejected invokes as Error', async () => {
    state.invoke.mockRejectedValue('plain failure');
    await expect(api.getWindowId()).rejects.toThrow('plain failure');
    expect(state.logger.error).toHaveBeenCalled();
  });

  it('rejects when ipcRenderer.invoke throws synchronously', async () => {
    state.invoke.mockImplementation(() => {
      throw new Error('sync fail');
    });
    await expect(api.getWindowId()).rejects.toThrow('sync fail');
    expect(state.logger.error).toHaveBeenCalledWith(
      'preload',
      expect.stringContaining('IPC invoke failed'),
      expect.any(Error)
    );
  });
});

describe('send and receive guards', () => {
  it('forwards allowlisted sends and blocks others', () => {
    api.send('discord:update', { state: 'playing' });
    expect(state.send).toHaveBeenCalledWith('discord:update', { state: 'playing' });

    api.send('evil:channel', 1);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.logger.warn).toHaveBeenCalledWith(
      'preload',
      expect.stringContaining('evil:channel')
    );
  });

  it('logs send errors', () => {
    state.send.mockImplementation(() => {
      throw new Error('gone');
    });
    api.send('discord:update', null);
    expect(state.logger.error).toHaveBeenCalledWith(
      'preload',
      expect.stringContaining('IPC send failed'),
      expect.any(Error)
    );
  });

  it('subscribes to allowlisted receive channels and unsubscribes', () => {
    const callback = vi.fn();
    const unsubscribe = api.on('app:shellActive', callback);

    expect(state.on).toHaveBeenCalledWith('app:shellActive', expect.any(Function));
    const handler = state.on.mock.calls[0][1];
    handler({}, 'payload');
    expect(callback).toHaveBeenCalledWith('payload');

    unsubscribe();
    expect(state.removeListener).toHaveBeenCalledWith('app:shellActive', handler);
  });

  it('ignores non-allowlisted subscriptions', () => {
    const unsubscribe = api.on('evil:channel', vi.fn());
    expect(state.on).not.toHaveBeenCalled();
    expect(state.logger.warn).toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('wraps once listeners and ignores non-allowlisted ones', () => {
    const callback = vi.fn();
    api.once('app:shellActive', callback);
    const handler = state.once.mock.calls[0][1];
    handler({}, 'one');
    expect(callback).toHaveBeenCalledWith('one');

    state.once.mockClear();
    api.once('evil:channel', callback);
    expect(state.once).not.toHaveBeenCalled();
  });
});

describe('wrappers', () => {
  it('coerces boolean results', async () => {
    state.invoke.mockResolvedValueOnce(1);
    await expect(api.pipStart('/video.mp4')).resolves.toBe(true);
    state.invoke.mockResolvedValueOnce(0);
    await expect(api.pipStop()).resolves.toBe(false);
    state.invoke.mockResolvedValueOnce(true);
    await expect(api.audioPipShow({ trackName: 'x' })).resolves.toBe(true);
  });

  it('maps representative invokes to their channels and arguments', async () => {
    await api.getDuration('/music/a.mp3');
    expect(state.invoke).toHaveBeenLastCalledWith('media:getDuration', '/music/a.mp3');

    await api.setPlaybackPosition('/music/a.mp3', 12);
    expect(state.invoke).toHaveBeenLastCalledWith('playback:setPosition', '/music/a.mp3', 12);

    await api.saveScreenshot('/video.mp4', [1, 2], 3);
    expect(state.invoke).toHaveBeenLastCalledWith('media:saveScreenshot', '/video.mp4', [1, 2], 3);

    await api.imageSave({ path: '/x.png' });
    expect(state.invoke).toHaveBeenLastCalledWith('tools:imageSave', { path: '/x.png' });

    await api.pluginsFetch('id', 'https://example.com', { method: 'GET' });
    expect(state.invoke).toHaveBeenLastCalledWith('plugins:fetch', 'id', 'https://example.com', {
      method: 'GET'
    });

    await api.grantMediaAccess('/video.mp4');
    expect(state.invoke).toHaveBeenLastCalledWith('media:grantAccess', '/video.mp4');

    await api.getStreamUrl('https://youtube.com/watch?v=1');
    expect(state.invoke).toHaveBeenLastCalledWith('yt:stream:get', 'https://youtube.com/watch?v=1');
  });

  it('maps send-only wrappers', () => {
    api.updateDiscordPresence({ track: 'x' } as never);
    expect(state.send).toHaveBeenCalledWith('discord:update', { track: 'x' });
  });

  it('resolves file paths through webUtils', () => {
    expect(api.getFilePath({} as File)).toBe('/tmp/file.txt');
    expect(state.getPathForFile).toHaveBeenCalled();
  });
});
