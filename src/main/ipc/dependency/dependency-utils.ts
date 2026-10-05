import { join } from 'path';
import { existsSync } from 'fs';
import { runCommand } from '../../utils/exec';
import { logger } from '../../../shared/logger';
import { errMsg } from '../../../shared/helpers';
import type { DepSource } from '../../../shared/types/ipc/channels-system';
import binaries from '../../../../binaries.json';

export type BinTool = 'ffmpeg' | 'ffprobe' | 'yt-dlp' | 'mkvextract';
type PkgManager = 'winget' | 'choco' | 'scoop' | 'brew' | 'apt' | 'dnf' | 'pacman';

export function toolFileName(tool: BinTool): string {
  const win = process.platform === 'win32';
  if (tool === 'yt-dlp') return win ? 'yt-dlp.exe' : 'yt-dlp';
  return win ? `${tool}.exe` : tool;
}

export function ytdlpBinaryName(): string {
  return toolFileName('yt-dlp');
}

function managedBinPath(binDir: string, tool: BinTool): string {
  return join(binDir, toolFileName(tool));
}

// Ścieżka do binarki dołączonej do aplikacji. Spakowana aplikacja nie dostarcza już
// FFmpeg (użytkownicy instalują go w userData/bin), więc to pasuje tylko do lokalnego
// układu `resources/ffmpeg/<platform>-<arch>` utworzonego na potrzeby developmentu/eksperymentów
// offline (scripts/fetch-ffmpeg.mjs). Zwraca null, gdy nie istnieje.
function bundledBinPath(
  tool: BinTool,
  resourcesPath?: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string | null {
  if (typeof resourcesPath !== 'string' || !resourcesPath) return null;
  for (const rel of [
    join('ffmpeg', `${platform}-${arch}`, toolFileName(tool)),
    join('ffmpeg', toolFileName(tool))
  ]) {
    const p = join(resourcesPath, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

// `process.resourcesPath` Electrona jest zdefiniowane tylko w procesie main; czytamy je
// defensywnie, aby kod zależności działał też w zwykłym Node (testy).
function currentResourcesPath(): string | undefined {
  return (process as { resourcesPath?: string }).resourcesPath;
}

// Kanał wydań yt-dlp i fallbackowy pin pochodzą z binaries.json (aktualizacje
// wyłącznie przez PR). `nightly` dostarcza poprawki YouTube od dnia zero — kanał stabilny może
// pozostawać tygodniami za zmianami łamiącymi (np. fala SABR/403 z 2026-08, naprawiona
// na masterze 2026-08-18, wciąż nieobecna w stabilnym 2026.07.04).
export type YtdlpChannel = 'stable' | 'nightly';
export const YTDLP_CHANNEL = binaries.ytdlp.channel as YtdlpChannel;

// Przypięte do konkretnego tagu wydania zamiast `releases/latest/download` —
// URL `latest` jest zmienny, więc przejęte lub omyłkowe wydanie zostałoby pobrane
// po cichu przy następnej świeżej instalacji. Podnoś to ręcznie; wbudowany updater
// wciąż pobiera konkretny najnowszy tag, gdy użytkownik jawnie aktualizuje.
// Tagi nightly wyglądają jak `2026.08.18.122307` (bez wiodącego "v").
export const YTDLP_PINNED_VERSION: string = binaries.ytdlp.pinnedVersion;

function ytdlpRepo(channel: YtdlpChannel): string {
  return channel === 'nightly'
    ? 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download'
    : 'https://github.com/yt-dlp/yt-dlp/releases/download';
}

export function ytdlpDownloadUrl(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  version: string = YTDLP_PINNED_VERSION,
  channel: YtdlpChannel = YTDLP_CHANNEL
): string {
  // Tagi yt-dlp nie mają wiodącego "v" (np. "2026.07.04", "2026.08.18.122307")
  const base = `${ytdlpRepo(channel)}/${version}`;
  switch (platform) {
    case 'win32':
      return `${base}/yt-dlp.exe`;
    case 'darwin':
      // Nightly dostarcza jeden uniwersalny `yt-dlp_macos`; stabilny dodatkowo
      // publikuje `yt-dlp_macos_legacy` dla Intela.
      return channel === 'nightly' || arch === 'arm64'
        ? `${base}/yt-dlp_macos`
        : `${base}/yt-dlp_macos_legacy`;
    case 'linux':
      return arch === 'arm64' || arch === 'arm' ? `${base}/yt-dlp_linux_aarch64` : `${base}/yt-dlp`;
    default:
      return `${base}/yt-dlp`;
  }
}

// yt-dlp publikuje pojedynczy manifest sum kontrolnych (SHA2-256SUMS), a nie hash'e
// per plik; tag wydania jest niezmienny, więc manifest odpowiada pinowi.
export function ytdlpShaUrl(
  version: string = YTDLP_PINNED_VERSION,
  channel: YtdlpChannel = YTDLP_CHANNEL
): string {
  return `${ytdlpRepo(channel)}/${version}/${binaries.ytdlp.shaManifest}`;
}

interface ManagedFfmpegSource {
  version: string;
  url: string;
  sha256: string;
  kind: string;
  /** macOS dostarcza ffprobe jako osobne archiwum. */
  probeUrl?: string;
  probeSha256?: string;
}

const MANAGED_FFMPEG = binaries.ffmpeg.managed as Record<string, ManagedFfmpegSource>;

// Zarządzane (w aplikacji) buildy FFmpeg są dostępne dla każdej platformy, na którą
// dostarczamy. Są przypięte w binaries.json do niezmiennego tagu/assetu wydania ORAZ
// dokładnego SHA-256, więc pobranie jest weryfikowane bez zmiennego manifestu
// sum kontrolnych. Windows/Linux używają buildów LGPL (bez redystrybucji GPL), macOS
// używa evermeet (przypięty hash; aplikacja go pobiera, nigdy nie dołącza).
export function ffmpegDownloadUrl(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string | null {
  return MANAGED_FFMPEG[`${platform}-${arch}`]?.url ?? null;
}

export function ffmpegSha256(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string | null {
  return MANAGED_FFMPEG[`${platform}-${arch}`]?.sha256 ?? null;
}

/** Osobne archiwum ffprobe (tylko macOS) — null, gdy główne archiwum je zawiera. */
export function ffmpegProbeUrl(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string | null {
  return MANAGED_FFMPEG[`${platform}-${arch}`]?.probeUrl ?? null;
}

export function ffmpegProbeSha256(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string | null {
  return MANAGED_FFMPEG[`${platform}-${arch}`]?.probeSha256 ?? null;
}

// Przeszukuje systemowy PATH w poszukiwaniu pliku wykonywalnego (z uwzględnieniem PATHEXT w Windows).
export function whichInPath(binName: string): string | null {
  const isWin = process.platform === 'win32';
  const pathVar = process.env.PATH || '';
  const pathext = isWin
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  const dirs = pathVar.split(isWin ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    // toolFileName() już dodaje ".exe" w Windows — najpierw sprawdź dosłownie.
    const plain = join(dir, binName);
    if (existsSync(plain)) return plain;
    for (const ext of pathext) {
      const candidate = join(dir, isWin ? binName + ext.toLowerCase() : binName);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

interface VersionProbe {
  version: string | null;
  error: string | null;
}

async function probeVersion(bin: string, tool: BinTool): Promise<VersionProbe> {
  try {
    if (tool === 'yt-dlp') {
      const version = (await runCommand(bin, ['--version'], { timeout: 10000 })).trim();
      return { version, error: null };
    }
    if (tool === 'mkvextract') {
      const stdout = await runCommand(bin, ['--version'], { timeout: 10000 });
      const m = stdout.match(/mkvextract v([\d.]+)/);
      return { version: m ? m[1] : 'unknown', error: null };
    }
    const stdout = await runCommand(bin, ['-version'], { timeout: 10000 });
    const m = stdout.match(/(?:ffmpeg|ffprobe) version (\S+)/);
    return { version: m ? m[1] : 'unknown', error: null };
  } catch (e) {
    return { version: null, error: errMsg(e) };
  }
}

export interface ResolvedBinary {
  path: string;
  managed: boolean;
  version: string | null;
  source: DepSource;
  broken: boolean;
  error: string | null;
}

interface BinaryCandidate {
  path: string;
  source: DepSource;
}

// 1. dołączone (resources/ffmpeg) → 2. userData/bin (zarządzane) → 3. PATH (system),
// plus znane lokalizacje mkvextract. Kandydat, który istnieje, ale nie przechodzi
// próby `--version`, jest oznaczany jako `broken` i pomijany, aby następne źródło mogło
// samo uleczyć narzędzie (np. uszkodzony dołączony build spada do zarządzanej
// instalacji). Gdy nic nie działa, zwracany jest pierwszy zepsuty kandydat, aby
// UI mogło zaproponować ponowną instalację.
export async function resolveBinary(binDir: string, tool: BinTool): Promise<ResolvedBinary | null> {
  const candidates: BinaryCandidate[] = [];
  const bundled = bundledBinPath(tool, currentResourcesPath());
  if (bundled) candidates.push({ path: bundled, source: 'bundled' });
  const managedPath = managedBinPath(binDir, tool);
  if (existsSync(managedPath)) candidates.push({ path: managedPath, source: 'managed' });
  const pathBin = whichInPath(toolFileName(tool));
  if (pathBin) candidates.push({ path: pathBin, source: 'system' });
  // mkvextract jest często instalowany do stałej ścieżki bez dodania do PATH
  // (np. C:\Program Files\MKVToolNix) — spróbuj też tych znanych lokalizacji.
  if (tool === 'mkvextract') {
    for (const candidate of getMkvExtractCandidates().slice(1)) {
      if (existsSync(candidate)) candidates.push({ path: candidate, source: 'system' });
    }
  }

  let firstBroken: ResolvedBinary | null = null;
  for (const candidate of candidates) {
    const probe = await probeVersion(candidate.path, tool);
    const resolved: ResolvedBinary = {
      path: candidate.path,
      managed: candidate.source !== 'system',
      version: probe.version,
      source: candidate.source,
      broken: probe.version === null,
      error: probe.error
    };
    if (!resolved.broken) return resolved;
    logger.warn(
      'deps',
      `${tool}: ${candidate.source} binary failed the version probe (${candidate.path}): ${probe.error}`
    );
    if (!firstBroken) firstBroken = resolved;
  }
  return firstBroken;
}

function installPackageName(tool: BinTool): string {
  switch (tool) {
    case 'ffmpeg':
    case 'ffprobe':
      return 'ffmpeg';
    case 'yt-dlp':
      return 'yt-dlp';
    case 'mkvextract':
      return 'mkvtoolnix';
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await runCommand(cmd, ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

const PKG_MANAGER_CMDS: Record<PkgManager, string> = {
  winget: 'winget',
  choco: 'choco',
  scoop: 'scoop',
  brew: 'brew',
  apt: 'apt-get',
  dnf: 'dnf',
  pacman: 'pacman'
};

// Wszystkie dostępne menedżery pakietów dla platformy, w kolejności preferencji.
export async function detectPkgManagers(
  platform: NodeJS.Platform = process.platform
): Promise<PkgManager[]> {
  const order: PkgManager[] =
    platform === 'win32'
      ? ['winget', 'choco', 'scoop']
      : platform === 'darwin'
        ? ['brew']
        : ['apt', 'dnf', 'pacman'];
  const available: PkgManager[] = [];
  for (const m of order) {
    if (await commandExists(PKG_MANAGER_CMDS[m])) available.push(m);
  }
  return available;
}

// Wnioskuje menedżera pakietów ze rozwiązanej ścieżki binarki (choco/winGet/scoop/brew
// instalują binarki w charakterystycznych lokalizacjach).
export function inferPkgManager(binPath: string | null): PkgManager | null {
  if (!binPath) return null;
  const p = binPath.toLowerCase().replace(/\\/g, '/');
  if (p.includes('chocolatey') || p.includes('choco/')) return 'choco';
  if (p.includes('winget')) return 'winget';
  if (p.includes('scoop')) return 'scoop';
  if (p.includes('homebrew') || p.includes('cellar')) return 'brew';
  return null;
}

interface PkgCommand {
  /** Pełna czytelna dla człowieka linia komend (dla komunikatów błędów / podpowiedzi). */
  cmd: string;
  /** Tablica argv gotowa dla spawn — bez shella, bez powierzchni do wstrzyknięć. */
  argv: string[];
}

function joinCmd(argv: string[]): string {
  return argv.map((a) => (/[\s"'\\]/.test(a) ? `"${a}"` : a)).join(' ');
}

function wingetInstallId(tool: BinTool): string {
  if (tool === 'ffmpeg' || tool === 'ffprobe') return 'Gyan.FFmpeg';
  if (tool === 'mkvextract') return 'MoritzBunkus.MKVToolNix';
  return 'yt-dlp.yt-dlp';
}

export function pkgInstallCommand(pkgManager: PkgManager, tool: BinTool): PkgCommand {
  const pkg = installPackageName(tool);
  let argv: string[];
  switch (pkgManager) {
    case 'winget':
      // --accept-source-agreements + --disable-interactivity nie pozwalają winget
      // zatrzymać się na niewidocznym pytaniu, gdy uruchamiany bez TTY (sam --silent
      // tłumi tylko UI instalatora, nie pytania o zgodę).
      argv = [
        'winget',
        'install',
        '--id',
        wingetInstallId(tool),
        '-e',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity'
      ];
      break;
    case 'choco':
      argv = ['choco', 'install', pkg, '-y', '--no-progress'];
      break;
    case 'scoop':
      argv = ['scoop', 'install', pkg];
      break;
    case 'brew':
      argv = ['brew', 'install', pkg];
      break;
    case 'apt':
      argv = ['sudo', '-n', 'apt-get', 'install', '-y', pkg];
      break;
    case 'dnf':
      argv = ['sudo', '-n', 'dnf', 'install', '-y', pkg];
      break;
    case 'pacman':
      argv = ['sudo', '-n', 'pacman', '-S', '--noconfirm', pkg];
      break;
  }
  return { cmd: joinCmd(argv), argv };
}

export function pkgUninstallCommand(pkgManager: PkgManager, tool: BinTool): PkgCommand {
  const pkg = installPackageName(tool);
  let argv: string[];
  switch (pkgManager) {
    case 'winget':
      argv = ['winget', 'uninstall', '--id', wingetInstallId(tool)];
      break;
    case 'choco':
      argv = ['choco', 'uninstall', pkg, '-y'];
      break;
    case 'scoop':
      argv = ['scoop', 'uninstall', pkg];
      break;
    case 'brew':
      argv = ['brew', 'uninstall', pkg];
      break;
    case 'apt':
      argv = ['sudo', '-n', 'apt-get', 'remove', '-y', pkg];
      break;
    case 'dnf':
      argv = ['sudo', '-n', 'dnf', 'remove', '-y', pkg];
      break;
    case 'pacman':
      argv = ['sudo', '-n', 'pacman', '-R', '--noconfirm', pkg];
      break;
  }
  return { cmd: joinCmd(argv), argv };
}

/** True, gdy komendy menedżera wymagają podniesionych uprawnień (sudo -n). */
export function needsSudo(pkgManager: PkgManager): boolean {
  return pkgManager === 'apt' || pkgManager === 'dnf' || pkgManager === 'pacman';
}

export function getMkvExtractCandidates(): string[] {
  const isWin = process.platform === 'win32';
  if (isWin) {
    return [
      'mkvextract',
      'C:\\Program Files\\MKVToolNix\\mkvextract.exe',
      'C:\\Program Files (x86)\\MKVToolNix\\mkvextract.exe'
    ];
  }
  const home = process.env.HOME || '/usr/local';
  return [
    'mkvextract',
    '/usr/local/bin/mkvextract',
    '/usr/bin/mkvextract',
    join(home, 'bin', 'mkvextract'),
    '/opt/homebrew/bin/mkvextract'
  ];
}
