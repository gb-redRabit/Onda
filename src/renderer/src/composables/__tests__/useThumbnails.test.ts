import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  assets: {
    thumbs: { value: {} },
    request: vi.fn(),
    get: vi.fn(),
    flush: vi.fn()
  } as Record<string, unknown>,
  useMediaAssets: vi.fn()
}));

vi.mock('../useMediaAssets', () => ({ useMediaAssets: h.useMediaAssets }));

import { useThumbnails } from '../useThumbnails';

describe('useThumbnails', () => {
  it('uses a batch thumbnail size by default', () => {
    h.useMediaAssets.mockReset().mockReturnValue(h.assets);

    useThumbnails();

    expect(h.useMediaAssets).toHaveBeenCalledWith(180);
  });

  it('passes a custom size through', () => {
    h.useMediaAssets.mockReset().mockReturnValue(h.assets);

    useThumbnails(96);

    expect(h.useMediaAssets).toHaveBeenCalledWith(96);
  });

  it('exposes the shared cache API with a renamed getter', () => {
    h.useMediaAssets.mockReset().mockReturnValue(h.assets);

    const api = useThumbnails();

    expect(api.thumbs).toBe(h.assets.thumbs);
    expect(api.request).toBe(h.assets.request);
    expect(api.getThumb).toBe(h.assets.get);
    expect(api.flush).toBe(h.assets.flush);
    expect(api).not.toHaveProperty('dispose');
  });
});
