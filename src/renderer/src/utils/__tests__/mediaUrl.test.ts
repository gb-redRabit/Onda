import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Cache bazowego URL serwera mediów jest stanem modułu, więc każdy przypadek dostaje
// świeży moduł (`vi.resetModules()` + dynamiczny import) zamiast produkcyjnego hooka reset.
const originalApi = window.api;

function stubApi(base: string): void {
  window.api = Object.assign({}, originalApi, {
    getMediaServerUrl: () => Promise.resolve(base)
  }) as Window['api'];
}

beforeEach(() => {
  vi.resetModules();
  window.api = originalApi;
});

afterEach(() => {
  window.api = originalApi;
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
