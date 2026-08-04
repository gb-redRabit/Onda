import { describe, it, expect } from 'vitest';
import { ytdlpBinaryName, ytdlpDownloadUrl, getMkvExtractCandidates } from '../dependency-utils';

describe('ytdlpBinaryName', () => {
  it('returns the right file name for the current platform', () => {
    const expected = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    expect(ytdlpBinaryName()).toBe(expected);
  });
});

describe('ytdlpDownloadUrl', () => {
  it('maps every platform to a yt-dlp release asset', () => {
    expect(ytdlpDownloadUrl('win32')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    );
    expect(ytdlpDownloadUrl('darwin')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
    );
    expect(ytdlpDownloadUrl('linux')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
    );
    expect(ytdlpDownloadUrl('freebsd')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
    );
  });
});

describe('getMkvExtractCandidates', () => {
  it('always proposes the PATH binary first', () => {
    const candidates = getMkvExtractCandidates();
    expect(candidates[0]).toBe('mkvextract');
  });

  it('includes platform-specific fallbacks', () => {
    const candidates = getMkvExtractCandidates();
    if (process.platform === 'win32') {
      expect(candidates).toContain('C:\\Program Files\\MKVToolNix\\mkvextract.exe');
      expect(candidates).toContain('C:\\Program Files (x86)\\MKVToolNix\\mkvextract.exe');
    } else {
      expect(candidates).toContain('/usr/bin/mkvextract');
      expect(candidates).toContain('/opt/homebrew/bin/mkvextract');
    }
  });
});
