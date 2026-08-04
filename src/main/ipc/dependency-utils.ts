import { join } from 'path';

export function ytdlpBinaryName(): string {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

export function ytdlpDownloadUrl(platform: NodeJS.Platform): string {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
  switch (platform) {
    case 'win32':
      return `${base}/yt-dlp.exe`;
    case 'darwin':
      return `${base}/yt-dlp_macos`;
    default:
      return `${base}/yt-dlp`;
  }
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
