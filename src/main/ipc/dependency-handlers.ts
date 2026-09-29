import { ipcMain, dialog, BrowserWindow, type WebContents } from 'electron';
import { mkdir, chmod, unlink, rm } from 'fs/promises';
import { join, basename } from 'path';
import { runCommand } from '../utils/exec';
import {
  ytdlpBinaryName,
  ytdlpDownloadUrl,
  ytdlpShaUrl,
  ffmpegDownloadUrl,
  ffmpegSha256,
  ffmpegProbeUrl,
  ffmpegProbeSha256,
  detectPkgManagers,
  inferPkgManager,
  pkgInstallCommand,
  pkgUninstallCommand,
  needsSudo,
  YTDLP_PINNED_VERSION,
  type BinTool
} from './dependency-utils';
import { getBinDir, resolveBin, resolveBinInfo, invalidateBinaries } from '../binaries';
import {
  emitProgress,
  newSignal,
  clearSignal,
  abortTool,
  downloadFile,
  fetchLatestYtdlpVersion,
  verifyDownloadedFile,
  verifyFileSha256,
  type InstallResult
} from './dependency-download';

// Downloads the yt-dlp release asset into userData/bin and verifies its SHA-256.
async function installYtdlpManaged(
  sender: WebContents,
  reinstall: boolean
): Promise<InstallResult> {
  const signal = newSignal('yt-dlp');
  try {
    const binDir = getBinDir();
    await mkdir(binDir, { recursive: true });
    const dest = join(binDir, ytdlpBinaryName());
    // Always resolve the newest release from the active channel (the GitHub
    // *tag* is immutable, unlike the mutable `latest` redirect); the pinned tag
    // is only a fallback when the GitHub API is unreachable.
    const version = (await fetchLatestYtdlpVersion()) ?? YTDLP_PINNED_VERSION;
    const url = ytdlpDownloadUrl(process.platform, process.arch, version);
    const shaUrl = ytdlpShaUrl(version);

    emitProgress(sender, 'yt-dlp', reinstall ? 'update' : 'download', 5);
    await downloadFile(url, dest, signal, (received, total) => {
      const pct = total > 0 ? 5 + Math.round((received / total) * 85) : 5;
      emitProgress(sender, 'yt-dlp', 'download', pct);
    });
    if (process.platform !== 'win32') {
      await chmod(dest, 0o755);
    }

    emitProgress(sender, 'yt-dlp', 'verify', 92);
    try {
      await verifyDownloadedFile(dest, shaUrl, basename(url), signal);
    } catch (e) {
      await unlink(dest).catch(() => {});
      const err = e as { message?: string };
      if (err.message === 'cancelled' || signal.aborted) {
        return { success: false, cancelled: true };
      }
      return {
        success: false,
        error: 'Weryfikacja sumy kontrolnej nie powiodła się — pobrany plik jest uszkodzony.'
      };
    }

    invalidateBinaries();
    emitProgress(sender, 'yt-dlp', 'done', 100);
    return { success: true, path: dest, managed: true };
  } catch (e) {
    const err = e as { message?: string };
    if (err.message === 'cancelled' || signal.aborted) {
      return { success: false, cancelled: true };
    }
    return { success: false, error: err.message || 'Nie udało się pobrać yt-dlp' };
  } finally {
    clearSignal('yt-dlp');
  }
}

// Extracts a zip (Windows/macOS) or tar.xz (Linux) archive. macOS bsdtar and
// `unzip` both handle zip; GNU tar on Linux does not, but Linux builds are
// tar.xz, so each platform only hits the extractor it supports.
async function extractArchive(archive: string, dest: string): Promise<void> {
  if (process.platform === 'win32') {
    // Escape single quotes for the PowerShell single-quoted literal paths.
    const psLiteral = (p: string): string => p.replace(/'/g, "''");
    await runCommand(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${psLiteral(archive)}' -DestinationPath '${psLiteral(dest)}' -Force`
      ],
      { timeout: 300000 }
    ).catch(() => runCommand('tar', ['-xf', archive, '-C', dest], { timeout: 300000 }));
    return;
  }
  if (archive.endsWith('.tar.xz')) {
    await runCommand('tar', ['-xf', archive, '-C', dest], { timeout: 300000 });
    return;
  }
  await runCommand('unzip', ['-o', archive, '-d', dest], { timeout: 300000 }).catch(() =>
    runCommand('tar', ['-xf', archive, '-C', dest], { timeout: 300000 })
  );
}

// Copies a downloaded binary into place and restores the exec bit on POSIX.
async function installBinary(src: string, dest: string): Promise<void> {
  const { copyFile } = await import('fs/promises');
  await copyFile(src, dest);
  if (process.platform !== 'win32') {
    await chmod(dest, 0o755);
  }
}

// Downloads the pinned managed FFmpeg build into userData/bin and verifies its
// SHA-256. Windows/Linux archives contain both tools; macOS ships ffmpeg and
// ffprobe as separate archives (the probe is pinned via probeUrl/probeSha256).
async function installFfmpegManaged(sender: WebContents): Promise<InstallResult> {
  const signal = newSignal('ffmpeg');
  const exe = process.platform === 'win32' ? '.exe' : '';
  const cleanup: string[] = [];
  try {
    const url = ffmpegDownloadUrl();
    const sha256 = ffmpegSha256();
    if (!url || !sha256) {
      return { success: false, error: 'Brak przypiętego FFmpeg dla tej platformy.' };
    }

    const binDir = getBinDir();
    await mkdir(binDir, { recursive: true });
    const archive = join(binDir, `ffmpeg-download${url.endsWith('.tar.xz') ? '.tar.xz' : '.zip'}`);
    const extractDir = join(binDir, 'ffmpeg-extract');
    const probeArchive = join(binDir, 'ffprobe-download.zip');
    const probeExtractDir = join(binDir, 'ffprobe-extract');
    const ffmpegDest = join(binDir, `ffmpeg${exe}`);
    const ffprobeDest = join(binDir, `ffprobe${exe}`);
    cleanup.push(archive, extractDir, probeArchive, probeExtractDir);

    emitProgress(sender, 'ffmpeg', 'download', 5);
    await rm(archive, { force: true }).catch(() => {});
    await downloadFile(url, archive, signal, (received, total) => {
      const pct = total > 0 ? 5 + Math.round((received / total) * 75) : 5;
      emitProgress(sender, 'ffmpeg', 'download', pct);
    });

    emitProgress(sender, 'ffmpeg', 'verify', 82);
    try {
      await verifyFileSha256(archive, sha256, signal);
    } catch (e) {
      await rm(archive, { force: true }).catch(() => {});
      const err = e as { message?: string };
      if (err.message === 'cancelled' || signal.aborted) {
        return { success: false, cancelled: true };
      }
      return {
        success: false,
        error: 'Weryfikacja sumy kontrolnej nie powiodła się — pobrany plik jest uszkodzony.'
      };
    }

    emitProgress(sender, 'ffmpeg', 'extract', 86);
    await rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(extractDir, { recursive: true });
    await extractArchive(archive, extractDir);

    const { findFile } = await import('./zip-utils');
    const ffmpegFile = await findFile(extractDir, `ffmpeg${exe}`);
    if (!ffmpegFile) {
      return { success: false, error: `Nie znaleziono ffmpeg${exe} w pobranym archiwum.` };
    }
    await installBinary(ffmpegFile, ffmpegDest);

    // ffprobe: usually in the same archive; macOS publishes it separately.
    let probeFile = await findFile(extractDir, `ffprobe${exe}`);
    const probeUrl = ffmpegProbeUrl();
    const probeSha256 = ffmpegProbeSha256();
    if (!probeFile && probeUrl && probeSha256) {
      emitProgress(sender, 'ffmpeg', 'download', 92);
      await rm(probeArchive, { force: true }).catch(() => {});
      await downloadFile(probeUrl, probeArchive, signal, () => {});
      await verifyFileSha256(probeArchive, probeSha256, signal);
      await rm(probeExtractDir, { recursive: true, force: true }).catch(() => {});
      await mkdir(probeExtractDir, { recursive: true });
      await extractArchive(probeArchive, probeExtractDir);
      probeFile = await findFile(probeExtractDir, `ffprobe${exe}`);
    }
    if (!probeFile) {
      return { success: false, error: `Nie znaleziono ffprobe${exe} w pobranym archiwum.` };
    }
    await installBinary(probeFile, ffprobeDest);

    invalidateBinaries();
    emitProgress(sender, 'ffmpeg', 'done', 100);
    return { success: true, path: ffmpegDest, managed: true };
  } catch (e) {
    const err = e as { message?: string };
    if (err.message === 'cancelled' || signal.aborted) {
      return { success: false, cancelled: true };
    }
    return { success: false, error: err.message || 'Nie udało się zainstalować FFmpeg' };
  } finally {
    for (const path of cleanup) {
      await rm(path, { recursive: true, force: true }).catch(() => {});
    }
    clearSignal('ffmpeg');
  }
}

async function runShell(argv: string[]): Promise<string> {
  const output = await runCommand(argv[0], argv.slice(1), { timeout: 600000 });
  return output;
}

// Ask the user for explicit consent before running a privileged (sudo -n)
// system command from the renderer's request. Returns false when cancelled.
async function confirmPrivileged(sender: WebContents, command: string): Promise<boolean> {
  const win = BrowserWindow.fromWebContents(sender);
  const options = {
    type: 'warning' as const,
    buttons: ['Anuluj', 'Kontynuuj'],
    defaultId: 1,
    cancelId: 0,
    title: 'Potwierdzenie instalacji systemowej',
    message: 'Wymagane podniesione uprawnienia (sudo)',
    detail: `Onda uruchomi:\n${command}\n\nSystem może poprosić o hasło administratora (sudo).`
  };
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);
  return response === 1;
}

// System install through a package manager with real post-install verification.
async function installSystem(sender: WebContents, tool: BinTool): Promise<InstallResult> {
  emitProgress(sender, tool, 'manager', 10);
  const pkgManager = (await detectPkgManagers())[0] ?? null;
  if (!pkgManager) {
    return {
      success: false,
      error:
        'Nie znaleziono menedżera pakietów. Zainstaluj ręcznie (winget/choco/scoop/brew/apt/dnf/pacman) i odśwież.'
    };
  }

  const { cmd, argv } = pkgInstallCommand(pkgManager, tool);
  if (needsSudo(pkgManager) && !(await confirmPrivileged(sender, cmd))) {
    return { success: false, cancelled: true };
  }
  try {
    const output = await runShell(argv);
    emitProgress(sender, tool, 'verify', 90);
    invalidateBinaries();
    const info = await resolveBinInfo(tool);
    if (info) {
      emitProgress(sender, tool, 'done', 100);
      return { success: true, path: info.path, managed: info.managed };
    }
    return {
      success: false,
      error: `Instalacja zakończyła się, ale binarka nie jest dostępna. Skopiuj komendę i uruchom ręcznie: ${cmd}\n\n${output}`
    };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    const msg = err.stderr || err.stdout || err.message || 'Nieznany błąd';
    const hint = msg.includes('requires elevated permissions')
      ? ' Wymagane uprawnienia administratora.'
      : '';
    return {
      success: false,
      error: `${msg}${hint} Skopiuj komendę i uruchom ręcznie: ${cmd}`
    };
  } finally {
    clearSignal(tool);
  }
}

async function uninstallTool(sender: WebContents, tool: BinTool): Promise<InstallResult> {
  const info = await resolveBinInfo(tool);
  if (info?.managed) {
    // Only files in userData/bin are ours to delete. `managed` also covers the
    // binary bundled inside the app (resources/ffmpeg) — never unlink that.
    if (!info.path.startsWith(getBinDir())) {
      return {
        success: false,
        error: 'Ta binarka jest dołączona do aplikacji — nie można jej odinstalować.'
      };
    }
    try {
      await unlink(info.path);
      invalidateBinaries();
      return { success: true, path: null, managed: true };
    } catch (e) {
      const err = e as { message?: string };
      return { success: false, error: err.message || 'Nie udało się usunąć pliku' };
    }
  }

  // System install — infer which manager actually owns it from the resolved
  // path (choco/winGet/scoop shims live in distinctive folders), then fall
  // back to every available manager until the binary is really gone.
  const managers = await detectPkgManagers();
  const inferred = inferPkgManager(info?.path ?? null);
  const candidates = inferred ? [inferred, ...managers.filter((m) => m !== inferred)] : managers;

  const errors: string[] = [];
  for (const pm of candidates) {
    const { cmd, argv } = pkgUninstallCommand(pm, tool);
    if (needsSudo(pm) && !(await confirmPrivileged(sender, cmd))) {
      return { success: false, cancelled: true };
    }
    try {
      const output = await runShell(argv);
      // Package managers remove the files asynchronously and often leave a shim
      // behind for a moment, so give it a beat and treat "found but no longer
      // runnable" as removed — otherwise a successful winget uninstall was
      // reported as a failure ("binarka nadal istnieje").
      const gone = await waitUntilRemoved(tool);
      if (gone) return { success: true };
      errors.push(`${cmd} — narzędzie nadal działa\n${output}`);
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      errors.push(`${cmd} — ${err.stderr || err.stdout || err.message || 'nieznany błąd'}`);
    }
  }

  return {
    success: false,
    error:
      'Odinstalowanie nie powiodło się — narzędzie nadal działa (może być zainstalowane\n' +
      'z innego źródła). Skopiuj i uruchom ręcznie:\n' +
      candidates.map((pm) => pkgUninstallCommand(pm, tool).cmd).join('\n') +
      '\n\n' +
      errors.join('\n')
  };
}

// Re-probes a few times after an uninstall: a leftover shim pointing at the
// removed files (or a half-finished removal) is reported by the resolver as
// `broken`, which for "did the uninstall work?" means gone.
async function waitUntilRemoved(tool: BinTool): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    invalidateBinaries();
    const info = await resolveBinInfo(tool);
    if (!info || info.broken) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function checkTool(tool: BinTool): Promise<{
  installed: boolean;
  version: string | null;
  path: string | null;
  managed: boolean;
  source: 'bundled' | 'managed' | 'system' | null;
  broken: boolean;
  error: string | null;
}> {
  const info = await resolveBinInfo(tool);
  if (!info) {
    return {
      installed: false,
      version: null,
      path: null,
      managed: false,
      source: null,
      broken: false,
      error: null
    };
  }
  return {
    installed: true,
    version: info.version,
    path: info.path,
    managed: info.managed,
    source: info.source,
    broken: info.broken,
    error: info.error
  };
}

export function registerDependencyHandlers(): void {
  ipcMain.handle('dep:checkFfmpeg', async () => checkTool('ffmpeg'));
  ipcMain.handle('dep:checkFfprobe', async () => checkTool('ffprobe'));
  ipcMain.handle('dep:checkMkvextract', async () => checkTool('mkvextract'));
  ipcMain.handle('dep:checkYtdlp', async () => checkTool('yt-dlp'));

  // Drops the per-process probe cache so the next `dep:check*` really re-runs the
  // binaries. Without it a tool removed outside the app (manually, another package
  // manager) kept reporting as installed until a restart — the resolver only
  // invalidates after an install/uninstall driven from here.
  ipcMain.handle('dep:recheck', () => {
    invalidateBinaries();
    return true;
  });

  ipcMain.handle(
    'dep:getPaths',
    async (): Promise<
      Array<{
        tool: BinTool;
        path: string | null;
        managed: boolean;
        version: string | null;
        source: 'bundled' | 'managed' | 'system' | null;
        broken: boolean;
        error: string | null;
      }>
    > => {
      // The diagnostics report must show the current system, not the cached probe.
      invalidateBinaries();
      const tools: BinTool[] = ['ffmpeg', 'ffprobe', 'yt-dlp', 'mkvextract'];
      const results = await Promise.all(tools.map((t) => resolveBinInfo(t)));
      return tools.map((tool, i) => {
        const info = results[i];
        return {
          tool,
          path: info?.path ?? null,
          managed: info?.managed ?? false,
          version: info?.version ?? null,
          source: info?.source ?? null,
          broken: info?.broken ?? false,
          error: info?.error ?? null
        };
      });
    }
  );

  ipcMain.handle('dep:checkUpdateYtdlp', async () => {
    const latest = await fetchLatestYtdlpVersion();
    const info = await resolveBinInfo('yt-dlp');
    const current = info?.version ?? null;
    const updateAvailable = !!(latest && current && latest !== current);
    return { updateAvailable, current, latest };
  });

  ipcMain.handle('dep:cancelInstall', (_event, tool: string) => {
    abortTool(tool);
    return true;
  });

  ipcMain.handle('dep:installFfmpeg', async (event) => {
    // Managed download (pinned + SHA-256 verified, no sudo) is the default on
    // every platform the manifest pins a build for. The packaged app no longer
    // bundles FFmpeg, so this is the primary install path; system package
    // managers remain the fallback where no build is pinned.
    if (ffmpegDownloadUrl()) {
      return installFfmpegManaged(event.sender);
    }
    return installSystem(event.sender, 'ffmpeg');
  });

  ipcMain.handle('dep:installMkvextract', async (event) =>
    installSystem(event.sender, 'mkvextract')
  );

  ipcMain.handle('dep:installYtdlp', async (event) => installYtdlpManaged(event.sender, false));

  ipcMain.handle('dep:updateYtdlp', async (event) => installYtdlpManaged(event.sender, true));

  ipcMain.handle('dep:removeYtdlp', async (event) => uninstallTool(event.sender, 'yt-dlp'));
  ipcMain.handle('dep:removeFfmpeg', async (event) => uninstallTool(event.sender, 'ffmpeg'));
  ipcMain.handle('dep:removeFfprobe', async (event) => uninstallTool(event.sender, 'ffprobe'));
  ipcMain.handle('dep:removeMkvextract', async (event) =>
    uninstallTool(event.sender, 'mkvextract')
  );
}

// keep re-exported for legacy callers/tests
export { resolveBin };
