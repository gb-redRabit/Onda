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
  await import('../audio-pip');
  api = state.expose.mock.calls.at(-1)![1] as Api;
});

afterEach(() => {
  vi.resetModules();
});

describe('exposure', () => {
  it('exposes the pip API through contextBridge', () => {
    expect(state.expose).toHaveBeenCalledWith('api', expect.any(Object));
    expect(api.send).toBeTypeOf('function');
    expect(api.on).toBeTypeOf('function');
  });

  it('fails loudly without context isolation', async () => {
    Object.defineProperty(process, 'contextIsolated', { value: false, configurable: true });
    vi.resetModules();
    await expect(import('../audio-pip')).rejects.toThrow('contextIsolation');
  });

  it('swallows a contextBridge failure', async () => {
    state.expose.mockImplementationOnce(() => {
      throw new Error('bridge busy');
    });
    vi.resetModules();
    await expect(import('../audio-pip')).resolves.toBeDefined();
  });
});

describe('send', () => {
  it.each([
    'audio-pip:showMain',
    'audio-pip:action',
    'audio-pip:progressClick',
    'audio-pip:unpeek',
    'audio-pip:peekDelay'
  ])('forwards %s', (channel) => {
    api.send(channel, 1, 'two');

    expect(state.send).toHaveBeenCalledWith(channel, 1, 'two');
  });

  it('drops channels outside the allowlist', () => {
    api.send('audio-pip:unknown', 1);
    api.send('media:getServerUrl');

    expect(state.send).not.toHaveBeenCalled();
  });

  it('tolerates a throwing ipcRenderer', () => {
    state.send.mockImplementationOnce(() => {
      throw new Error('closed');
    });

    expect(() => api.send('audio-pip:showMain')).not.toThrow();
  });
});

describe('on', () => {
  it.each(['audio-pip:update', 'audio-pip:vizData', 'audio-pip:theme'])(
    'subscribes to %s and strips the event',
    (channel) => {
      const callback = vi.fn();

      const off = api.on(channel, callback);

      expect(state.on).toHaveBeenCalledWith(channel, expect.any(Function));
      const handler = state.on.mock.calls.at(-1)![1] as (...args: unknown[]) => void;
      handler({ sender: 'event' }, 'payload');

      expect(callback).toHaveBeenCalledWith('payload');
      off();
      expect(state.removeListener).toHaveBeenCalledWith(channel, handler);
    }
  );

  it('returns a noop for channels outside the allowlist', () => {
    const off = api.on('audio-pip:unknown', vi.fn());

    expect(state.on).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });
});
