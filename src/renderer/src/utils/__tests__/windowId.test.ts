import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getWindowId: vi.fn()
}));

const api = window as unknown as { api?: { getWindowId: typeof h.getWindowId } };

type WindowIdApi = typeof import('../windowId');

let windowId: WindowIdApi;

beforeEach(async () => {
  h.getWindowId.mockReset().mockResolvedValue(7);
  api.api = { getWindowId: h.getWindowId };
  vi.resetModules();
  windowId = await import('../windowId');
});

describe('windowId', () => {
  it('resolves and caches the window id', async () => {
    await expect(windowId.getWindowId()).resolves.toBe(7);
    await expect(windowId.getWindowId()).resolves.toBe(7);

    expect(h.getWindowId).toHaveBeenCalledTimes(1);
    expect(windowId.getCachedWindowId()).toBe(7);
  });

  it('shares one in-flight request', async () => {
    const [a, b] = await Promise.all([windowId.getWindowId(), windowId.getWindowId()]);

    expect(a).toBe(7);
    expect(b).toBe(7);
    expect(h.getWindowId).toHaveBeenCalledTimes(1);
  });

  it('falls back to zero without the preload api', async () => {
    api.api = undefined;

    await expect(windowId.getWindowId()).resolves.toBe(0);
    expect(windowId.getCachedWindowId()).toBe(0);
  });

  it('returns zero before the id is resolved', () => {
    expect(windowId.getCachedWindowId()).toBe(0);
  });
});
