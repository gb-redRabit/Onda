import { dialog, BrowserWindow, type WebContents } from 'electron';
import { mkdir, chmod, unlink, rm, copyFile } from 'fs/promises';
import { basename, join } from 'path';
import { runCommand } from '../../utils/exec';
import { mainMessages } from '../../i18n-main';
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
import { getBinDir, resolveBinInfo, invalidateBinaries } from '../../binaries';
import {
  emitProgress,
  newSignal,
  clearSignal,
  downloadFile,
  fetchLatestYtdlpVersion,
  verifyDownloadedFile,
  verifyFileSha256,
  type InstallResult
} from './dependency-download';

// Instalatory/dezinstalatory narzędzi zależności (yt-dlp/FFmpeg zarządzane + systemowe),
// wyodrębnione z `dependency-handlers.ts`. Rejestracja IPC pozostaje w handlerach.

// Pobiera asset wydania yt-dlp do userData/bin i weryfikuje jego SHA-256.
export async function installYtdlpManaged(
  sender: WebContents,
  reinstall: boolean
): Promise<InstallResult> {
  const signal = newSignal('yt-dlp');
  try {
    const binDir = getBinDir();
    await mkdir(binDir, { recursive: true });
    const dest = join(binDir, ytdlpBinaryName());
    // Zawsze rozwiązuj najnowsze wydanie z aktywnego kanału (GitHub
    // *tag* jest niezmienny, w przeciwieństwie do zmiennego redirectu `latest`); przypięty tag
    // jest tylko fallbackiem, gdy API GitHub jest nieosiągalne.
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
      await unlink(dest).catch(() => {
        /* best-effort */
      });
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
    return { success: false, error: err.message || mainMessages().depYtDlp };
  } finally {
    clearSignal('yt-dlp');
  }
}

// Wyodrębnia archiwum zip (Windows/macOS) lub tar.xz (Linux). macOS bsdtar i
// `unzip` obsługują zip; GNU tar w Linuxie nie, ale buildy dla Linuxa są w
// tar.xz, więc każda platforma trafia tylko na obsługiwany przez siebie ekstraktor.
async function extractArchive(archive: string, dest: string): Promise<void> {
  if (process.platform === 'win32') {
    // Escape'uje pojedyncze cudzysłowy dla dosłownych ścieżek w pojedynczych cudzysłowach PowerShell.
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

// Kopiuje pobraną binarkę na miejsce i przywraca bit wykonywalności w POSIX.
async function installBinary(src: string, dest: string): Promise<void> {
  await copyFile(src, dest);
  if (process.platform !== 'win32') {
    await chmod(dest, 0o755);
  }
}

// Pobiera przypięty zarządzany build FFmpeg do userData/bin i weryfikuje jego
// SHA-256. Archiwa Windows/Linux zawierają oba narzędzia; macOS dostarcza ffmpeg i
// ffprobe jako osobne archiwa (probe jest przypięty przez probeUrl/probeSha256).
export async function installFfmpegManaged(sender: WebContents): Promise<InstallResult> {
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
    await rm(archive, { force: true }).catch(() => {
      /* best-effort */
    });
    await downloadFile(url, archive, signal, (received, total) => {
      const pct = total > 0 ? 5 + Math.round((received / total) * 75) : 5;
      emitProgress(sender, 'ffmpeg', 'download', pct);
    });

    emitProgress(sender, 'ffmpeg', 'verify', 82);
    try {
      await verifyFileSha256(archive, sha256, signal);
    } catch (e) {
      await rm(archive, { force: true }).catch(() => {
        /* best-effort */
      });
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
    await rm(extractDir, { recursive: true, force: true }).catch(() => {
      /* best-effort */
    });
    await mkdir(extractDir, { recursive: true });
    await extractArchive(archive, extractDir);

    const { findFile } = await import('../zip-utils');
    const ffmpegFile = await findFile(extractDir, `ffmpeg${exe}`);
    if (!ffmpegFile) {
      return { success: false, error: `Nie znaleziono ffmpeg${exe} w pobranym archiwum.` };
    }
    await installBinary(ffmpegFile, ffmpegDest);

    // ffprobe: zwykle w tym samym archiwum; macOS publikuje go osobno.
    let probeFile = await findFile(extractDir, `ffprobe${exe}`);
    const probeUrl = ffmpegProbeUrl();
    const probeSha256 = ffmpegProbeSha256();
    if (!probeFile && probeUrl && probeSha256) {
      emitProgress(sender, 'ffmpeg', 'download', 92);
      await rm(probeArchive, { force: true }).catch(() => {
        /* best-effort */
      });
      await downloadFile(probeUrl, probeArchive, signal, () => {});
      await verifyFileSha256(probeArchive, probeSha256, signal);
      await rm(probeExtractDir, { recursive: true, force: true }).catch(() => {
        /* best-effort */
      });
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
    return { success: false, error: err.message || mainMessages().depFfmpeg };
  } finally {
    for (const path of cleanup) {
      await rm(path, { recursive: true, force: true }).catch(() => {
        /* best-effort */
      });
    }
    clearSignal('ffmpeg');
  }
}

async function runShell(argv: string[]): Promise<string> {
  return runCommand(argv[0], argv.slice(1), { timeout: 600000 });
}

// Prosi użytkownika o wyraźną zgodę przed uruchomieniem uprzywilejowanej (sudo -n)
// komendy systemowej na żądanie renderera. Zwraca false przy anulowaniu.
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

// Instalacja systemowa przez menedżera pakietów z prawdziwą weryfikacją po instalacji.
export async function installSystem(sender: WebContents, tool: BinTool): Promise<InstallResult> {
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

// Ponawia probe kilka razy po dezinstalacji: pozostały shim wskazujący na
// usunięte pliki (lub niedokończone usuwanie) jest raportowany przez resolver jako
// `broken`, co dla pytania "czy dezinstalacja zadziałała?" oznacza brak.
async function waitUntilRemoved(tool: BinTool): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    invalidateBinaries();
    const info = await resolveBinInfo(tool);
    if (!info || info.broken) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

export async function uninstallTool(sender: WebContents, tool: BinTool): Promise<InstallResult> {
  const info = await resolveBinInfo(tool);
  if (info?.managed) {
    // Tylko pliki w userData/bin są nasze do usunięcia. `managed` obejmuje też
    // binarkę dołączoną do aplikacji (resources/ffmpeg) — nigdy jej nie odłączaj.
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
      return { success: false, error: err.message || mainMessages().depRemove };
    }
  }

  // Instalacja systemowa — wywnioskuj, który menedżer faktycznie nią zarządza, ze rozwiązanej
  // ścieżki (shimy choco/winGet/scoop są w charakterystycznych folderach), potem przejdź
  // po wszystkich dostępnych menedżerach, aż binarka naprawdę zniknie.
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
      // Menedżery pakietów usuwają pliki asynchronicznie i często na chwilę
      // zostawiają shim, więc daj im moment i traktuj "znaleziona, ale już
      // nieuruchamialna" jako usuniętą — inaczej udana dezinstalacja winget była
      // raportowana jako błąd ("binarka nadal istnieje").
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
