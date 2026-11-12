import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  cover: vi.fn(),
  still: vi.fn(),
  safe: vi.fn(),
  readable: vi.fn(),
  warn: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }
  }
}));
vi.mock('../cover-cache', () => ({
  extractAndCacheCover: mocks.cover,
  extractAndCacheStill: mocks.still
}));
vi.mock('../../../utils/validate', () => ({ isSafeAbsolutePath: mocks.safe }));
vi.mock('../../../media/read-access', () => ({ isReadableMediaPath: mocks.readable }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() }
}));

import { registerCoverHandlers } from '../cover-handlers';

function handler(channel: string) {
  const found = mocks.handlers.get(channel);
  if (!found) throw new Error(`${channel} not registered`);
  return found;
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.cover.mockReset().mockResolvedValue({ type: 'image', data: 'cover' });
  mocks.still.mockReset().mockResolvedValue({ type: 'image', data: 'still' });
  mocks.safe.mockReset().mockReturnValue(true);
  mocks.readable.mockReset().mockReturnValue(true);
  mocks.warn.mockClear();
  registerCoverHandlers();
});

describe('registration', () => {
  it('registers both cover channels', () => {
    expect([...mocks.handlers.keys()]).toEqual(['media:getCover', 'media:getCoverStill']);
  });
});

describe('media:getCover', () => {
  it('rejects unsafe paths without extracting', async () => {
    mocks.safe.mockReturnValue(false);

    await expect(handler('media:getCover')({}, '/bad')).resolves.toEqual({
      type: null,
      data: null
    });
    expect(mocks.cover).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(
      'cover',
      expect.stringContaining('rejected unsafe path')
    );
  });

  it('rejects paths outside allowed roots', async () => {
    mocks.readable.mockReturnValue(false);

    await expect(handler('media:getCover')({}, '/outside')).resolves.toEqual({
      type: null,
      data: null
    });
    expect(mocks.cover).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(
      'cover',
      expect.stringContaining('outside allowed roots')
    );
  });

  it('delegates readable paths', async () => {
    await expect(handler('media:getCover')({}, '/media/a.mp3')).resolves.toEqual({
      type: 'image',
      data: 'cover'
    });
    expect(mocks.cover).toHaveBeenCalledWith('/media/a.mp3');
  });
});

describe('media:getCoverStill', () => {
  it('rejects unsafe and unreadable paths', async () => {
    mocks.safe.mockReturnValue(false);
    await expect(handler('media:getCoverStill')({}, '/bad')).resolves.toEqual({
      type: null,
      data: null
    });

    mocks.safe.mockReturnValue(true);
    mocks.readable.mockReturnValue(false);
    await expect(handler('media:getCoverStill')({}, '/outside')).resolves.toEqual({
      type: null,
      data: null
    });

    expect(mocks.still).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledTimes(2);
  });

  it('delegates readable paths', async () => {
    await expect(handler('media:getCoverStill')({}, '/media/a.mp4')).resolves.toEqual({
      type: 'image',
      data: 'still'
    });
    expect(mocks.still).toHaveBeenCalledWith('/media/a.mp4');
  });
});
