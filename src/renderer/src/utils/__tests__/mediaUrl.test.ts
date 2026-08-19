import { describe, it, expect, afterEach } from 'vitest';
import { toMediaServerUrl, toMediaStreamUrl } from '../mediaUrl';

const originalApi = window.api;

afterEach(() => {
  window.api = originalApi;
});

describe('toMediaServerUrl', () => {
  it('encodes backslashes as forward slashes in the path', () => {
    window.api = Object.assign({}, originalApi, {
      mediaServerUrl: 'http://localhost:5173'
    }) as Window['api'];
    expect(toMediaServerUrl('C:\\Music\\song.mp3')).toBe(
      'http://localhost:5173/?path=C%3A%2FMusic%2Fsong.mp3'
    );
  });

  it('url-encodes special characters', () => {
    window.api = Object.assign({}, originalApi, {
      mediaServerUrl: 'http://localhost:5173'
    }) as Window['api'];
    expect(toMediaServerUrl('C:/Mu sic/song#1.mp3')).toBe(
      'http://localhost:5173/?path=C%3A%2FMu%20sic%2Fsong%231.mp3'
    );
  });

  it('returns path-only when no media server base is set', () => {
    window.api = Object.assign({}, originalApi, { mediaServerUrl: '' }) as Window['api'];
    expect(toMediaServerUrl('a/b.mp3')).toBe('/?path=a%2Fb.mp3');
  });
});

describe('toMediaStreamUrl', () => {
  it('routes remote streams through the /stream proxy', () => {
    window.api = Object.assign({}, originalApi, {
      mediaServerUrl: 'http://127.0.0.1:4242/abc'
    }) as Window['api'];
    expect(toMediaStreamUrl('https://rr1.googlevideo.com/videoplayback?ip=1.2.3.4')).toBe(
      'http://127.0.0.1:4242/abc/stream?url=https%3A%2F%2Frr1.googlevideo.com%2Fvideoplayback%3Fip%3D1.2.3.4'
    );
  });
});
