import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeJsonAtomic: vi.fn()
}));

vi.mock('electron', () => {
  throw new Error('electron unavailable');
});
vi.mock('node:fs/promises', () => ({ readFile: h.readFile }));
vi.mock('../../../utils/write-queue', () => ({ writeJsonAtomic: h.writeJsonAtomic }));

import {
  flushProviderCache,
  getCachedFileUrl,
  getCachedFolder,
  setCachedFileUrl,
  setCachedFolder
} from '../provider-cache';

const item = { id: 'a', name: 'a', kind: 'file' } as never;

describe('cache without Electron', () => {
  it('disables every cache operation', async () => {
    await setCachedFolder('a', [item]);
    await setCachedFileUrl('k', 'https://cdn/a');

    await expect(getCachedFolder('a')).resolves.toBeNull();
    await expect(getCachedFileUrl('k')).resolves.toBeNull();

    await flushProviderCache();

    expect(h.readFile).not.toHaveBeenCalled();
    expect(h.writeJsonAtomic).not.toHaveBeenCalled();
  });
});
