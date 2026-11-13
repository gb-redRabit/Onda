import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handle: vi.fn(),
  clearAppCaches: vi.fn(async () => undefined)
}));

vi.mock('electron', () => ({ ipcMain: { handle: h.handle } }));
vi.mock('../app-cache', () => ({ clearAppCaches: h.clearAppCaches }));

import { registerCacheHandlers } from '../cache-handlers';

describe('registerCacheHandlers', () => {
  it('registers the cache clear channel and delegates to clearAppCaches', async () => {
    registerCacheHandlers();

    expect(h.handle).toHaveBeenCalledWith('cache:clear', expect.any(Function));
    const handler = h.handle.mock.calls[0][1] as () => Promise<unknown>;
    await expect(handler()).resolves.toBeUndefined();
    expect(h.clearAppCaches).toHaveBeenCalledTimes(1);
  });
});
