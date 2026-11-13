import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  expose: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: state.expose },
  ipcRenderer: {
    send: state.send,
    on: state.on,
    removeListener: state.removeListener
  }
}));

type Api = {
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
};

let api: Api;

beforeEach(async () => {
  Object.defineProperty(process, 'contextIsolated', { value: true, configurable: true });
  state.expose.mockClear();
  state.send.mockClear();
  state.on.mockClear();
  state.removeListener.mockClear();
  vi.resetModules();
  await import('../pip');
  api = state.expose.mock.calls.at(-1)![1] as Api;
});

afterEach(() => {
  vi.resetModules();
});

describe('exposure', () => {
  it('exposes the video pip API through contextBridge', () => {
    expect(state.expose).toHaveBeenCalledWith('api', expect.any(Object));
  });

  it('fails loudly without context isolation', async () => {
    Object.defineProperty(process, 'contextIsolated', { value: false, configurable: true });
    vi.resetModules();
    await expect(import('../pip')).rejects.toThrow('contextIsolation');
  });

  it('swallows a contextBridge failure', async () => {
    state.expose.mockImplementationOnce(() => {
      throw new Error('bridge busy');
    });
    vi.resetModules();
    await expect(import('../pip')).resolves.toBeDefined();
  });
});

describe('send', () => {
  it.each(['pip:ended', 'pip:timeUpdate', 'pip:maximize', 'pip:hidden'])(
    'forwards %s',
    (channel) => {
      api.send(channel, 'value');

      expect(state.send).toHaveBeenCalledWith(channel, 'value');
    }
  );

  it('drops channels outside the allowlist', () => {
    api.send('pip:unknown');

    expect(state.send).not.toHaveBeenCalled();
  });

  it('tolerates a throwing ipcRenderer', () => {
    state.send.mockImplementationOnce(() => {
      throw new Error('closed');
    });

    expect(() => api.send('pip:ended')).not.toThrow();
  });
});

describe('on', () => {
  it.each([
    'pip:videoSrc',
    'pip:play',
    'pip:requestTime',
    'pip:pause',
    'pip:clear',
    'pip:subtitle',
    'pip:clearSubtitle',
    'pip:theme',
    'pip:locale'
  ])('subscribes to %s and strips the event', (channel) => {
    const callback = vi.fn();

    const off = api.on(channel, callback);

    expect(state.on).toHaveBeenCalledWith(channel, expect.any(Function));
    const handler = state.on.mock.calls.at(-1)![1] as (...args: unknown[]) => void;
    handler({ sender: 'event' }, 'payload');

    expect(callback).toHaveBeenCalledWith('payload');
    off();
    expect(state.removeListener).toHaveBeenCalledWith(channel, handler);
  });

  it('returns a noop for channels outside the allowlist', () => {
    const off = api.on('pip:unknown', vi.fn());

    expect(state.on).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });
});
