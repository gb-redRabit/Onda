import { describe, it, expect } from 'vitest';
import { directProvider } from '../direct';

// Siatka regresyjna providera „direct link" (bez yt-dlp): rozpoznanie rozszerzenia,
// nazwa z URL i zwrot tego samego URL-a do pobrania.

describe('direct provider', () => {
  it('matches only media/file links with a known extension', () => {
    expect(directProvider.match('https://host/a/movie.mp4')).toBe(true);
    expect(directProvider.match('https://host/a/song.mp3?token=1')).toBe(true);
    expect(directProvider.match('https://host/a/page')).toBe(false);
    expect(directProvider.match('https://www.youtube.com/watch?v=x')).toBe(false);
  });

  it('returns a single item with the file name derived from the url', () => {
    const ref = { provider: 'direct', shareId: 'https://host/a/My%20Movie.mp4' };
    return expect(directProvider.listFolder(ref)).resolves.toEqual([
      { id: 'https://host/a/My%20Movie.mp4', name: 'My Movie.mp4', kind: 'file', parentId: null }
    ]);
  });

  it('resolves to the original url', async () => {
    const ref = { provider: 'direct', shareId: 'https://host/a/movie.mp4' };
    await expect(directProvider.resolveFileUrl(ref, ref.shareId)).resolves.toEqual({
      url: 'https://host/a/movie.mp4'
    });
  });

  it('rejects loopback, private network and non-media urls in match, listFolder and resolveFileUrl', async () => {
    for (const bad of [
      'http://127.0.0.1:8080/secret.mp4',
      'http://localhost/video.mp4',
      'http://192.168.1.10/video.mp4',
      'http://169.254.169.254/latest/meta-data/video.mp4',
      'http://127.0.0.1:8080/admin',
      'file:///C:/Windows/win.ini.mp4'
    ]) {
      expect(directProvider.match(bad)).toBe(false);
      expect(directProvider.parse(bad)).toBeNull();
      await expect(
        directProvider.listFolder({ provider: 'direct', shareId: bad })
      ).rejects.toThrow();
      await expect(
        directProvider.resolveFileUrl({ provider: 'direct', shareId: bad }, bad)
      ).rejects.toThrow();
    }
  });
});
