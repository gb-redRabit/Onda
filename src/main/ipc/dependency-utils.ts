import { join } from 'path';
import { existsSync } from 'fs';
import { runCommand } from '../utils/exec';

export type BinTool = 'ffmpeg' | 'ffprobe' | 'yt-dlp' | 'mkvextract';
export type PkgManager = 'winget' | 'choco' | 'scoop' | 'brew' | 'apt' | 'dnf' | 'pacman';

export function toolFileName(tool: BinTool): string {
  const win = process.platform === 'win32';
  if (tool === 'yt-dlp') return win ? 'yt-dlp.exe' : 'yt-dlp';
  return win ? `${tool}.exe` : tool;
}

export function ytdlpBinaryName(): string {
  return toolFileName('yt-dlp');
}

export function managedBinPath(binDir: string, tool: BinTool): string {
  return join(binDir, toolFileName(tool));
}

// Pinned to a concrete release tag instead of `releases/latest/download` — the
// `latest` URL is mutable, so a compromised or mistaken release would be pulled
// silently on the next fresh install. Bump this manually; the in-app updater
// still fetches the specific latest tag when the user explicitly updates.
export const YTDLP_PINNED_VERSION = '2026.07.04';

export function ytdlpDownloadUrl(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  version: string = YTDLP_PINNED_VERSION
): string {
  // yt-dlp tags do not carry a leading "v" (e.g. "2026.07.04")
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}`;
  switch (platform) {
    case 'win32':
      return `${base}/yt-dlp.exe`;
    case 'darwin':
      return arch === 'arm64' ? `${base}/yt-dlp_macos` : `${base}/yt-dlp_macos_legacy`;
    case 'linux':
      return arch === 'arm64' || arch === 'arm'
        ? `${base}/yt-dlp_linux_aarch64`
        : `${base}/yt-dlp`;
    default:
      return `${base}/yt-dlp`;
  }
}

// yt-dlp publishes a single checksums manifest (SHA2-256SUMS), not per-file hashes.
export function ytdlpShaUrl(version: string = YTDLP_PINNED_VERSION): string {
  return `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/SHA2-256SUMS`;
}

export function ffmpegDownloadUrl(platform: NodeJS.Platform = process.platform): string | null {
  if (platform === 'win32') {
    return 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
  }
  return null;
}

// BtbN publishes a `.sha256` file next to every release asset (same name + `.sha256`).
export function ffmpegShaUrl(platform: NodeJS.Platform = process.platform): string | null {
  const url = ffmpegDownloadUrl(platform);
  return url ? `${url}.sha256` : null;
}

// Search the system PATH for an executable (respecting PATHEXT on Windows).
export function whichInPath(binName: string): string | null {
  const isWin = process.platform === 'win32';
  const pathVar = process.env.PATH || '';
  const pathext = isWin
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  const dirs = pathVar.split(isWin ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    // toolFileName() already appends ".exe" on Windows — check it verbatim first.
    const plain = join(dir, binName);
    if (existsSync(plain)) return plain;
    for (const ext of pathext) {
      const candidate = join(dir, isWin ? binName + ext.toLowerCase() : binName);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function readVersion(bin: string, tool: BinTool): Promise<string | null> {
  try {
    if (tool === 'yt-dlp') {
      return (await runCommand(bin, ['--version'], { timeout: 10000 })).trim();
    }
    if (tool === 'mkvextract') {
      const stdout = await runCommand(bin, ['--version'], { timeout: 10000 });
      const m = stdout.match(/mkvextract v([\d.]+)/);
      return m ? m[1] : 'unknown';
    }
    const stdout = await runCommand(bin, ['-version'], { timeout: 10000 });
    const m = stdout.match(/(?:ffmpeg|ffprobe) version (\S+)/);
    return m ? m[1] : 'unknown';
  } catch {
    return null;
  }
}

export interface ResolvedBinary {
  path: string;
  managed: boolean;
  version: string | null;
}

// 1. userData/bin (managed) → 2. PATH (system). Returns null if not found.
export async function resolveBinary(
  binDir: string,
  tool: BinTool
): Promise<ResolvedBinary | null> {
  const managedPath = managedBinPath(binDir, tool);
  if (existsSync(managedPath)) {
    const version = await readVersion(managedPath, tool);
    return { path: managedPath, managed: true, version };
  }
  const pathBin = whichInPath(toolFileName(tool));
  if (pathBin) {
    const version = await readVersion(pathBin, tool);
    return { path: pathBin, managed: false, version };
  }
  // mkvextract is often installed to a fixed path without being added to PATH
  // (e.g. C:\Program Files\MKVToolNix) — try those known locations too.
  if (tool === 'mkvextract') {
    for (const candidate of getMkvExtractCandidates().slice(1)) {
      if (existsSync(candidate)) {
        const version = await readVersion(candidate, tool);
        return { path: candidate, managed: false, version };
      }
    }
  }
  return null;
}

export function installPackageName(tool: BinTool): string {
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

// Detect the best available package manager for a platform (Windows: winget → choco → scoop).
export async function detectPkgManager(
  platform: NodeJS.Platform = process.platform
): Promise<PkgManager | null> {
  const all = await detectPkgManagers(platform);
  return all[0] ?? null;
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

// All available package managers for a platform, in preference order.
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

// Infer the package manager from a resolved binary path (choco/winGet/scoop/brew
// install binaries to distinctive locations).
export function inferPkgManager(binPath: string | null): PkgManager | null {
  if (!binPath) return null;
  const p = binPath.toLowerCase().replace(/\\/g, '/');
  if (p.includes('chocolatey') || p.includes('choco/')) return 'choco';
  if (p.includes('winget')) return 'winget';
  if (p.includes('scoop')) return 'scoop';
  if (p.includes('homebrew') || p.includes('cellar')) return 'brew';
  return null;
}

export interface PkgCommand {
  /** Full human-readable command line (for error messages / user hints). */
  cmd: string;
  /** argv array ready for spawn — no shell, no injection surface. */
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
      argv = ['winget', 'install', '--id', wingetInstallId(tool), '-e', '--silent', '--accept-package-agreements'];
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

/** True when the manager's commands require elevated privileges (sudo -n). */
export function needsSudo(pkgManager: PkgManager): boolean {
  return pkgManager === 'apt' || pkgManager === 'dnf' || pkgManager === 'pacman';
}

/** @deprecated use pkgInstallCommand() for spawn-ready argv. */
export function pkgInstallCmd(pkgManager: PkgManager, tool: BinTool): string {
  return pkgInstallCommand(pkgManager, tool).cmd;
}

/** @deprecated use pkgUninstallCommand() for spawn-ready argv. */
export function pkgUninstallCmd(pkgManager: PkgManager, tool: BinTool): string {
  return pkgUninstallCommand(pkgManager, tool).cmd;
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
