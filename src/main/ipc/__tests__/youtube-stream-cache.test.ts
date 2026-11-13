import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { appState } = vi.hoisted(() => ({ appState: { userData: '' } }));

vi.mock('electron', () => ({
  app: { getPath: () => appState.userData }
}));

const dir = mkdtempSync(join(tmpdir(), 'onda-yt-cache-'));
const cacheFile = () => join(dir, 'stream-url-cache.json');

beforeEach(async () => {
  appState.userData = dir;
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  rmSync(cacheFile(), { force: true });
});

afterAll(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

describe('youtube stream cache', () => {
  it('caches a URL and flushes it to disk', async () => {
    const { cacheStream, getCachedStream, flushStreamCache } =
      await import('../youtube/youtube-stream-cache');
    cacheStream('watch:1', 'https://cdn/1');
    expect(getCachedStream('watch:1')).toMatchObject({ url: 'https://cdn/1' });

    flushStreamCache();
    expect(existsSync(cacheFile())).toBe(true);
    expect(readFileSync(cacheFile(), 'utf8')).toContain('https://cdn/1');
  });

  it('expires entries and restores them after a module reload', async () => {
    const first = await import('../youtube/youtube-stream-cache');
    first.cacheStream('watch:2', 'https://cdn/2');
    first.flushStreamCache();

    vi.resetModules();
    const second = await import('../youtube/youtube-stream-cache');
    expect(second.getCachedStream('watch:2', 1_000_001)).toMatchObject({
      url: 'https://cdn/2'
    });
    expect(second.getCachedStream('watch:2', 1_000_000 + 5 * 60 * 60 * 1000 + 1)).toBeUndefined();
  });

  it('keeps the LRU at 100 entries', async () => {
    const { cacheStream, getCachedStream } = await import('../youtube/youtube-stream-cache');
    for (let i = 0; i < 101; i++) cacheStream(`watch:${i}`, `https://cdn/${i}`);
    expect(getCachedStream('watch:0')).toBeUndefined();
    expect(getCachedStream('watch:100')).toMatchObject({ url: 'https://cdn/100' });
  });

  it('clears the in-memory and persistent cache', async () => {
    const { cacheStream, clearStreamCache, flushStreamCache, getCachedStream } =
      await import('../youtube/youtube-stream-cache');
    cacheStream('watch:3', 'https://cdn/3');
    flushStreamCache();
    expect(clearStreamCache()).toMatchObject({ entries: 1, removed: 1 });
    expect(getCachedStream('watch:3')).toBeUndefined();
    expect(existsSync(cacheFile())).toBe(false);
  });

  it('does not overwrite an existing file when nothing was loaded', async () => {
    writeFileSync(cacheFile(), '[{"url":"old","streamUrl":"https://old","expires":9999999999}]');
    const { flushStreamCache } = await import('../youtube/youtube-stream-cache');
    flushStreamCache();
    expect(readFileSync(cacheFile(), 'utf8')).toContain('https://old');
  });

  it('skips unusable persisted entries and keeps the rest', async () => {
    writeFileSync(
      cacheFile(),
      JSON.stringify([
        { url: 'no-stream', expires: 9_999_999_999 },
        { url: 'expired', streamUrl: 'https://x', expires: 1 },
        { url: 'bad-expiry', streamUrl: 'https://y', expires: 'soon' },
        { url: '', streamUrl: 'https://z', expires: 9_999_999_999 },
        { url: 'good', streamUrl: 'https://ok', expires: 9_999_999_999 }
      ])
    );
    const { getCachedStream } = await import('../youtube/youtube-stream-cache');

    expect(getCachedStream('good')).toMatchObject({ url: 'https://ok' });
    expect(getCachedStream('expired')).toBeUndefined();
    expect(getCachedStream('no-stream')).toBeUndefined();
  });

  it('starts empty when every persisted entry is unusable', async () => {
    writeFileSync(
      cacheFile(),
      JSON.stringify([{ url: 'expired', streamUrl: 'https://x', expires: 1 }])
    );
    const { getCachedStream } = await import('../youtube/youtube-stream-cache');

    expect(getCachedStream('expired')).toBeUndefined();
  });

  it('saves once the debounce timer fires', async () => {
    const { cacheStream } = await import('../youtube/youtube-stream-cache');
    cacheStream('watch:t', 'https://cdn/t');

    expect(existsSync(cacheFile())).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(existsSync(cacheFile())).toBe(true);
  });

  it('cancels a pending save when the cache is cleared', async () => {
    const { cacheStream, clearStreamCache } = await import('../youtube/youtube-stream-cache');
    cacheStream('watch:c', 'https://cdn/c');

    expect(clearStreamCache()).toMatchObject({ entries: 1, removed: 0 });
    vi.advanceTimersByTime(1000);
    expect(existsSync(cacheFile())).toBe(false);
  });

  it('logs a failed save without throwing', async () => {
    const { cacheStream, flushStreamCache } = await import('../youtube/youtube-stream-cache');
    const { logger } = await import('../../../shared/logger');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    mkdirSync(cacheFile(), { recursive: true });
    try {
      cacheStream('watch:f', 'https://cdn/f');
      flushStreamCache();

      expect(warn).toHaveBeenCalledWith('yt', 'stream cache save failed', expect.any(String));
    } finally {
      rmSync(cacheFile(), { recursive: true, force: true });
      warn.mockRestore();
    }
  });
});
