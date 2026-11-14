import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

const state = vi.hoisted(() => ({ userData: '', throwPath: false }));
const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn() }));

vi.mock('electron', () => ({
  app: {
    getPath: () => {
      if (state.throwPath) throw new Error('app is not ready');
      return state.userData;
    }
  }
}));
vi.mock('../../ipc/cover/cover-cache', () => ({
  extractAndCacheCover: (filePath: string) => extractMock(filePath)
}));

import { isAllowedUploadUrl, parseCoverDataUrl, resolveLocalCover } from '../cover-upload';

const COVER = Buffer.from('fake-jpeg-bytes');
const DATA_URL = `data:image/jpeg;base64,${COVER.toString('base64')}`;
const UPLOADED_URL = 'https://files.catbox.moe/abc123.jpg';

let dir = '';
let file = '';
let seq = 0;

function uploadsPath(): string {
  return join(state.userData, 'discord-cover-uploads.json');
}

beforeAll(async () => {
  state.userData = await mkdtemp(join(tmpdir(), 'onda-upload-'));
});

afterAll(async () => {
  await rm(state.userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-media-'));
  seq += 1;
  file = join(dir, `track-${seq}.mp3`);
  await writeFile(file, 'audio');
  extractMock.mockReset();
  extractMock.mockResolvedValue({ type: 'image', data: DATA_URL });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('parseCoverDataUrl', () => {
  it('decodes jpeg data URLs and rejects other payloads', () => {
    expect(parseCoverDataUrl(DATA_URL)).toMatchObject({ mime: 'image/jpeg', ext: 'jpg' });
    expect(parseCoverDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(parseCoverDataUrl('https://example.com/cover.jpg')).toBeNull();
  });

  it('maps png extensions and rejects non-strings, empty and oversized payloads', () => {
    expect(parseCoverDataUrl('data:image/png;base64,AAAA')).toMatchObject({
      mime: 'image/png',
      ext: 'png'
    });
    expect(parseCoverDataUrl(null)).toBeNull();
    expect(parseCoverDataUrl('data:image/png;base64,====')).toBeNull();

    const huge = `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`;
    expect(parseCoverDataUrl(huge)).toBeNull();
  });
});

describe('isAllowedUploadUrl', () => {
  it('accepts only the catbox file host over https', () => {
    expect(isAllowedUploadUrl(` ${UPLOADED_URL}\n`)).toBe(UPLOADED_URL);
    expect(isAllowedUploadUrl('https://evil.test/abc.jpg')).toBeNull();
    expect(isAllowedUploadUrl('http://files.catbox.moe/abc.jpg')).toBeNull();
    expect(isAllowedUploadUrl('not a url')).toBeNull();
    expect(isAllowedUploadUrl(null)).toBeNull();
  });
});

describe('resolveLocalCover', () => {
  it('uploads the cover once and reuses the persisted URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => UPLOADED_URL });
    vi.stubGlobal('fetch', fetchMock);

    expect(await resolveLocalCover(file)).toBe(UPLOADED_URL);
    expect(await resolveLocalCover(file)).toBe(UPLOADED_URL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(extractMock).toHaveBeenCalledTimes(1);
  });

  it('rejects paths that are not local media files', async () => {
    expect(await resolveLocalCover('relative/track.mp3')).toBeNull();
    expect(await resolveLocalCover(join(dir, 'notes.txt'))).toBeNull();
  });

  it('returns null when the file has no cover or the upload fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await resolveLocalCover(file)).toBeNull();

    vi.unstubAllGlobals();
    extractMock.mockResolvedValue({ type: null, data: null });
    expect(await resolveLocalCover(file)).toBeNull();
  });

  it('returns null for thrown uploads and unexpected uploaded urls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await resolveLocalCover(file)).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('plain failure'));
    expect(await resolveLocalCover(file)).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'https://evil.test/x.jpg' })
    );
    expect(await resolveLocalCover(file)).toBeNull();
  });

  it('skips a cover payload that is not a decodable image', async () => {
    extractMock.mockResolvedValue({ type: 'image', data: 'data:image/png;base64,====' });

    expect(await resolveLocalCover(file)).toBeNull();
  });

  it('returns null for a missing file', async () => {
    expect(await resolveLocalCover(join(dir, 'missing.mp3'))).toBeNull();
  });

  it('deduplicates in-flight uploads and serializes the records', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await gate;
      return { ok: true, text: async () => UPLOADED_URL };
    });
    vi.stubGlobal('fetch', fetchMock);
    const other = join(dir, 'other.mp3');
    await writeFile(other, 'audio');

    const first = resolveLocalCover(file);
    const duplicate = resolveLocalCover(file);
    const second = resolveLocalCover(other);

    release();
    await expect(first).resolves.toBe(UPLOADED_URL);
    await expect(duplicate).resolves.toBe(UPLOADED_URL);
    await expect(second).resolves.toBe(UPLOADED_URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('re-uploads when the cached url is not allowed', async () => {
    const mtime = statSync(file).mtimeMs;
    writeFileSync(
      uploadsPath(),
      JSON.stringify({ [file]: { url: 'https://evil.test/x.jpg', mtime, at: 1 } })
    );
    vi.resetModules();
    const mod = await import('../cover-upload');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => UPLOADED_URL });
    vi.stubGlobal('fetch', fetchMock);

    await expect(mod.resolveLocalCover(file)).resolves.toBe(UPLOADED_URL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('starts empty when the persisted map is not an object', async () => {
    writeFileSync(uploadsPath(), 'null');
    vi.resetModules();
    const mod = await import('../cover-upload');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => UPLOADED_URL }));

    await expect(mod.resolveLocalCover(file)).resolves.toBe(UPLOADED_URL);
  });

  it('caps the persisted map at 500 entries', async () => {
    const entries: Record<string, { url: string; mtime: number; at: number }> = {};
    for (let i = 0; i < 500; i += 1) {
      entries[`/old/${i}.mp3`] = { url: `https://files.catbox.moe/${i}.jpg`, mtime: 1, at: i };
    }
    writeFileSync(uploadsPath(), JSON.stringify(entries));
    vi.resetModules();
    const mod = await import('../cover-upload');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => UPLOADED_URL }));

    await expect(mod.resolveLocalCover(file)).resolves.toBe(UPLOADED_URL);

    const saved = JSON.parse(readFileSync(uploadsPath(), 'utf-8')) as Record<string, unknown>;
    expect(Object.keys(saved)).toHaveLength(500);
    expect(saved['/old/0.mp3']).toBeUndefined();
    expect(saved[file]).toBeDefined();
  });

  it('falls back to the temp dir when userData is unavailable', async () => {
    state.throwPath = true;
    try {
      vi.resetModules();
      const mod = await import('../cover-upload');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      await expect(mod.resolveLocalCover(file)).resolves.toBeNull();
    } finally {
      state.throwPath = false;
    }
  });

  it('aborts a stalled upload after the timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const fetchMock = vi.fn(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );
      vi.stubGlobal('fetch', fetchMock);
      const pending = resolveLocalCover(file);

      for (let i = 0; i < 500 && fetchMock.mock.calls.length === 0; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
