import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearCoverCache: vi.fn(),
  clearThumbnailCache: vi.fn(),
  clearStreamCache: vi.fn(),
  clearRemoteImageCache: vi.fn()
}));

vi.mock('../cover-cache', () => ({ clearCoverCache: mocks.clearCoverCache }));
vi.mock('../media-thumbnails', () => ({ clearThumbnailCache: mocks.clearThumbnailCache }));
vi.mock('../youtube-stream-cache', () => ({ clearStreamCache: mocks.clearStreamCache }));
vi.mock('../remote-image', () => ({ clearRemoteImageCache: mocks.clearRemoteImageCache }));

import { clearAppCaches } from '../app-cache';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.clearCoverCache.mockResolvedValue({ removed: 2, bytesFreed: 100 });
  mocks.clearThumbnailCache.mockResolvedValue({ removed: 3, bytesFreed: 200 });
  mocks.clearStreamCache.mockReturnValue({ entries: 4, removed: 1, bytesFreed: 50 });
  mocks.clearRemoteImageCache.mockReturnValue(5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clearAppCaches', () => {
  it('clears every cache and aggregates file and byte counts', async () => {
    const result = await clearAppCaches();

    expect(result).toEqual({ success: true, filesRemoved: 6, bytesFreed: 350 });
    expect(mocks.clearCoverCache).toHaveBeenCalledOnce();
    expect(mocks.clearThumbnailCache).toHaveBeenCalledOnce();
    expect(mocks.clearStreamCache).toHaveBeenCalledOnce();
    expect(mocks.clearRemoteImageCache).toHaveBeenCalledOnce();
  });

  it('reports a failure when one of the caches throws', async () => {
    mocks.clearThumbnailCache.mockRejectedValue(new Error('EBUSY'));

    const result = await clearAppCaches();

    expect(result.success).toBe(false);
    expect(result.filesRemoved).toBe(0);
    expect(result.bytesFreed).toBe(0);
    expect(result.error).toBe('EBUSY');
  });
});
