import { describe, expect, it } from 'vitest';
import { isServableMediaPath } from '../media/media-paths';

// Serwer mediów może oddać wyłącznie pliki o rozszerzeniu mediów/obrazów. Gdy
// przejęty renderer przyzna korzeń z kluczami lub konfiguracją, serwer i tak
// odmawia wydania takich plików — to brama ograniczająca eksfiltrację.
describe('isServableMediaPath', () => {
  it('accepts media and image extensions', () => {
    for (const p of [
      'C:\\media\\song.mp3',
      '/home/u/film.mkv',
      '/data/cover.JPG',
      'C:\\x\\clip.webm',
      '/a/b.flac',
      '/a/b.webp'
    ]) {
      expect(isServableMediaPath(p)).toBe(true);
    }
  });

  it('refuses non-media files even when they sit in an allowed root', () => {
    for (const p of ['C:\\Users\\u\\.ssh\\id_rsa', '/home/u/.env', '/a/cookies.txt', '/a/x.json']) {
      expect(isServableMediaPath(p)).toBe(false);
    }
  });

  it('refuses empty and extensionless paths', () => {
    expect(isServableMediaPath('')).toBe(false);
    expect(isServableMediaPath('/etc/passwd')).toBe(false);
  });
});
