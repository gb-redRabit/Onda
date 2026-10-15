import { runCommand } from '../../../utils/exec';
import { resolveBin } from '../../../binaries';

// Wspólny resolver dla hosterów obsługiwanych przez yt-dlp (Dropbox, Yandex.Disk,
// Internet Archive). `-J` zwraca metadane + bezpośredni URL; strony „details" (archive)
// zwracają playlistę wpisów — obsługujemy oba przypadki.

export interface HosterEntry {
  id: string;
  url: string;
  title: string;
  size?: number;
}

interface YtDlpInfo {
  id?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
  filesize?: number;
  filesize_approx?: number;
  entries?: YtDlpInfo[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 64;
const hosterCache = new Map<string, { entries: HosterEntry[]; at: number }>();

export function __resetHosterCache(): void {
  hosterCache.clear();
}

export async function inspectHoster(pageUrl: string): Promise<HosterEntry[]> {
  const cleanUrl = typeof pageUrl === 'string' ? pageUrl.trim() : '';
  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error('Nieprawidłowy URL hostera');
  }
  const now = Date.now();
  const cached = hosterCache.get(cleanUrl);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.entries;
  }
  const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
  // `--` przed URL zapobiega potraktowaniu ciągu zaczynającego się od `-` jako flagi CLI yt-dlp.
  const stdout = await runCommand(bin, ['--no-warnings', '-J', '--', cleanUrl], { timeout: 60000 });
  const info = JSON.parse(stdout) as YtDlpInfo;
  const rawEntries = Array.isArray(info.entries) ? info.entries : [info];
  const entries = rawEntries
    .filter((e): e is YtDlpInfo => !!e && !!(e.url || e.webpage_url))
    .map((e) => ({
      id: String(e.id ?? e.url ?? e.webpage_url),
      url: String(e.url ?? e.webpage_url),
      title: String(e.title ?? e.id ?? 'file'),
      size:
        typeof e.filesize === 'number'
          ? e.filesize
          : typeof e.filesize_approx === 'number'
            ? e.filesize_approx
            : undefined
    }));
  if (hosterCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = hosterCache.keys().next().value;
    if (oldest) hosterCache.delete(oldest);
  }
  hosterCache.set(cleanUrl, { entries, at: now });
  return entries;
}
