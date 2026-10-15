import { describe, it, expect } from 'vitest';
import { detectProvider, getProvider, parseProviderUrl } from '../registry';

// Siatka regresyjna rejestru providerów: rozpoznawanie URL, budowa ref
// i dobór providera. Czyste — bez sieci.

describe('detectProvider', () => {
  it('detects a PikPak share link and returns its ref', () => {
    const res = detectProvider('https://mypikpak.com/s/VOg6ChzRdrq4PQcU5-Jo8RHno2');
    expect(res).toMatchObject({
      id: 'pikpak',
      label: 'PikPak',
      ref: { provider: 'pikpak', shareId: 'VOg6ChzRdrq4PQcU5-Jo8RHno2' }
    });
    expect(res?.capabilities).toMatchObject({ folders: true, anonymous: true, expiringLink: true });
  });

  it('accepts the .net host and www prefix', () => {
    expect(detectProvider('https://www.mypikpak.net/s/ABC123')?.ref.shareId).toBe('ABC123');
  });

  it('returns null for non-provider urls and empty input', () => {
    expect(detectProvider('https://www.youtube.com/watch?v=x')).toBeNull();
    expect(detectProvider('https://example.com/s/ABC')).toBeNull();
    expect(detectProvider('')).toBeNull();
  });

  it('detects MEGA file and folder links', () => {
    expect(detectProvider('https://mega.nz/file/abc123#key')?.id).toBe('mega');
    expect(detectProvider('https://mega.nz/folder/xyz#key')?.id).toBe('mega');
  });

  it('detects Google Drive file links and marks folders', () => {
    const file = detectProvider('https://drive.google.com/file/d/ABC123/view');
    expect(file?.id).toBe('gdrive');
    expect(file?.ref.shareId).toBe('ABC123');
    expect(detectProvider('https://drive.google.com/drive/folders/FLD')?.ref.shareId).toBe(
      'folder:FLD'
    );
  });

  it('detects yt-dlp hosters (Dropbox, Yandex.Disk, Internet Archive)', () => {
    expect(detectProvider('https://www.dropbox.com/s/abc/file.mp4?dl=0')?.id).toBe('dropbox');
    expect(detectProvider('https://disk.yandex.ru/d/abc')?.id).toBe('yandex');
    expect(detectProvider('https://yadi.sk/d/abc')?.id).toBe('yandex');
    expect(detectProvider('https://archive.org/details/xyz')?.id).toBe('archive');
  });

  it('detects TeraBox share links', () => {
    expect(detectProvider('https://www.terabox.com/s/ABC123')?.id).toBe('terabox');
    expect(detectProvider('https://1024terabox.com/s/XYZ')?.id).toBe('terabox');
  });

  it('detects 123pan share links', () => {
    expect(detectProvider('https://www.123pan.com/s/ABC')?.id).toBe('123pan');
  });

  it('no longer detects removed cloud providers', () => {
    expect(detectProvider('https://www.aliyundrive.com/s/ABC')).toBeNull();
    expect(detectProvider('https://115.com/s/ABC')).toBeNull();
    expect(detectProvider('https://pan.quark.cn/s/ABC')).toBeNull();
    expect(detectProvider('https://cloud.189.cn/web/share?code=ABC')).toBeNull();
    expect(detectProvider('https://pan.baidu.com/s/abc')).toBeNull();
    expect(detectProvider('https://pan.xunlei.com/s/ABC')).toBeNull();
  });

  it('detects a direct media link last, and leaves ordinary pages alone', () => {
    expect(detectProvider('https://example.com/a/b/movie.mp4')?.id).toBe('direct');
    expect(detectProvider('https://example.com/page')).toBeNull();
  });
});

describe('parseProviderUrl', () => {
  it('returns the provider and ref for a share link', () => {
    const parsed = parseProviderUrl('https://mypikpak.com/s/XYZ');
    expect(parsed?.provider.id).toBe('pikpak');
    expect(parsed?.ref).toEqual({ provider: 'pikpak', shareId: 'XYZ' });
  });

  it('returns null for an unknown url', () => {
    expect(parseProviderUrl('https://example.com/x')).toBeNull();
  });
});

describe('getProvider', () => {
  it('resolves known providers and misses unknown ids', () => {
    expect(getProvider('pikpak')?.id).toBe('pikpak');
    expect(getProvider('nope')).toBeUndefined();
  });
});
