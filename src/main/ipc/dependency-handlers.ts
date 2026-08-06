import { ipcMain, dialog, BrowserWindow, type WebContents } from 'electron';
import { mkdir, chmod, unlink, readFile, rm } from 'fs/promises';
import { join, basename } from 'path';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';
import { createHash } from 'crypto';
import { runCommand } from '../utils/exec';
import {
  ytdlpBinaryName,
  ytdlpDownloadUrl,
  ytdlpShaUrl,
  ffmpegDownloadUrl,
  ffmpegShaUrl,
  detectPkgManagers,
  inferPkgManager,
  pkgInstallCommand,
  pkgUninstallCommand,
  needsSudo,
  YTDLP_PINNED_VERSION,
  toolFileName,
  type BinTool
} from './dependency-utils';
import { getBinDir, resolveBin, resolveBinInfo, invalidateBinaries } from '../binaries';

interface InstallResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  path?: string | null;
  managed?: boolean;
}

const activeControllers = new Map<string, AbortController>();

function emitProgress(sender: WebContents, tool: string, stage: string, percent: number): void {
  if (sender.isDestroyed()) return;
  sender.send('dep:progress', { tool, stage, percent });
}

function newSignal(tool: BinTool): AbortSignal {
  activeControllers.get(tool)?.abort();
  const controller = new AbortController();
  activeControllers.set(tool, controller);
  return controller.signal;
}

function clearSignal(tool: BinTool): void {
  activeControllers.delete(tool);
}

function downloadFile(
  url: string,
  dest: string,
  signal: AbortSignal,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('cancelled'));
      return;
    }
    const client = url.startsWith('https') ? https : http;
    const onAbort = () => reject(new Error('cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });

    const req = client.get(
      url,
      { headers: { 'User-Agent': 'Onda/1.0' } },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          downloadFile(res.headers.location, dest, signal, onProgress).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers['content-length'] || 0);
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          onProgress?.(received, total);
        });
        const file = createWriteStream(dest);
        file.on('finish', () => {
          signal.removeEventListener('abort', onAbort);
          file.close(() => resolve());
        });
        file.on('error', reject);
        res.pipe(file);
      }
    );
    req.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

async function fetchLatestYtdlpVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',
      { headers: { 'User-Agent': 'Onda/1.0', Accept: 'application/vnd.github+json' } },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d.toString('utf-8')));
        res.on('end', () => {
          try {
            const json = JSON.parse(body) as { tag_name?: string };
            resolve(json.tag_name ? json.tag_name.replace(/^v/, '') : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function sha256OfFile(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

// Fail-closed checksum verification: downloads a SHA manifest, finds the entry for
// `assetName`, and compares it against the SHA-256 of `filePath`. Throws on any
// failure (download error, missing entry, or mismatch) so the caller never keeps
// an unverified binary.
async function verifyDownloadedFile(
  filePath: string,
  shaUrl: string,
  assetName: string,
  signal: AbortSignal
): Promise<void> {
  const shaDest = join(getBinDir(), `onda-${Date.now()}.sha256`);
  try {
    await downloadFile(shaUrl, shaDest, signal);
    // Manifest lines look like `<hash>  <filename>` (and sometimes `*filename`).
    const line = (await readFile(shaDest, 'utf-8'))
      .split(/\r?\n/)
      .find((l) => l.trim().endsWith(` ${assetName}`) || l.trim().endsWith(` *${assetName}`));
    const expected = line?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const actual = await sha256OfFile(filePath);
    if (!expected || expected !== actual) {
      throw new Error(`Checksum mismatch for ${assetName}`);
    }
  } finally {
    await unlink(shaDest).catch(() => {});
  }
}

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
    // Fresh installs use the pinned release; updates fetch the specific latest
    // tag (never the mutable `latest` redirect).
    const version = reinstall
      ? ((await fetchLatestYtdlpVersion()) ?? YTDLP_PINNED_VERSION)
      : YTDLP_PINNED_VERSION;
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

// Downloads a managed FFmpeg build (Windows only) and extracts ffmpeg.exe + ffprobe.exe.
async function installFfmpegManaged(sender: WebContents): Promise<InstallResult> {
  const signal = newSignal('ffmpeg');
  try {
    const url = ffmpegDownloadUrl();
    if (!url) return { success: false, error: 'Managed FFmpeg nie jest dostępny na tej platformie.' };

    const binDir = getBinDir();
    await mkdir(binDir, { recursive: true });
    const zipPath = join(binDir, 'ffmpeg-download.zip');
    const extractDir = join(binDir, 'ffmpeg-extract');

    emitProgress(sender, 'ffmpeg', 'download', 5);
    await downloadFile(url, zipPath, signal, (received, total) => {
      const pct = total > 0 ? 5 + Math.round((received / total) * 80) : 5;
      emitProgress(sender, 'ffmpeg', 'download', pct);
    });

    const shaUrl = ffmpegShaUrl();
    if (shaUrl) {
      emitProgress(sender, 'ffmpeg', 'verify', 86);
      try {
        await verifyDownloadedFile(zipPath, shaUrl, basename(url), signal);
      } catch (e) {
        await rm(zipPath, { force: true }).catch(() => {});
        const err = e as { message?: string };
        if (err.message === 'cancelled' || signal.aborted) {
          return { success: false, cancelled: true };
        }
        return {
          success: false,
          error: 'Weryfikacja sumy kontrolnej nie powiodła się — pobrany plik jest uszkodzony.'
        };
      }
    }

    emitProgress(sender, 'ffmpeg', 'extract', 88);
    await rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(extractDir, { recursive: true });
    await runCommand(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`
      ],
      { timeout: 300000 }
    ).catch(async () => {
      await runCommand('tar', ['-xf', zipPath, '-C', extractDir], { timeout: 300000 });
    });

    const { findFile } = await import('./zip-utils');
    const ffmpegExe = await findFile(extractDir, 'ffmpeg.exe');
    const ffprobeExe = await findFile(extractDir, 'ffprobe.exe');
    if (!ffmpegExe || !ffprobeExe) {
      return { success: false, error: 'Nie znaleziono ffmpeg.exe/ffprobe.exe w pobranym archiwum.' };
    }

    const ffmpegDest = join(binDir, 'ffmpeg.exe');
    const ffprobeDest = join(binDir, 'ffprobe.exe');
    await import('fs/promises').then(({ copyFile }) =>
      Promise.all([copyFile(ffmpegExe, ffmpegDest), copyFile(ffprobeExe, ffprobeDest)])
    );
    await rm(zipPath, { force: true }).catch(() => {});
    await rm(extractDir, { recursive: true, force: true }).catch(() => {});

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
async function installSystem(
  sender: WebContents,
  tool: BinTool
): Promise<InstallResult> {
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
  const candidates = inferred
    ? [inferred, ...managers.filter((m) => m !== inferred)]
    : managers;

  const errors: string[] = [];
  for (const pm of candidates) {
    const { cmd, argv } = pkgUninstallCommand(pm, tool);
    if (needsSudo(pm) && !(await confirmPrivileged(sender, cmd))) {
      return { success: false, cancelled: true };
    }
    try {
      const output = await runShell(argv);
      invalidateBinaries();
      const stillThere = await resolveBinInfo(tool);
      if (!stillThere) return { success: true };
      errors.push(`${cmd} — binarka nadal istnieje\n${output}`);
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      errors.push(`${cmd} — ${err.stderr || err.stdout || err.message || 'nieznany błąd'}`);
    }
  }

  return {
    success: false,
    error:
      'Odinstalowanie nie powiodło się. Skopiuj i uruchom ręcznie:\n' +
      candidates.map((pm) => pkgUninstallCommand(pm, tool).cmd).join('\n') +
      '\n\n' +
      errors.join('\n')
  };
}

async function checkTool(tool: BinTool): Promise<{
  installed: boolean;
  version: string | null;
  path: string | null;
  managed: boolean;
}> {
  const info = await resolveBinInfo(tool);
  if (!info) return { installed: false, version: null, path: null, managed: false };
  return {
    installed: true,
    version: info.version,
    path: info.path,
    managed: info.managed
  };
}

export function registerDependencyHandlers(): void {
  ipcMain.handle('dep:checkFfmpeg', async () => checkTool('ffmpeg'));
  ipcMain.handle('dep:checkFfprobe', async () => checkTool('ffprobe'));
  ipcMain.handle('dep:checkMkvextract', async () => checkTool('mkvextract'));
  ipcMain.handle('dep:checkYtdlp', async () => checkTool('yt-dlp'));

  ipcMain.handle(
    'dep:getPaths',
    async (): Promise<
      Array<{ tool: BinTool; path: string | null; managed: boolean; version: string | null }>
    > => {
      const tools: BinTool[] = ['ffmpeg', 'ffprobe', 'yt-dlp', 'mkvextract'];
      const results = await Promise.all(tools.map((t) => resolveBinInfo(t)));
      return tools.map((tool, i) => ({
        tool,
        path: results[i]?.path ?? null,
        managed: results[i]?.managed ?? false,
        version: results[i]?.version ?? null
      }));
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
    activeControllers.get(tool as BinTool)?.abort();
    return true;
  });

  ipcMain.handle('dep:installFfmpeg', async (event) => {
    if (process.platform === 'win32') {
      return installFfmpegManaged(event.sender);
    }
    return installSystem(event.sender, 'ffmpeg');
  });

  ipcMain.handle('dep:installMkvextract', async (event) => installSystem(event.sender, 'mkvextract'));

  ipcMain.handle('dep:installYtdlp', async (event) => installYtdlpManaged(event.sender, false));

  ipcMain.handle('dep:updateYtdlp', async (event) => installYtdlpManaged(event.sender, true));

  ipcMain.handle('dep:removeYtdlp', async (event) => uninstallTool(event.sender, 'yt-dlp'));
  ipcMain.handle('dep:removeFfmpeg', async (event) => uninstallTool(event.sender, 'ffmpeg'));
  ipcMain.handle('dep:removeMkvextract', async (event) => uninstallTool(event.sender, 'mkvextract'));
}

// keep re-exported for legacy callers/tests
export { toolFileName, resolveBin };
