import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const state = vi.hoisted(() => ({ userData: '' }));
const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn() }));

vi.mock('electron', () => ({ app: { getPath: () => state.userData } }));
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
});

describe('isAllowedUploadUrl', () => {
  it('accepts only the catbox file host over https', () => {
    expect(isAllowedUploadUrl(` ${UPLOADED_URL}\n`)).toBe(UPLOADED_URL);
    expect(isAllowedUploadUrl('https://evil.test/abc.jpg')).toBeNull();
    expect(isAllowedUploadUrl('http://files.catbox.moe/abc.jpg')).toBeNull();
    expect(isAllowedUploadUrl('not a url')).toBeNull();
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
});
