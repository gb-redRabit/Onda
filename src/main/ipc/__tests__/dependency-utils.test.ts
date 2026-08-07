import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ytdlpBinaryName,
  ytdlpDownloadUrl,
  ytdlpShaUrl,
  ffmpegDownloadUrl,
  ffmpegShaUrl,
  whichInPath,
  inferPkgManager,
  getMkvExtractCandidates
} from '../dependency-utils';

describe('ytdlpBinaryName', () => {
  it('returns the right file name for the current platform', () => {
    const expected = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    expect(ytdlpBinaryName()).toBe(expected);
  });
});

describe('ytdlpDownloadUrl', () => {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04';
  it('maps every platform to a pinned yt-dlp release asset', () => {
    expect(ytdlpDownloadUrl('win32')).toBe(`${base}/yt-dlp.exe`);
    expect(ytdlpDownloadUrl('linux')).toBe(`${base}/yt-dlp`);
    expect(ytdlpDownloadUrl('freebsd')).toBe(`${base}/yt-dlp`);
  });

  it('picks apple-silicon assets on arm64 macOS and legacy on x64', () => {
    expect(ytdlpDownloadUrl('darwin', 'arm64')).toBe(`${base}/yt-dlp_macos`);
    expect(ytdlpDownloadUrl('darwin', 'x64')).toBe(`${base}/yt-dlp_macos_legacy`);
  });

  it('uses the aarch64 asset on 32/64-bit ARM Linux and the generic one elsewhere', () => {
    expect(ytdlpDownloadUrl('linux', 'arm64')).toBe(`${base}/yt-dlp_linux_aarch64`);
    expect(ytdlpDownloadUrl('linux', 'arm')).toBe(`${base}/yt-dlp_linux_aarch64`);
    expect(ytdlpDownloadUrl('linux', 'x64')).toBe(`${base}/yt-dlp`);
  });

  it('never uses the mutable latest redirect', () => {
    expect(ytdlpDownloadUrl('win32')).not.toContain('/latest/');
    expect(ytdlpDownloadUrl('win32')).toContain('/releases/download/');
  });

  it('honours an explicit version (used by the in-app updater)', () => {
    expect(ytdlpDownloadUrl('win32', 'x64', '2026.01.01')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.01.01/yt-dlp.exe'
    );
  });

  it('points the checksum source at the pinned SHA2-256SUMS manifest', () => {
    expect(ytdlpShaUrl()).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/SHA2-256SUMS'
    );
    expect(ytdlpShaUrl('2026.01.01')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.01.01/SHA2-256SUMS'
    );
  });
});

describe('ffmpegDownloadUrl / ffmpegShaUrl', () => {
  it('serves a Windows zip and null on other platforms', () => {
    expect(ffmpegDownloadUrl('win32')).toContain('ffmpeg-master-latest-win64-gpl.zip');
    expect(ffmpegDownloadUrl('linux')).toBeNull();
  });

  it('points the checksum at the sibling .sha256 file of the zip', () => {
    expect(ffmpegShaUrl('win32')).toBe(`${ffmpegDownloadUrl('win32')}.sha256`);
    expect(ffmpegShaUrl('linux')).toBeNull();
  });
});

describe('whichInPath', () => {
  it('finds executables whether the name already carries the extension or not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'onda-which-'));
    const exe = join(dir, 'ffprobe.exe');
    writeFileSync(exe, 'x');
    const prevPath = process.env.PATH;
    process.env.PATH = dir;
    try {
      expect(whichInPath('ffprobe.exe')).toBe(exe);
      expect(whichInPath('ffprobe')).toBe(exe);
    } finally {
      process.env.PATH = prevPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('inferPkgManager', () => {
  it('recognizes manager-specific install locations', () => {
    expect(inferPkgManager('C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe')).toBe('choco');
    expect(
      inferPkgManager('C:\\Users\\x\\AppData\\Local\\Microsoft\\WinGet\\Links\\yt-dlp.exe')
    ).toBe('winget');
    expect(inferPkgManager('C:\\Users\\x\\scoop\\shims\\ffmpeg.exe')).toBe('scoop');
    expect(inferPkgManager('/opt/homebrew/bin/ffmpeg')).toBe('brew');
    expect(inferPkgManager('C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe')).toBeNull();
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
