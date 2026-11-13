import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  userData: '/user-data',
  readFile: vi.fn(),
  writeJsonAtomic: vi.fn(async () => undefined)
}));

vi.mock('electron', () => ({ app: { getPath: () => h.userData } }));
vi.mock('node:fs/promises', () => ({ readFile: h.readFile }));
vi.mock('../../../utils/write-queue', () => ({ writeJsonAtomic: h.writeJsonAtomic }));

import {
  __resetProviderCache,
  flushProviderCache,
  getCachedFileUrl,
  getCachedFolder,
  setCachedFileUrl,
  setCachedFolder
} from '../provider-cache';

const cachePath = () => join(h.userData, 'providers-cache.json');
const item = (id: string) => ({ id, name: id, kind: 'file' }) as never;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
  __resetProviderCache();
  h.readFile.mockReset().mockRejectedValue(new Error('ENOENT'));
  h.writeJsonAtomic.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('folder cache', () => {
  it('stores, returns and touches folders in LRU order', async () => {
    await setCachedFolder('a', [item('1')]);
    await setCachedFolder('b', [item('2')]);

    await expect(getCachedFolder('a')).resolves.toEqual([item('1')]);
    await expect(getCachedFolder('missing')).resolves.toBeNull();
  });

  it('persists folders after the debounce', async () => {
    await setCachedFolder('a', [item('1')]);

    expect(h.writeJsonAtomic).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);

    expect(h.writeJsonAtomic).toHaveBeenCalledWith(cachePath(), {
      folders: { a: expect.objectContaining({ items: [item('1')] }) }
    });
  });

  it('evicts the oldest folder beyond the limit', async () => {
    for (let i = 0; i < 301; i += 1) {
      await setCachedFolder(`f-${i}`, [item(`${i}`)]);
    }

    await expect(getCachedFolder('f-0')).resolves.toBeNull();
    await expect(getCachedFolder('f-300')).resolves.toEqual([item('300')]);
  });

  it('loads persisted folders and ignores malformed entries', async () => {
    h.readFile.mockResolvedValue(
      JSON.stringify({
        folders: {
          good: { items: [item('x')], at: 1 },
          bad: { items: 'nope', at: 1 },
          nullish: null
        }
      })
    );

    await expect(getCachedFolder('good')).resolves.toEqual([item('x')]);
    await expect(getCachedFolder('bad')).resolves.toBeNull();
  });

  it('starts empty when the persisted file is invalid', async () => {
    h.readFile.mockResolvedValue('{not-json');

    await expect(getCachedFolder('any')).resolves.toBeNull();
  });
});

describe('file url cache', () => {
  it('stores urls with headers and refreshes them', async () => {
    await setCachedFileUrl('k', 'https://cdn/a', { a: 'b' });

    await expect(getCachedFileUrl('k')).resolves.toEqual({
      url: 'https://cdn/a',
      headers: { a: 'b' }
    });
    await expect(getCachedFileUrl('missing')).resolves.toBeNull();
  });

  it('expires entries after ten minutes', async () => {
    await setCachedFileUrl('k', 'https://cdn/a');

    vi.advanceTimersByTime(10 * 60 * 1000);
    await expect(getCachedFileUrl('k')).resolves.toMatchObject({ url: 'https://cdn/a' });

    vi.advanceTimersByTime(1);
    await expect(getCachedFileUrl('k')).resolves.toBeNull();
  });

  it('evicts the oldest url beyond the limit', async () => {
    for (let i = 0; i < 1001; i += 1) {
      await setCachedFileUrl(`k-${i}`, `https://cdn/${i}`);
    }

    await expect(getCachedFileUrl('k-0')).resolves.toBeNull();
    await expect(getCachedFileUrl('k-1000')).resolves.toEqual({ url: 'https://cdn/1000' });
  });
});

describe('flushing', () => {
  it('cancels the debounce and writes immediately', async () => {
    await setCachedFolder('a', [item('1')]);

    await flushProviderCache();

    expect(h.writeJsonAtomic).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.writeJsonAtomic).toHaveBeenCalledTimes(1);
  });

  it('tolerates a persistence failure', async () => {
    h.writeJsonAtomic.mockRejectedValueOnce(new Error('disk'));

    await expect(flushProviderCache()).resolves.toBeUndefined();
  });
});
