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

  it('parses a valid link into a ref', () => {
    expect(directProvider.parse('https://host/a/movie.mp4')).toEqual({
      provider: 'direct',
      shareId: 'https://host/a/movie.mp4'
    });
  });

  it('rejects non-string input, credentials and malformed urls', () => {
    expect(directProvider.match(null as never)).toBe(false);
    expect(directProvider.match(42 as never)).toBe(false);
    expect(directProvider.match('https://user:pass@host/a.mp4')).toBe(false);
    expect(directProvider.match('https://:pass@host/a.mp4')).toBe(false);
    expect(directProvider.match('https://[::1/x.mp4')).toBe(false);
  });

  it('falls back to the host or raw url when the path has no usable file name', async () => {
    await expect(
      directProvider.listFolder({ provider: 'direct', shareId: 'https://example.com?x=.mp4' })
    ).resolves.toEqual([
      {
        id: 'https://example.com?x=.mp4',
        name: 'example.com',
        kind: 'file',
        parentId: null
      }
    ]);

    await expect(
      directProvider.listFolder({ provider: 'direct', shareId: 'https://host/a/%E0%A4%A.mp4' })
    ).resolves.toMatchObject([{ name: 'https://host/a/%E0%A4%A.mp4' }]);
  });
});
