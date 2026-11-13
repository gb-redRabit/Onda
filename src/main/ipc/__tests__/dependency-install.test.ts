import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Instalatory zależności: transport, menedżery pakietów i dialog są podstawione,
// a operacje na plikach działają na prawdziwym katalogu tymczasowym, żeby
// sprawdzić staging, atomowy rename i sprzątanie po błędzie.
const mocks = vi.hoisted(() => ({
  getBinDir: vi.fn(() => ''),
  resolveBinInfo: vi.fn(),
  invalidateBinaries: vi.fn(),
  runCommand: vi.fn(async (_cmd?: string, _args?: string[], _opts?: unknown) => 'ok'),
  dialog: vi.fn(async () => ({ response: 1 })),
  fromWebContents: vi.fn(),
  emitProgress: vi.fn(),
  newSignal: vi.fn(() => new AbortController().signal),
  clearSignal: vi.fn(),
  downloadFile: vi.fn(),
  fetchLatestYtdlpVersion: vi.fn(async (): Promise<string | null> => null),
  verifyDownloadedFile: vi.fn(async () => undefined),
  verifyFileSha256: vi.fn(async () => undefined),
  ytdlpBinaryName: vi.fn(() => 'yt-dlp'),
  ytdlpDownloadUrl: vi.fn(() => 'https://example.com/yt-dlp'),
  ytdlpShaUrl: vi.fn(() => 'https://example.com/SHA2-256SUMS'),
  ffmpegDownloadUrl: vi.fn((): string | null => null),
  ffmpegSha256: vi.fn((): string | null => null),
  ffmpegProbeUrl: vi.fn((): string | null => null),
  ffmpegProbeSha256: vi.fn((): string | null => null),
  detectPkgManagers: vi.fn(async (): Promise<string[]> => []),
  inferPkgManager: vi.fn((): string | null => null),
  pkgInstallCommand: vi.fn((pm: string, tool: string) => ({
    cmd: `${pm} install ${tool}`,
    argv: [pm, 'install', tool]
  })),
  pkgUninstallCommand: vi.fn((pm: string, tool: string) => ({
    cmd: `${pm} uninstall ${tool}`,
    argv: [pm, 'uninstall', tool]
  })),
  needsSudo: vi.fn(() => false)
}));

vi.mock('electron', () => ({
  dialog: { showMessageBox: mocks.dialog },
  BrowserWindow: { fromWebContents: mocks.fromWebContents }
}));
vi.mock('../../binaries', () => ({
  getBinDir: mocks.getBinDir,
  resolveBinInfo: mocks.resolveBinInfo,
  invalidateBinaries: mocks.invalidateBinaries
}));
vi.mock('../../utils/exec', () => ({ runCommand: mocks.runCommand }));
vi.mock('../../i18n-main', () => ({
  mainMessages: () => ({
    depYtDlp: 'yt-dlp failed',
    depFfmpeg: 'ffmpeg failed',
    depRemove: 'remove failed'
  })
}));
vi.mock('../dependency/dependency-download', () => ({
  emitProgress: mocks.emitProgress,
  newSignal: mocks.newSignal,
  clearSignal: mocks.clearSignal,
  downloadFile: mocks.downloadFile,
  fetchLatestYtdlpVersion: mocks.fetchLatestYtdlpVersion,
  verifyDownloadedFile: mocks.verifyDownloadedFile,
  verifyFileSha256: mocks.verifyFileSha256
}));
vi.mock('../dependency/dependency-utils', () => ({
  ytdlpBinaryName: mocks.ytdlpBinaryName,
  ytdlpDownloadUrl: mocks.ytdlpDownloadUrl,
  ytdlpShaUrl: mocks.ytdlpShaUrl,
  ffmpegDownloadUrl: mocks.ffmpegDownloadUrl,
  ffmpegSha256: mocks.ffmpegSha256,
  ffmpegProbeUrl: mocks.ffmpegProbeUrl,
  ffmpegProbeSha256: mocks.ffmpegProbeSha256,
  detectPkgManagers: mocks.detectPkgManagers,
  inferPkgManager: mocks.inferPkgManager,
  pkgInstallCommand: mocks.pkgInstallCommand,
  pkgUninstallCommand: mocks.pkgUninstallCommand,
  needsSudo: mocks.needsSudo,
  YTDLP_PINNED_VERSION: 'pinned-version'
}));

const { installYtdlpManaged, installFfmpegManaged, installSystem, uninstallTool } =
  await import('../dependency/dependency-install');

const root = mkdtempSync(join(tmpdir(), 'onda-dep-install-'));
let binDir: string;

beforeEach(() => {
  binDir = mkdtempSync(join(root, 'bin-'));
  mocks.getBinDir.mockReturnValue(binDir);
  for (const fn of Object.values(mocks)) fn.mockClear();
  mocks.getBinDir.mockReturnValue(binDir);
  mocks.runCommand.mockResolvedValue('ok');
  mocks.dialog.mockResolvedValue({ response: 1 });
  mocks.fromWebContents.mockReturnValue({});
  mocks.newSignal.mockReturnValue(new AbortController().signal);
  mocks.ytdlpBinaryName.mockReturnValue('yt-dlp');
  mocks.ytdlpDownloadUrl.mockReturnValue('https://example.com/yt-dlp');
  mocks.ytdlpShaUrl.mockReturnValue('https://example.com/SHA2-256SUMS');
  mocks.ffmpegDownloadUrl.mockReturnValue(null);
  mocks.ffmpegSha256.mockReturnValue(null);
  mocks.ffmpegProbeUrl.mockReturnValue(null);
  mocks.ffmpegProbeSha256.mockReturnValue(null);
  mocks.detectPkgManagers.mockResolvedValue([]);
  mocks.inferPkgManager.mockReturnValue(null);
  mocks.needsSudo.mockReturnValue(false);
  mocks.fetchLatestYtdlpVersion.mockResolvedValue(null);
  mocks.verifyDownloadedFile.mockResolvedValue(undefined);
  mocks.verifyFileSha256.mockResolvedValue(undefined);
  mocks.downloadFile.mockImplementation(async (_url: string, dest: string) => {
    writeFileSync(dest, 'binary');
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const sender = {} as never;

describe('installYtdlpManaged', () => {
  it('downloads to staging, verifies and atomically installs the pinned build', async () => {
    const result = await installYtdlpManaged(sender, false);

    expect(result).toEqual({
      success: true,
      path: join(binDir, 'yt-dlp'),
      managed: true
    });
    expect(mocks.fetchLatestYtdlpVersion).toHaveBeenCalled();
    expect(mocks.ytdlpDownloadUrl).toHaveBeenCalledWith(
      process.platform,
      process.arch,
      'pinned-version'
    );
    expect(mocks.verifyDownloadedFile).toHaveBeenCalledWith(
      `${join(binDir, 'yt-dlp')}.staging`,
      'https://example.com/SHA2-256SUMS',
      'yt-dlp',
      expect.anything()
    );
    expect(existsSync(join(binDir, 'yt-dlp'))).toBe(true);
    expect(existsSync(`${join(binDir, 'yt-dlp')}.staging`)).toBe(false);
    expect(mocks.invalidateBinaries).toHaveBeenCalled();
  });

  it('uses the latest release tag when the API answers', async () => {
    mocks.fetchLatestYtdlpVersion.mockResolvedValue('2026.08.18');
    await installYtdlpManaged(sender, true);
    expect(mocks.ytdlpDownloadUrl).toHaveBeenCalledWith(
      process.platform,
      process.arch,
      '2026.08.18'
    );
  });

  it('discards the staging file on a checksum mismatch', async () => {
    mocks.verifyDownloadedFile.mockRejectedValue(new Error('Checksum mismatch'));

    const result = await installYtdlpManaged(sender, false);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Weryfikacja sumy kontrolnej');
    expect(existsSync(`${join(binDir, 'yt-dlp')}.staging`)).toBe(false);
    expect(mocks.invalidateBinaries).not.toHaveBeenCalled();
  });

  it('reports cancellation without an error message', async () => {
    mocks.verifyDownloadedFile.mockRejectedValue(new Error('cancelled'));
    await expect(installYtdlpManaged(sender, false)).resolves.toEqual({
      success: false,
      cancelled: true
    });
  });

  it('falls back to the localized error for unexpected failures', async () => {
    mocks.downloadFile.mockRejectedValue(new Error('disk full'));
    const result = await installYtdlpManaged(sender, false);
    expect(result).toEqual({ success: false, error: 'disk full' });

    mocks.downloadFile.mockRejectedValue({});
    await expect(installYtdlpManaged(sender, false)).resolves.toEqual({
      success: false,
      error: 'yt-dlp failed'
    });
  });
});

describe('installFfmpegManaged', () => {
  it('reports a platform without a pinned build', async () => {
    await expect(installFfmpegManaged(sender)).resolves.toEqual({
      success: false,
      error: 'Brak przypiętego FFmpeg dla tej platformy.'
    });
    expect(mocks.downloadFile).not.toHaveBeenCalled();
  });

  it('removes the archive when the pinned hash does not match', async () => {
    mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.zip');
    mocks.ffmpegSha256.mockReturnValue('deadbeef');
    mocks.verifyFileSha256.mockRejectedValue(new Error('Checksum mismatch'));

    const result = await installFfmpegManaged(sender);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Weryfikacja sumy kontrolnej');
    expect(readdirSync(binDir)).not.toContain('ffmpeg-download.zip');
  });

  it('reports cancellation during hash verification', async () => {
    mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.zip');
    mocks.ffmpegSha256.mockReturnValue('deadbeef');
    mocks.verifyFileSha256.mockRejectedValue(new Error('cancelled'));

    await expect(installFfmpegManaged(sender)).resolves.toEqual({
      success: false,
      cancelled: true
    });
  });

  describe('archive extraction', () => {
    const exe = process.platform === 'win32' ? '.exe' : '';

    // `runCommand` udaje systemowy rozpakowywacz: tworzy pliki w katalogu
    // docelowym wyciągniętym z argv (PowerShell -DestinationPath, unzip -d,
    // tar -C), dzięki czemu prawdziwy `findFile` i `copyFile` mają co znaleźć.
    function destinationFrom(args: string[]): string | null {
      const joined = args.join(' ');
      const ps = /-DestinationPath '([^']+)'/.exec(joined);
      if (ps) return ps[1];
      for (const flag of ['-d', '-C']) {
        const index = args.indexOf(flag);
        if (index >= 0) return args[index + 1] ?? null;
      }
      return null;
    }

    function fakeExtraction(options: {
      mainProbe?: boolean;
      probeArchive?: boolean;
      mainBinary?: boolean;
    }): void {
      mocks.runCommand.mockImplementation(async (_cmd?: string, args: string[] = []) => {
        const dest = destinationFrom(args);
        if (!dest) return 'ok';
        if (dest.includes('ffprobe-extract')) {
          if (options.probeArchive) {
            mkdirSync(join(dest, 'tool'), { recursive: true });
            writeFileSync(join(dest, 'tool', `ffprobe${exe}`), 'probe');
          }
          return 'ok';
        }
        if (options.mainBinary !== false) {
          mkdirSync(join(dest, 'tool'), { recursive: true });
          writeFileSync(join(dest, 'tool', `ffmpeg${exe}`), 'ffmpeg-binary');
          if (options.mainProbe) writeFileSync(join(dest, 'tool', `ffprobe${exe}`), 'probe-binary');
        }
        return 'ok';
      });
    }

    function withManagedFfmpeg(): void {
      mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.zip');
      mocks.ffmpegSha256.mockReturnValue('a'.repeat(64));
    }

    it('extracts both tools, installs them and cleans temporary directories', async () => {
      withManagedFfmpeg();
      fakeExtraction({ mainProbe: true });

      const result = await installFfmpegManaged(sender);

      expect(result).toEqual({
        success: true,
        path: join(binDir, `ffmpeg${exe}`),
        managed: true
      });
      expect(readdirSync(binDir).sort()).toEqual([`ffmpeg${exe}`, `ffprobe${exe}`]);
      expect(existsSync(join(binDir, 'ffmpeg-extract'))).toBe(false);
      expect(existsSync(join(binDir, 'ffmpeg-download.zip'))).toBe(false);
      expect(mocks.invalidateBinaries).toHaveBeenCalled();
      expect(mocks.emitProgress).toHaveBeenCalledWith(sender, 'ffmpeg', 'done', 100);
    });

    it('downloads and verifies the separate macOS-style ffprobe archive', async () => {
      withManagedFfmpeg();
      mocks.ffmpegProbeUrl.mockReturnValue('https://example.com/ffprobe.zip');
      mocks.ffmpegProbeSha256.mockReturnValue('b'.repeat(64));
      fakeExtraction({ mainProbe: false, probeArchive: true });

      const result = await installFfmpegManaged(sender);

      expect(result.success).toBe(true);
      expect(mocks.downloadFile).toHaveBeenCalledWith(
        'https://example.com/ffprobe.zip',
        join(binDir, 'ffprobe-download.zip'),
        expect.anything(),
        expect.any(Function)
      );
      expect(mocks.verifyFileSha256).toHaveBeenCalledWith(
        join(binDir, 'ffprobe-download.zip'),
        'b'.repeat(64),
        expect.anything()
      );
      expect(readdirSync(binDir).sort()).toEqual([`ffmpeg${exe}`, `ffprobe${exe}`]);
      expect(existsSync(join(binDir, 'ffprobe-extract'))).toBe(false);
    });

    it('fails when the archive contains no ffmpeg binary', async () => {
      withManagedFfmpeg();
      fakeExtraction({ mainBinary: false });

      const result = await installFfmpegManaged(sender);

      expect(result.success).toBe(false);
      expect(result.error).toContain(`Nie znaleziono ffmpeg${exe}`);
    });

    it('fails when ffprobe is absent and no separate archive is pinned', async () => {
      withManagedFfmpeg();
      fakeExtraction({ mainProbe: false });

      const result = await installFfmpegManaged(sender);

      expect(result.success).toBe(false);
      expect(result.error).toContain(`Nie znaleziono ffprobe${exe}`);
    });
  });
});

describe('installSystem', () => {
  it('fails when no package manager is available', async () => {
    const result = await installSystem(sender, 'ffmpeg');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Nie znaleziono menedżera pakietów');
  });

  it('asks before sudo and stops when the user cancels', async () => {
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.needsSudo.mockReturnValue(true);
    mocks.dialog.mockResolvedValue({ response: 0 });

    const result = await installSystem(sender, 'ffmpeg');

    expect(result).toEqual({ success: false, cancelled: true });
    expect(mocks.dialog).toHaveBeenCalled();
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });

  it('installs and verifies the binary with a version probe', async () => {
    mocks.detectPkgManagers.mockResolvedValue(['choco']);
    mocks.resolveBinInfo.mockResolvedValue({
      path: join(binDir, 'ffmpeg'),
      managed: false,
      broken: false
    });

    const result = await installSystem(sender, 'ffmpeg');

    expect(result).toEqual({ success: true, path: join(binDir, 'ffmpeg'), managed: false });
    expect(mocks.runCommand).toHaveBeenCalledWith('choco', ['install', 'ffmpeg'], {
      timeout: 600000
    });
    expect(mocks.invalidateBinaries).toHaveBeenCalled();
  });

  it('reports a failed post-install probe with the manual command', async () => {
    mocks.detectPkgManagers.mockResolvedValue(['choco']);
    mocks.resolveBinInfo.mockResolvedValue(null);

    const result = await installSystem(sender, 'yt-dlp');

    expect(result.success).toBe(false);
    expect(result.error).toContain('choco install yt-dlp');
    expect(result.error).toContain('ok');
  });

  it('adds an elevation hint when the manager demands admin rights', async () => {
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.needsSudo.mockReturnValue(true);
    mocks.runCommand.mockRejectedValue({ stderr: 'requires elevated permissions' });

    const result = await installSystem(sender, 'ffmpeg');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Wymagane uprawnienia administratora.');
    expect(result.error).toContain('apt install ffmpeg');
  });
});

describe('uninstallTool', () => {
  it('refuses to remove a binary that is bundled with the app', async () => {
    const bundled = join(root, 'resources', 'ffmpeg');
    mocks.resolveBinInfo.mockResolvedValue({ path: bundled, managed: true, broken: false });

    const result = await uninstallTool(sender, 'ffmpeg');

    expect(result.success).toBe(false);
    expect(result.error).toContain('dołączona do aplikacji');
  });

  it('deletes a managed binary from the app bin directory', async () => {
    const managed = join(binDir, 'ffmpeg');
    writeFileSync(managed, 'x');
    mocks.resolveBinInfo.mockResolvedValue({ path: managed, managed: true, broken: false });

    const result = await uninstallTool(sender, 'ffmpeg');

    expect(result).toEqual({ success: true, path: null, managed: true });
    expect(existsSync(managed)).toBe(false);
  });

  it('reports a failed managed removal', async () => {
    mocks.resolveBinInfo.mockResolvedValue({
      path: join(binDir, 'never-existed'),
      managed: true,
      broken: false
    });

    const result = await uninstallTool(sender, 'ffmpeg');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('tries the inferred package manager first and succeeds when the binary disappears', async () => {
    const info = { path: '/home/x/scoop/shims/ffmpeg.exe', managed: false, broken: false };
    mocks.resolveBinInfo.mockResolvedValueOnce(info).mockResolvedValue(null);
    mocks.inferPkgManager.mockReturnValue('scoop');
    mocks.detectPkgManagers.mockResolvedValue(['choco', 'scoop']);

    const result = await uninstallTool(sender, 'ffmpeg');

    expect(result).toEqual({ success: true });
    expect(mocks.pkgUninstallCommand.mock.calls[0]).toEqual(['scoop', 'ffmpeg']);
    expect(mocks.runCommand).toHaveBeenCalledTimes(1);
  });

  it('stops a sudo uninstall when the user cancels', async () => {
    mocks.resolveBinInfo.mockResolvedValue({
      path: '/usr/bin/ffmpeg',
      managed: false,
      broken: false
    });
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.needsSudo.mockReturnValue(true);
    mocks.dialog.mockResolvedValue({ response: 0 });

    const result = await uninstallTool(sender, 'ffmpeg');

    expect(result).toEqual({ success: false, cancelled: true });
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });

  it('explains that nothing was uninstalled when every manager fails', async () => {
    mocks.resolveBinInfo.mockResolvedValue({
      path: '/usr/bin/ffmpeg',
      managed: false,
      broken: false
    });
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.runCommand.mockRejectedValue({ stderr: 'permission denied' });

    const result = await uninstallTool(sender, 'ffmpeg');

    expect(result.success).toBe(false);
    expect(result.error).toContain('apt uninstall ffmpeg');
    expect(result.error).toContain('permission denied');
  });

  it('polls until the package manager removes the binary', async () => {
    const info = { path: '/usr/bin/ffmpeg', managed: false, broken: false };
    mocks.resolveBinInfo
      .mockResolvedValueOnce(info)
      .mockResolvedValueOnce(info)
      .mockResolvedValueOnce(info)
      .mockResolvedValueOnce(null);
    mocks.detectPkgManagers.mockResolvedValue(['apt']);

    vi.useFakeTimers();
    try {
      const pending = uninstallTool(sender, 'ffmpeg');
      await vi.runAllTimersAsync();

      await expect(pending).resolves.toEqual({ success: true });
    } finally {
      vi.useRealTimers();
    }
    expect(mocks.runCommand).toHaveBeenCalledTimes(1);
  });

  it('reports a tool that is still runnable after every attempt', async () => {
    mocks.resolveBinInfo.mockResolvedValue({
      path: '/usr/bin/ffmpeg',
      managed: false,
      broken: false
    });
    mocks.detectPkgManagers.mockResolvedValue(['apt']);

    vi.useFakeTimers();
    try {
      const pending = uninstallTool(sender, 'ffmpeg');
      await vi.runAllTimersAsync();

      const result = await pending;
      expect(result.success).toBe(false);
      expect(result.error).toContain('narzędzie nadal działa');
      expect(result.error).toContain('apt uninstall ffmpeg');
      expect(result.error).toContain('ok');
    } finally {
      vi.useRealTimers();
    }
  });
});

async function withPlatform<T>(value: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value, configurable: true });
  try {
    return await run();
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

describe('POSIX managed installs', () => {
  it('reports download progress and marks yt-dlp executable', async () => {
    await withPlatform('linux', async () => {
      mocks.downloadFile.mockImplementation(
        async (
          _url: string,
          dest: string,
          _signal: unknown,
          onProgress: (a: number, b: number) => void
        ) => {
          onProgress(50, 100);
          onProgress(1, 0);
          writeFileSync(dest, 'binary');
        }
      );

      const result = await installYtdlpManaged(sender, false);

      expect(result.success).toBe(true);
      expect(mocks.emitProgress).toHaveBeenCalledWith(sender, 'yt-dlp', 'download', 48);
      expect(mocks.emitProgress).toHaveBeenCalledWith(sender, 'yt-dlp', 'download', 5);
    });
  });

  it('reports a cancelled yt-dlp download from the outer catch', async () => {
    mocks.downloadFile.mockRejectedValue(new Error('cancelled'));

    await expect(installYtdlpManaged(sender, false)).resolves.toEqual({
      success: false,
      cancelled: true
    });
  });

  it('reports a cancelled ffmpeg download from the outer catch', async () => {
    mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.zip');
    mocks.ffmpegSha256.mockReturnValue('a'.repeat(64));
    mocks.downloadFile.mockRejectedValue(new Error('cancelled'));

    await expect(installFfmpegManaged(sender)).resolves.toEqual({
      success: false,
      cancelled: true
    });
  });

  it('falls back to the localized ffmpeg error', async () => {
    mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.zip');
    mocks.ffmpegSha256.mockReturnValue('a'.repeat(64));

    mocks.downloadFile.mockRejectedValue(new Error('disk full'));
    await expect(installFfmpegManaged(sender)).resolves.toEqual({
      success: false,
      error: 'disk full'
    });

    mocks.downloadFile.mockRejectedValue({});
    await expect(installFfmpegManaged(sender)).resolves.toEqual({
      success: false,
      error: 'ffmpeg failed'
    });
  });

  function posixDestination(args: string[]): string | null {
    const joined = args.join(' ');
    const ps = /-DestinationPath '([^']+)'/.exec(joined);
    if (ps) return ps[1];
    for (const flag of ['-d', '-C']) {
      const index = args.indexOf(flag);
      if (index >= 0) return args[index + 1] ?? null;
    }
    return null;
  }

  function posixExtraction(): void {
    mocks.runCommand.mockImplementation(async (_cmd?: string, args: string[] = []) => {
      const dest = posixDestination(args);
      if (!dest) return 'ok';
      mkdirSync(join(dest, 'tool'), { recursive: true });
      writeFileSync(join(dest, 'tool', 'ffmpeg'), 'ffmpeg-binary');
      writeFileSync(join(dest, 'tool', 'ffprobe'), 'probe-binary');
      return 'ok';
    });
  }

  it('reports ffmpeg download progress and extracts a tar.xz archive', async () => {
    await withPlatform('linux', async () => {
      mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.tar.xz');
      mocks.ffmpegSha256.mockReturnValue('a'.repeat(64));
      posixExtraction();
      mocks.downloadFile.mockImplementation(
        async (
          _url: string,
          dest: string,
          _signal: unknown,
          onProgress: (a: number, b: number) => void
        ) => {
          onProgress(50, 100);
          onProgress(1, 0);
          writeFileSync(dest, 'archive');
        }
      );

      const result = await installFfmpegManaged(sender);

      expect(result.success).toBe(true);
      expect(mocks.emitProgress).toHaveBeenCalledWith(sender, 'ffmpeg', 'download', 43);
      expect(mocks.emitProgress).toHaveBeenCalledWith(sender, 'ffmpeg', 'download', 5);
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'tar',
        expect.arrayContaining(['-C', join(binDir, 'ffmpeg-extract')]),
        { timeout: 300000 }
      );
      expect(mocks.runCommand).not.toHaveBeenCalledWith(
        'unzip',
        expect.anything(),
        expect.anything()
      );
      expect(existsSync(join(binDir, 'ffmpeg'))).toBe(true);
      expect(existsSync(join(binDir, 'ffprobe'))).toBe(true);
    });
  });

  it('falls back to tar when unzip is unavailable', async () => {
    await withPlatform('linux', async () => {
      mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.zip');
      mocks.ffmpegSha256.mockReturnValue('a'.repeat(64));
      mocks.runCommand.mockImplementation(async (cmd?: string, args: string[] = []) => {
        if (cmd === 'unzip') throw new Error('unzip missing');
        const dest = posixDestination(args);
        if (!dest) return 'ok';
        mkdirSync(join(dest, 'tool'), { recursive: true });
        writeFileSync(join(dest, 'tool', 'ffmpeg'), 'ffmpeg-binary');
        writeFileSync(join(dest, 'tool', 'ffprobe'), 'probe-binary');
        return 'ok';
      });

      const result = await installFfmpegManaged(sender);

      expect(result.success).toBe(true);
      expect(mocks.runCommand).toHaveBeenCalledWith('unzip', expect.any(Array), {
        timeout: 300000
      });
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'tar',
        expect.arrayContaining(['-C', join(binDir, 'ffmpeg-extract')]),
        { timeout: 300000 }
      );
    });
  });

  it('falls back to tar when PowerShell cannot expand the archive', async () => {
    await withPlatform('win32', async () => {
      mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.zip');
      mocks.ffmpegSha256.mockReturnValue('a'.repeat(64));
      mocks.runCommand.mockImplementation(async (cmd?: string, args: string[] = []) => {
        if (cmd === 'powershell') throw new Error('no powershell');
        const dest = posixDestination(args);
        if (!dest) return 'ok';
        mkdirSync(join(dest, 'tool'), { recursive: true });
        writeFileSync(join(dest, 'tool', 'ffmpeg.exe'), 'ffmpeg-binary');
        writeFileSync(join(dest, 'tool', 'ffprobe.exe'), 'probe-binary');
        return 'ok';
      });

      const result = await installFfmpegManaged(sender);

      expect(result.success).toBe(true);
      expect(mocks.runCommand).toHaveBeenCalledWith('powershell', expect.any(Array), {
        timeout: 300000
      });
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'tar',
        expect.arrayContaining(['-C', join(binDir, 'ffmpeg-extract')]),
        { timeout: 300000 }
      );
      expect(existsSync(join(binDir, 'ffmpeg.exe'))).toBe(true);
      expect(existsSync(join(binDir, 'ffprobe.exe'))).toBe(true);
    });
  });

  it('confirms elevated installs through the parent window', async () => {
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.needsSudo.mockReturnValue(true);
    mocks.dialog.mockResolvedValue({ response: 1 });
    mocks.resolveBinInfo.mockResolvedValue({
      path: '/usr/bin/ffmpeg',
      managed: false,
      broken: false
    });

    const result = await installSystem(sender, 'ffmpeg');

    expect(result.success).toBe(true);
    expect(mocks.dialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultId: 1, cancelId: 0 })
    );
  });

  it('confirms elevated installs without a parent window', async () => {
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.needsSudo.mockReturnValue(true);
    mocks.fromWebContents.mockReturnValue(null);
    mocks.dialog.mockResolvedValue({ response: 1 });
    mocks.resolveBinInfo.mockResolvedValue({
      path: '/usr/bin/ffmpeg',
      managed: false,
      broken: false
    });

    const result = await installSystem(sender, 'ffmpeg');

    expect(result.success).toBe(true);
    expect(mocks.dialog).toHaveBeenCalledWith(expect.objectContaining({ defaultId: 1 }));
  });

  it('reports stdout from a failed install', async () => {
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.runCommand.mockRejectedValue({ stdout: 'install output' });

    const result = await installSystem(sender, 'ffmpeg');

    expect(result.error).toContain('install output');
  });

  it('reports an unknown install failure', async () => {
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.runCommand.mockRejectedValue({});

    const result = await installSystem(sender, 'ffmpeg');

    expect(result.error).toContain('Nieznany błąd');
  });

  it('uninstalls when the binary cannot be resolved', async () => {
    mocks.resolveBinInfo.mockResolvedValue(null);
    mocks.detectPkgManagers.mockResolvedValue(['apt']);

    const result = await uninstallTool(sender, 'ffmpeg');

    expect(result).toEqual({ success: true });
    expect(mocks.inferPkgManager).toHaveBeenCalledWith(null);
  });

  it('reports an unknown uninstall failure reason', async () => {
    mocks.resolveBinInfo.mockResolvedValue({
      path: '/usr/bin/ffmpeg',
      managed: false,
      broken: false
    });
    mocks.detectPkgManagers.mockResolvedValue(['apt']);
    mocks.runCommand.mockRejectedValue({});

    const result = await uninstallTool(sender, 'ffmpeg');

    expect(result.error).toContain('nieznany błąd');
  });
});
