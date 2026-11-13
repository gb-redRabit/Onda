import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  expose: vi.fn(),
  on: vi.fn()
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: h.expose },
  ipcRenderer: { on: h.on }
}));

type SplashApi = {
  onStatus: (callback: (data: { label: string; progress: number }) => void) => void;
};

beforeEach(async () => {
  h.expose.mockClear();
  h.on.mockClear();
  vi.resetModules();
  await import('../splash');
});

describe('splash preload', () => {
  it('exposes onStatus through contextBridge', () => {
    expect(h.expose).toHaveBeenCalledWith('splash', expect.any(Object));
  });

  it('forwards splash status payloads to the callback', () => {
    const splash = h.expose.mock.calls.at(-1)![1] as SplashApi;
    const callback = vi.fn();

    splash.onStatus(callback);

    expect(h.on).toHaveBeenCalledWith('splash:status', expect.any(Function));
    const handler = h.on.mock.calls.at(-1)![1] as (...args: unknown[]) => void;
    handler({ sender: 'event' }, { label: 'Loading', progress: 42 });

    expect(callback).toHaveBeenCalledWith({ label: 'Loading', progress: 42 });
  });
});
