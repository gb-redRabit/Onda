import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Cache bazowego URL serwera mediów jest stanem modułu, więc każdy przypadek dostaje
// świeży moduł (`vi.resetModules()` + dynamiczny import) zamiast produkcyjnego hooka reset.
const originalApi = window.api;
const originalCreateObjectUrl = URL.createObjectURL;

function stubApi(base: string): void {
  stubApiCall(() => Promise.resolve(base));
}

function stubApiCall(getMediaServerUrl: () => Promise<string>): void {
  window.api = Object.assign({}, originalApi, { getMediaServerUrl }) as Window['api'];
}

beforeEach(() => {
  vi.resetModules();
  window.api = originalApi;
});

afterEach(() => {
  window.api = originalApi;
  vi.unstubAllGlobals();
  if (originalCreateObjectUrl) URL.createObjectURL = originalCreateObjectUrl;
  else delete (URL as { createObjectURL?: unknown }).createObjectURL;
});

type MediaUrlModule = typeof import('../mediaUrl');

async function load(): Promise<MediaUrlModule> {
  return import('../mediaUrl');
}

describe('toMediaServerUrl', () => {
  it('encodes backslashes as forward slashes in the path', async () => {
    stubApi('http://localhost:5173');
    const { ensureMediaServerUrl, toMediaServerUrl } = await load();
    await ensureMediaServerUrl();
    expect(toMediaServerUrl('C:\\Music\\song.mp3')).toBe(
      'http://localhost:5173/?path=C%3A%2FMusic%2Fsong.mp3'
    );
  });

  it('url-encodes special characters', async () => {
    stubApi('http://localhost:5173');
    const { ensureMediaServerUrl, toMediaServerUrl } = await load();
    await ensureMediaServerUrl();
    expect(toMediaServerUrl('C:/Mu sic/song#1.mp3')).toBe(
      'http://localhost:5173/?path=C%3A%2FMu%20sic%2Fsong%231.mp3'
    );
  });

  it('returns path-only when no media server base is set', async () => {
    stubApi('');
    const { ensureMediaServerUrl, toMediaServerUrl } = await load();
    await ensureMediaServerUrl();
    expect(toMediaServerUrl('a/b.mp3')).toBe('/?path=a%2Fb.mp3');
  });
});

describe('toMediaStreamUrl', () => {
  it('routes remote streams through the /stream proxy', async () => {
    stubApi('http://127.0.0.1:4242/abc');
    const { ensureMediaServerUrl, toMediaStreamUrl } = await load();
    await ensureMediaServerUrl();
    expect(toMediaStreamUrl('https://rr1.googlevideo.com/videoplayback?ip=1.2.3.4')).toBe(
      'http://127.0.0.1:4242/abc/stream?url=https%3A%2F%2Frr1.googlevideo.com%2Fvideoplayback%3Fip%3D1.2.3.4'
    );
  });
});

describe('ensureMediaServerUrl', () => {
  it('returns the cached base on later calls and exposes it synchronously', async () => {
    stubApi('http://media.local');
    const { ensureMediaServerUrl, mediaServerBase } = await load();
    expect(mediaServerBase()).toBe('');

    await expect(ensureMediaServerUrl()).resolves.toBe('http://media.local');
    expect(mediaServerBase()).toBe('http://media.local');
    await expect(ensureMediaServerUrl()).resolves.toBe('http://media.local');
  });

  it('shares one in-flight request between concurrent callers', async () => {
    let resolveBase!: (value: string) => void;
    stubApiCall(() => new Promise<string>((resolve) => (resolveBase = resolve)));
    const { ensureMediaServerUrl } = await load();

    const first = ensureMediaServerUrl();
    const second = ensureMediaServerUrl();
    expect(second).toBe(first);

    resolveBase('http://media.local');
    await expect(first).resolves.toBe('http://media.local');
  });

  it('falls back to an empty base when the bridge fails', async () => {
    stubApiCall(() => Promise.reject(new Error('ipc failure')));
    const { ensureMediaServerUrl, mediaServerBase } = await load();

    await expect(ensureMediaServerUrl()).resolves.toBe('');
    expect(mediaServerBase()).toBe('');
  });
});

describe('loadScaledImageUrl', () => {
  it('fetches a scaled image and turns the blob into an object URL', async () => {
    const blob = new Blob(['pixels']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectUrl = vi.fn(() => 'blob:scaled');
    URL.createObjectURL = createObjectUrl as never;
    const { loadScaledImageUrl } = await load();

    await expect(loadScaledImageUrl('C:\\Pictures\\a b.png')).resolves.toBe('blob:scaled');
    expect(fetchMock).toHaveBeenCalledWith('onda:///?path=C%3A%5CPictures%5Ca%20b.png&w=1920');
    expect(createObjectUrl).toHaveBeenCalledWith(blob);

    await loadScaledImageUrl('C:\\Pictures\\a.png', 640);
    expect(fetchMock).toHaveBeenLastCalledWith('onda:///?path=C%3A%5CPictures%5Ca.png&w=640');
  });

  it('rejects when the scaled fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
    const { loadScaledImageUrl } = await load();

    await expect(loadScaledImageUrl('C:\\a.png')).rejects.toThrow('Not Found');
  });
});
