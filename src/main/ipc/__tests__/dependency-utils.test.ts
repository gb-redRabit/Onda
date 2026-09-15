import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ytdlpBinaryName,
  ytdlpDownloadUrl,
  ytdlpShaUrl,
  ffmpegDownloadUrl,
  ffmpegSha256,
  whichInPath,
  inferPkgManager,
  getMkvExtractCandidates,
  resolveBinary,
  toolFileName
} from '../dependency-utils';
import binaries from '../../../../binaries.json';

// Version probes are mocked: paths registered in `brokenPaths` fail the probe,
// every other candidate reports a working version.
const probeState = vi.hoisted(() => ({ brokenPaths: new Set<string>() }));

vi.mock('../../utils/exec', () => ({
  runCommand: vi.fn(async (bin: string) => {
    if (probeState.brokenPaths.has(bin)) throw new Error('spawn EACCES');
    return '2026.09.01';
  })
}));

describe('ytdlpBinaryName', () => {
  it('returns the right file name for the current platform', () => {
    const expected = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    expect(ytdlpBinaryName()).toBe(expected);
  });
});

describe('ytdlpDownloadUrl', () => {
  const base =
    'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download/2026.08.18.122307';
  it('maps every platform to a pinned nightly yt-dlp release asset', () => {
    expect(ytdlpDownloadUrl('win32')).toBe(`${base}/yt-dlp.exe`);
    expect(ytdlpDownloadUrl('linux', 'x64')).toBe(`${base}/yt-dlp`);
    expect(ytdlpDownloadUrl('freebsd')).toBe(`${base}/yt-dlp`);
  });

  it('uses the universal macos asset on nightly (no legacy build), apple-silicon on stable', () => {
    expect(ytdlpDownloadUrl('darwin', 'arm64')).toBe(`${base}/yt-dlp_macos`);
    expect(ytdlpDownloadUrl('darwin', 'x64')).toBe(`${base}/yt-dlp_macos`);
    expect(ytdlpDownloadUrl('darwin', 'arm64', '2026.07.04', 'stable')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_macos'
    );
    expect(ytdlpDownloadUrl('darwin', 'x64', '2026.07.04', 'stable')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_macos_legacy'
    );
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
    expect(ytdlpDownloadUrl('win32', 'x64', '2026.08.19.010203')).toBe(
      'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download/2026.08.19.010203/yt-dlp.exe'
    );
  });

  it('points the checksum source at the pinned SHA2-256SUMS manifest', () => {
    expect(ytdlpShaUrl()).toBe(
      'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download/2026.08.18.122307/SHA2-256SUMS'
    );
    expect(ytdlpShaUrl('2026.08.19.010203')).toBe(
      'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download/2026.08.19.010203/SHA2-256SUMS'
    );
    expect(ytdlpShaUrl('2026.07.04', 'stable')).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/SHA2-256SUMS'
    );
  });
});

describe('ffmpegDownloadUrl / ffmpegSha256', () => {
  const pinned =
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-07-31-14-10/ffmpeg-n7.1.5-12-g1fdbca85aa-win64-gpl-7.1.zip';

  it('serves the pinned Windows zip and null on other platforms', () => {
    expect(ffmpegDownloadUrl('win32', 'x64')).toBe(pinned);
    expect(ffmpegDownloadUrl('linux')).toBeNull();
    expect(ffmpegSha256('linux')).toBeNull();
  });

  it('never uses the mutable latest redirect', () => {
    expect(ffmpegDownloadUrl('win32', 'x64')).not.toContain('/latest');
  });

  it('pins the exact SHA-256 from the manifest', () => {
    const managed = binaries.ffmpeg.managed as Record<string, { sha256: string }>;
    expect(ffmpegSha256('win32', 'x64')).toBe(managed['win32-x64'].sha256);
    expect(ffmpegSha256('win32', 'x64')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('binaries.json manifest', () => {
  const bundled = Object.entries(binaries.ffmpeg.bundled) as Array<
    [string, Record<string, unknown>]
  >;

  it('pins every bundled source with a 64-hex SHA-256 and an immutable URL', () => {
    expect(bundled.length).toBeGreaterThan(0);
    for (const [key, src] of bundled) {
      expect(src.sha256, key).toMatch(/^[0-9a-f]{64}$/);
      expect(String(src.url), key).not.toContain('/latest');
      expect(typeof src.ffmpeg, key).toBe('string');
    }
  });

  it('pins the macOS ffprobe archives separately', () => {
    for (const key of ['darwin-arm64', 'darwin-x64']) {
      const src = binaries.ffmpeg.bundled[key as keyof typeof binaries.ffmpeg.bundled] as {
        probeUrl?: string;
        probeSha256?: string;
      };
      expect(src.probeUrl, key).toContain('ffprobe');
      expect(src.probeSha256, key).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('pins managed FFmpeg to an immutable tag with exact hashes', () => {
    const managed = Object.values(binaries.ffmpeg.managed);
    expect(managed.length).toBeGreaterThan(0);
    for (const src of managed) {
      expect(src.url).toContain('/autobuild-');
      expect(src.url).not.toContain('/latest');
      expect(src.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('pins a concrete yt-dlp release on a known channel', () => {
    expect(['stable', 'nightly']).toContain(binaries.ytdlp.channel);
    expect(binaries.ytdlp.pinnedVersion).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
    expect(binaries.ytdlp.shaManifest).toBe('SHA2-256SUMS');
  });
});

describe('whichInPath', () => {
  it('finds executables whether the name already carries the extension or not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'onda-which-'));
    const isWin = process.platform === 'win32';
    const exe = join(dir, isWin ? 'ffprobe.exe' : 'ffprobe');
    writeFileSync(exe, 'x');
    const prevPath = process.env.PATH;
    process.env.PATH = dir;
    try {
      expect(whichInPath(isWin ? 'ffprobe.exe' : 'ffprobe')).toBe(exe);
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

describe('resolveBinary', () => {
  let binDir: string;
  let pathDir: string;
  let resourcesDir: string;
  let prevPath: string | undefined;
  let prevResources: string | undefined;

  function setResources(): void {
    (process as { resourcesPath?: string }).resourcesPath = resourcesDir;
  }

  beforeEach(() => {
    binDir = mkdtempSync(join(tmpdir(), 'onda-bin-'));
    pathDir = mkdtempSync(join(tmpdir(), 'onda-path-'));
    resourcesDir = mkdtempSync(join(tmpdir(), 'onda-res-'));
    prevPath = process.env.PATH;
    process.env.PATH = pathDir;
    prevResources = (process as { resourcesPath?: string }).resourcesPath;
    delete (process as { resourcesPath?: string }).resourcesPath;
    probeState.brokenPaths.clear();
  });

  afterEach(() => {
    process.env.PATH = prevPath;
    if (prevResources === undefined) {
      delete (process as { resourcesPath?: string }).resourcesPath;
    } else {
      (process as { resourcesPath?: string }).resourcesPath = prevResources;
    }
    for (const dir of [binDir, pathDir, resourcesDir]) {
      rmSync(dir, { recursive: true, force: true });
    }
    probeState.brokenPaths.clear();
  });

  it('falls back to a working system binary when the managed one is broken', async () => {
    const brokenManaged = join(binDir, toolFileName('yt-dlp'));
    writeFileSync(brokenManaged, 'x');
    probeState.brokenPaths.add(brokenManaged);
    writeFileSync(join(pathDir, toolFileName('yt-dlp')), 'x');

    const resolved = await resolveBinary(binDir, 'yt-dlp');

    expect(resolved).toMatchObject({
      source: 'system',
      broken: false,
      managed: false,
      version: '2026.09.01'
    });
  });

  it('returns the first broken candidate with the probe error when nothing works', async () => {
    const brokenManaged = join(binDir, toolFileName('yt-dlp'));
    writeFileSync(brokenManaged, 'x');
    probeState.brokenPaths.add(brokenManaged);

    const resolved = await resolveBinary(binDir, 'yt-dlp');

    expect(resolved).toMatchObject({
      path: brokenManaged,
      source: 'managed',
      broken: true,
      version: null,
      error: 'spawn EACCES'
    });
  });

  it('prefers the bundled binary and reports its source', async () => {
    const bundled = join(
      resourcesDir,
      'ffmpeg',
      `${process.platform}-${process.arch}`,
      toolFileName('ffmpeg')
    );
    mkdirSync(join(resourcesDir, 'ffmpeg', `${process.platform}-${process.arch}`), {
      recursive: true
    });
    writeFileSync(bundled, 'x');
    setResources();

    const resolved = await resolveBinary(binDir, 'ffmpeg');

    expect(resolved).toMatchObject({ path: bundled, source: 'bundled', broken: false });
  });

  it('falls back to a managed install when the bundled binary is broken', async () => {
    const bundled = join(
      resourcesDir,
      'ffmpeg',
      `${process.platform}-${process.arch}`,
      toolFileName('ffmpeg')
    );
    mkdirSync(join(resourcesDir, 'ffmpeg', `${process.platform}-${process.arch}`), {
      recursive: true
    });
    writeFileSync(bundled, 'x');
    probeState.brokenPaths.add(bundled);
    const managed = join(binDir, toolFileName('ffmpeg'));
    writeFileSync(managed, 'x');
    setResources();

    const resolved = await resolveBinary(binDir, 'ffmpeg');

    expect(resolved).toMatchObject({ path: managed, source: 'managed', broken: false });
  });

  it('returns null when no candidate exists', async () => {
    expect(await resolveBinary(binDir, 'ffprobe')).toBeNull();
  });
});
