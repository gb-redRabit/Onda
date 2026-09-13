import { existsSync } from 'fs';
import { win32 as winPath, posix as posixPath } from 'path';
import { fetchPageText } from './player-scraper';
import type { YoutubeAuthMethod } from '../../renderer/src/types/settings';
import type { YouTubeResolvedItem } from '../../renderer/src/types/online';
import { extractAvatarUrl, mapResolvedEntry, type YtDlpEntry } from './youtube-mappers';
export {
  formatDuration,
  formatUploadDate,
  isStableAvatarUrl,
  pickThumbnail,
  mapResolvedEntry,
  mapVideoEntry,
  pickChannelThumbnail,
  extractAvatarUrl
} from './youtube-mappers';
export type { YtDlpEntry } from './youtube-mappers';

export interface YtAuthConfig {
  method: YoutubeAuthMethod;
  cookiesPath?: string;
  cookiesBrowser?: string;
  // True when cookiesPath points to a temporary file that must be deleted by
  // the caller once the yt-dlp process finishes (see cleanupYtAuthTemp).
  temp?: boolean;
}

// Finds a Node.js executable that yt-dlp can use to solve YouTube's JavaScript
// challenges (signature / n-challenge). Without one, yt-dlp reports "JS runtimes:
// none" and playback extraction fails with "The page needs to be reloaded".
export function detectJsRuntime(
  env: NodeJS.ProcessEnv,
  probe: (path: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform
): string | null {
  // npm sets this to the node binary that runs npm scripts (dev flow).
  if (env.npm_node_execpath && probe(env.npm_node_execpath)) {
    return env.npm_node_execpath;
  }
  const separator = platform === 'win32' ? ';' : ':';
  const exe = platform === 'win32' ? 'node.exe' : 'node';
  // Build candidate paths with the platform's own grammar. IPC tests run on
  // every CI platform, so a win32 lookup must produce win32 separators even
  // when the host is posix (and vice versa); host join() alone would mix
  // separators (C:\foo + /bar) and never match a real executable.
  const pjoin = platform === 'win32' ? winPath : posixPath;
  for (const dir of (env.PATH || '').split(separator)) {
    if (!dir) continue;
    const candidate = pjoin.join(dir, exe);
    if (probe(candidate)) return candidate;
  }
  if (platform === 'win32') {
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const localAppData = env.LOCALAPPDATA;
    const systemRoot = env.SystemRoot || 'C:\\Windows';
    const fallbacks = [
      pjoin.join(programFiles, 'nodejs', 'node.exe'),
      ...(localAppData ? [pjoin.join(localAppData, 'Programs', 'nodejs', 'node.exe')] : []),
      pjoin.join(systemRoot, 'System32', 'node.exe')
    ];
    for (const candidate of fallbacks) {
      if (probe(candidate)) return candidate;
    }
  }
  return null;
}

let cachedRuntime: string | null | undefined;

// Cached wrapper around detectJsRuntime for production calls. Returns null when
// no runtime exists — yt-dlp then falls back to its own discovery.
function resolveJsRuntime(): string | null {
  if (cachedRuntime === undefined) {
    cachedRuntime = detectJsRuntime(process.env, existsSync, process.platform);
  }
  return cachedRuntime;
}

// Injects the authentication flags (session cookies) into a yt-dlp command.
// Works for both the in-app Google session ("electron"), an imported cookies
// file ("manual") and a system browser ("browser"). Also passes an explicit JS
// runtime to yt-dlp so signature/n-challenge solving never silently fails.
export function buildYtArgs(
  base: string[],
  auth?: YtAuthConfig | null,
  jsRuntime: string | null = resolveJsRuntime()
): string[] {
  const args = [...base];
  const extras: string[] = [];
  if (auth && auth.method !== 'none') {
    if (auth.method === 'browser' && auth.cookiesBrowser) {
      extras.push('--cookies-from-browser', auth.cookiesBrowser);
    } else if ((auth.method === 'electron' || auth.method === 'manual') && auth.cookiesPath) {
      extras.push('--cookies', auth.cookiesPath);
    }
  }
  if (jsRuntime && !args.includes('--js-runtimes') && !extras.includes('--js-runtimes')) {
    extras.push('--js-runtimes', `node:${jsRuntime}`);
  }
  // When the caller already ended the options list with '--', all injected
  // flags must land *before* that separator; otherwise yt-dlp treats them as
  // positional URLs.
  const sepIndex = args.indexOf('--');
  if (sepIndex >= 0) {
    args.splice(sepIndex, 0, ...extras);
  } else {
    args.push(...extras);
  }
  return args;
}

// Builds the base (pre-auth) argument list for resolving a direct audio
// stream URL via `yt-dlp -g`. Auth flags are injected later by buildYtArgs
// at spawn time, so this stays a pure function and is unit-testable.
export function buildStreamGetArgs(
  url: string,
  proxyArgs: string[] = [],
  options: { fallback?: boolean } = {}
): string[] {
  // Prefer progressive (https) formats, which <audio> can play directly:
  // DASH (http_dash_segments) and HLS (m3u8) streams need MSE/hls.js. The
  // trailing ba/bestaudio/b/w fallback keeps a result (possibly HLS, reported
  // as a readable error) when no progressive format exists.
  // --no-check-formats avoids the "Requested format is not available" failure
  // when yt-dlp's format verification is blocked (common for -g).
  // -4 forces IPv4: playback URLs are signed with the client IP YouTube saw,
  // and our media-server proxy connects reliably over IPv4 — a v6-signed URL
  // 403s whenever the ISP's IPv6 route is flaky.
  // player_client=ios_safari,tv_embedded: as of 2026-08 YouTube's SABR
  // experiment strips the URLs of audio-only DASH formats (itag 140/251) for
  // the android/web clients, leaving only the combined 360p itag 18 (~50 MB
  // per song). ios_safari (visionOS) and tv_embedded still return plain CDN
  // audio-only URLs (itag 251 opus ≈ 2.7 MB) and resolve ~2× faster.
  // `fallback` (android,web) is used as a second attempt when both primary
  // clients fail (age-restricted videos etc.) — it degrades to itag 18, but
  // keeps playback working where the primary clients can't extract at all.
  const client = options.fallback ? 'android,web' : 'ios_safari,tv_embedded';
  return [
    url,
    '--no-playlist',
    '-f',
    'ba[protocol^=https]/bestaudio[protocol^=https]/b[protocol^=https]/w[protocol^=https]/ba/bestaudio/b/w',
    '-g',
    '-4',
    '--extractor-args',
    `youtube:player_client=${client}`,
    '--no-warnings',
    '--no-check-formats',
    ...proxyArgs
  ];
}

export interface StreamGetOutput {
  ok: boolean;
  url?: string;
  code?: 'hls' | 'invalid';
}

// Parses the single-line stdout of `yt-dlp -g` into a validated stream URL.
// Rejects empty output, non-http(s) values and HLS playlists (Chromium
// <audio> cannot play .m3u8 without hls.js).
export function parseStreamGetOutput(stdout: string): StreamGetOutput {
  const firstLine = stdout.trim().split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!firstLine || !/^https?:\/\//i.test(firstLine)) {
    return { ok: false, code: 'invalid' };
  }
  if (firstLine.toLowerCase().includes('.m3u8')) {
    return { ok: false, code: 'hls' };
  }
  return { ok: true, url: firstLine };
}

interface YtCookieLike {
  name: string;
  value: string;
  domain?: string;
  hostOnly?: boolean;
  path?: string;
  secure?: boolean;
  expirationDate?: number;
}

// Serializes cookies to the Netscape/Mozilla cookie file format yt-dlp accepts.
function sanitizeField(value: string): string {
  return value.replace(/[\t\r\n]/g, '');
}

export function serializeCookies(cookies: YtCookieLike[], eol = '\n'): string {
  const lines: string[] = ['# Netscape HTTP Cookie File'];
  for (const c of cookies) {
    const rawDomain = c.domain || '';
    const includeSubdomains = c.hostOnly ? 'FALSE' : 'TRUE';
    const domain =
      !c.hostOnly && rawDomain && !rawDomain.startsWith('.') ? '.' + rawDomain : rawDomain;
    const path = c.path || '/';
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expiry =
      c.expirationDate && c.expirationDate > 0 ? String(Math.floor(c.expirationDate)) : '0';
    lines.push(
      [
        domain,
        includeSubdomains,
        path,
        secure,
        expiry,
        sanitizeField(c.name),
        sanitizeField(c.value ?? '')
      ].join('\t')
    );
  }
  return lines.join(eol);
}

// Minimal structural check for a Netscape cookie file (>= 1 data line with 7
// tab-separated columns). The HTTP 400 on Windows is avoided by re-writing the
// imported file with the OS-native EOL.
export function isValidCookieFile(content: string): boolean {
  const lines = content.split(/\r?\n/);
  let dataLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.split('\t').length < 7) return false;
    dataLines++;
  }
  return dataLines > 0;
}

interface NetscapeParsedCookie {
  name: string;
  value: string;
  url: string;
  domain?: string;
  path: string;
  secure: boolean;
  expirationDate?: number;
}

// The inverse of serializeCookies: parses a Netscape cookie file back into
// cookie-set params. Used to re-seed the in-app session partition from the
// persisted file when the Chromium cookie store loses the live session.
export function parseNetscapeCookies(content: string): NetscapeParsedCookie[] {
  const out: NetscapeParsedCookie[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [rawDomain, includeSubdomains, rawPath, secureFlag, rawExpiry, rawName, ...valueParts] =
      parts;
    const name = rawName.trim();
    const value = valueParts.join('\t');
    const domain = (rawDomain || '').replace(/^\./, '').toLowerCase();
    if (!name || !value || !domain) continue;
    const path = rawPath || '/';
    const secure = secureFlag === 'TRUE';
    const expiry = parseInt(rawExpiry, 10);
    const hostOnly = includeSubdomains !== 'TRUE';
    const cookie: NetscapeParsedCookie = {
      name,
      value,
      url: `${secure ? 'https' : 'http'}://${domain}${path}`,
      path,
      secure,
      ...(expiry > 0 ? { expirationDate: expiry } : {}),
      // Host-only cookies must NOT carry a domain option (Chromium would
      // otherwise treat them as super-domain cookies).
      ...(hostOnly ? {} : { domain })
    };
    out.push(cookie);
  }
  return out;
}

export {
  detectYtKind,
  normalizeYtUrl,
  extractYtVideoId,
  parseBatchInput
} from '../../shared/youtube';

// Normalizes a flat yt-dlp entry (playlist/channel row or full video info)
// into the shape the renderer consumes for the resolve preview.
// Wyciąga pierwszy URL awatara kanału z HTML-a strony kanału (ytInitialData).
// yt-dlp z `--flat-playlist` bywa, że nie zwróci żadnej miniatury w headerze
// kanału — wtedy używamy tej samej strony, którą i tak parsuje yt-dlp.
// Pobiera stronę kanału i wyciąga awatar jako ostatnią deskę ratunku.
// Zwraca '' przy jakimkolwiek błędzie — awatar to tylko ozdoba, nie blokujemy.
export async function resolveChannelAvatar(channelId: string): Promise<string> {
  if (!channelId) return '';
  try {
    const html = await fetchPageText(
      `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`,
      {}
    );
    const url = extractAvatarUrl(html);
    return url;
  } catch {
    return '';
  }
}

// Maps a playlist/channel container entry to the renderer preview result.
export function mapResolvedContainer(entry: YtDlpEntry): YouTubeResolvedItem[] {
  const items = (entry.entries || [])
    .filter((e) => e.id && e.title)
    .map((e) => mapResolvedEntry(e));
  const fallbackChannelId = entry.channel_id || entry.uploader_id || '';
  const fallbackChannelTitle = entry.channel || entry.uploader || '';
  return items.map((item) => ({
    ...item,
    channelId: item.channelId || fallbackChannelId,
    channelTitle: item.channelTitle || fallbackChannelTitle
  }));
}
