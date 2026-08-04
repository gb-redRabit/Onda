import { ipcMain, app } from 'electron';
import { stat, mkdir, chmod } from 'fs/promises';
import { join } from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { runCommand } from '../utils/exec';
import { ytdlpBinaryName, ytdlpDownloadUrl, getMkvExtractCandidates } from './dependency-utils';
import { logger } from '../../shared/logger';

const execAsync = promisify(execCb);

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, { headers: { 'User-Agent': 'Onda/1.0' } }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = createWriteStream(dest);
        pipeline(res, file).then(resolve).catch(reject);
      })
      .on('error', reject);
  });
}

async function checkVersion(
  bin: string,
  args: string[],
  regex: RegExp
): Promise<{ installed: boolean; version: string | null }> {
  try {
    const stdout = await runCommand(bin, args, { timeout: 10000 });
    const match = stdout.match(regex);
    return { installed: true, version: match?.[1] ?? 'unknown' };
  } catch (e) {
    logger.warn('deps', `checkVersion failed for ${bin}`, e);
    return { installed: false, version: null };
  }
}

export async function getYtdlpPath(): Promise<string> {
  const localBin = join(app.getPath('userData'), 'bin', ytdlpBinaryName());
  try {
    await stat(localBin);
    return localBin;
  } catch {
    // not installed locally — fall back to PATH
  }
  return 'yt-dlp';
}

export async function getMkvExtractPath(): Promise<string> {
  const candidates = getMkvExtractCandidates();
  for (const c of candidates) {
    try {
      await runCommand(c, ['--version'], { timeout: 5000 });
      return c;
    } catch {
      // candidate not available — try next
    }
  }
  return 'mkvextract';
}

export function registerDependencyHandlers(): void {
  ipcMain.handle('dep:checkFfmpeg', async () => {
    return checkVersion('ffmpeg', ['-version'], /ffmpeg version (\S+)/);
  });

  ipcMain.handle('dep:checkYtdlp', async () => {
    const localBin = join(app.getPath('userData'), 'bin', ytdlpBinaryName());
    try {
      await stat(localBin);
      const stdout = await runCommand(localBin, ['--version'], { timeout: 10000 });
      return { installed: true, version: stdout.trim(), path: localBin };
    } catch {
      // not in local bin — check PATH
    }
    try {
      const stdout = await runCommand('yt-dlp', ['--version'], { timeout: 10000 });
      return { installed: true, version: stdout.trim(), path: 'yt-dlp' };
    } catch (e) {
      logger.warn('deps', 'yt-dlp not found on PATH', e);
      return { installed: false, version: null, path: null };
    }
  });

  ipcMain.handle('dep:checkFfprobe', async () => {
    return checkVersion('ffprobe', ['-version'], /ffprobe version (\S+)/);
  });

  function getInstallFfmpegCmd(): string {
    if (process.platform === 'win32') {
      return 'choco install ffmpeg -y --no-progress';
    }
    return 'which ffmpeg 2>/dev/null || (brew install ffmpeg 2>/dev/null || apt-get install -y ffmpeg 2>/dev/null || echo "unsupported")';
  }

  ipcMain.handle('dep:installFfmpeg', async () => {
    try {
      const cmd = getInstallFfmpegCmd();
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 300000,
        windowsHide: true
      });
      return { success: true, output: stdout + stderr };
    } catch (e: unknown) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const msg = err.stderr || err.stdout || err.message || 'Nieznany błąd';
      if (msg.includes('requires elevated permissions') || msg.includes('elevation required')) {
        return {
          success: false,
          error:
            'Wymagane uprawnienia administratora. Uruchom choco install ffmpeg -y w terminalu jako admin.'
        };
      }
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('dep:installYtdlp', async () => {
    try {
      const binDir = join(app.getPath('userData'), 'bin');
      await mkdir(binDir, { recursive: true });
      const dest = join(binDir, ytdlpBinaryName());
      await downloadFile(ytdlpDownloadUrl(process.platform), dest);
      if (process.platform !== 'win32') {
        await chmod(dest, 0o755);
      }
      return { success: true };
    } catch (e: unknown) {
      const err = e as { message?: string };
      return { success: false, error: err.message || 'Nie udało się pobrać yt-dlp' };
    }
  });

  ipcMain.handle('dep:checkMkvextract', async () => {
    try {
      const bin = await getMkvExtractPath();
      const stdout = await runCommand(bin, ['--version'], { timeout: 10000 });
      const match = stdout.match(/mkvextract v([\d.]+)/);
      return { installed: true, version: match ? match[1] : 'unknown' };
    } catch (e) {
      logger.warn('deps', 'mkvextract not found', e);
      return { installed: false, version: null };
    }
  });

  function getInstallMkvextractCmd(): string {
    if (process.platform === 'win32') {
      return 'choco install mkvtoolnix -y --no-progress';
    }
    return 'which mkvextract 2>/dev/null || (brew install mkvtoolnix 2>/dev/null || apt-get install -y mkvtoolnix 2>/dev/null || echo "unsupported")';
  }

  ipcMain.handle('dep:installMkvextract', async () => {
    try {
      const cmd = getInstallMkvextractCmd();
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 300000,
        windowsHide: true
      });
      return { success: true, output: stdout + stderr };
    } catch (e: unknown) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const msg = err.stderr || err.stdout || err.message || 'Nieznany błąd';
      if (msg.includes('requires elevated permissions') || msg.includes('elevation required')) {
        return {
          success: false,
          error:
            'Wymagane uprawnienia administratora. Uruchom choco install mkvtoolnix -y w terminalu jako admin.'
        };
      }
      return { success: false, error: msg };
    }
  });
}
