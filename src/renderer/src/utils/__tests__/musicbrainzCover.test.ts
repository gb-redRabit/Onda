import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverBytesToDataUrl, getMusicbrainzCover } from '../musicbrainzCover';

afterEach(() => {
  delete (window as { api?: unknown }).api;
});

describe('getMusicbrainzCover', () => {
  it('delegates to the preload bridge', async () => {
    const fn = vi.fn(async () => ({ success: true, data: [1], mime: 'image/jpeg' }));
    (window as { api?: unknown }).api = { musicbrainzGetCoverData: fn };

    await expect(getMusicbrainzCover('release-id')).resolves.toMatchObject({ success: true });
    expect(fn).toHaveBeenCalledWith('release-id');
  });

  it('returns undefined when the bridge is unavailable', () => {
    expect(getMusicbrainzCover('release-id')).toBeUndefined();
  });
});

describe('coverBytesToDataUrl', () => {
  it('encodes bytes as a jpeg data URL by default', () => {
    expect(coverBytesToDataUrl([1, 2, 3])).toBe(
      `data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString('base64')}`
    );
  });

  it('honours an explicit mime type', () => {
    expect(coverBytesToDataUrl([255], 'image/png')).toBe('data:image/png;base64,/w==');
  });

  it('handles an empty payload', () => {
    expect(coverBytesToDataUrl([])).toBe('data:image/jpeg;base64,');
  });

  it('encodes payloads larger than the internal chunk size', () => {
    const bytes = Array.from({ length: 20_000 }, (_, i) => i % 256);
    expect(coverBytesToDataUrl(bytes)).toBe(
      `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`
    );
  });
});
