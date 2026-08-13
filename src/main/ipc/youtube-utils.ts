export interface YtDlpEntry {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  view_count?: number;
  channel?: string;
  channel_id?: string;
  uploader?: string;
  uploader_id?: string;
  upload_date?: string;
  availability?: string;
  is_playable?: boolean;
  playlist?: string;
  playlist_id?: string;
  playlist_title?: string;
  channel_follower_count?: number;
  playlist_count?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
  entries?: YtDlpEntry[];
}

import { existsSync } from 'fs';
import { join } from 'path';
import { formatDuration as formatDurationBase } from '../../shared/formatDuration';
import type { YoutubeAuthMethod } from '../../renderer/src/types/settings';
import type { IpcYoutubeVideo } from '../../shared/types/ipc';
import type { YouTubeResolvedItem } from '../../renderer/src/types/youtube';

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
  for (const dir of (env.PATH || '').split(separator)) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    if (probe(candidate)) return candidate;
  }
  if (platform === 'win32') {
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const localAppData = env.LOCALAPPDATA;
    const systemRoot = env.SystemRoot || 'C:\\Windows';
    const fallbacks = [
      join(programFiles, 'nodejs', 'node.exe'),
      ...(localAppData ? [join(localAppData, 'Programs', 'nodejs', 'node.exe')] : []),
      join(systemRoot, 'System32', 'node.exe')
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
export function resolveJsRuntime(): string | null {
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
  if (auth && auth.method !== 'none') {
    if (auth.method === 'browser' && auth.cookiesBrowser) {
      args.push('--cookies-from-browser', auth.cookiesBrowser);
    } else if ((auth.method === 'electron' || auth.method === 'manual') && auth.cookiesPath) {
      args.push('--cookies', auth.cookiesPath);
    }
  }
  if (jsRuntime && !args.includes('--js-runtimes')) {
    args.push('--js-runtimes', `node:${jsRuntime}`);
  }
  return args;
}

export interface YtCookieLike {
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

export interface NetscapeParsedCookie {
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

export { detectYtKind, normalizeYtUrl, extractYtVideoId, parseBatchInput } from '../../shared/youtube';

export function formatDuration(seconds?: number): string | undefined {
  const formatted = formatDurationBase(seconds, '');
  return formatted === '' ? undefined : formatted;
}

export function formatUploadDate(date: string | undefined): string {
  if (!date || !/^\d{8}$/.test(date)) return '';
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

// yt-dlp returns thumbnail URLs from network data — never feed them to <img>
// without validation. Allow only https and reject loopback/localhost (SSRF to
// local services) including IPv6 loopback.
function isSafeThumbnailUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  if (host.endsWith('.localhost')) return false;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  return true;
}

export function pickThumbnail(entry: YtDlpEntry): string {
  const thumbs = (entry.thumbnails || []).filter((t) => t.url && isSafeThumbnailUrl(t.url));
  if (thumbs.length) {
    const best = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best?.url) return best.url;
  }
  const fallback = entry.id ? `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg` : '';
  return isSafeThumbnailUrl(fallback) ? fallback : '';
}

// Normalizes a flat yt-dlp entry (playlist/channel row or full video info)
// into the shape the renderer consumes for the resolve preview.
export function mapResolvedEntry(entry: YtDlpEntry): YouTubeResolvedItem {
  return {
    id: entry.id || '',
    title: entry.title || '',
    duration: formatDuration(entry.duration),
    thumbnail: pickThumbnail(entry),
    channelTitle: entry.channel || entry.uploader || '',
    channelId: entry.channel_id || '',
    isPlayable: entry.is_playable !== false
  };
}

// Normalizes a yt-dlp entry into the video shape used by search and the
// channel video list.
export function mapVideoEntry(entry: YtDlpEntry): IpcYoutubeVideo {
  return {
    id: entry.id || '',
    title: entry.title || '',
    description: entry.description || '',
    thumbnail: pickThumbnail(entry),
    channelTitle: entry.channel || entry.uploader || '',
    channelId: entry.channel_id || '',
    duration: formatDuration(entry.duration),
    viewCount: entry.view_count != null ? String(entry.view_count) : undefined,
    publishedAt: formatUploadDate(entry.upload_date)
  };
}

// Picks the channel avatar thumbnail. Unlike a video, a channel page mixes
// wide banner images with square avatar crops in the same `thumbnails` list,
// so always prefer squares (width === height) and take the largest of those.
// Falls back to the widest safe thumbnail, then to the single `thumbnail`
// string some yt-dlp versions emit. There is no i.ytimg.com fallback — a
// channel ID is not a video ID.
export function pickChannelThumbnail(entry: YtDlpEntry): string {
  const thumbs = (entry.thumbnails || []).filter((t) => t.url && isSafeThumbnailUrl(t.url));
  if (thumbs.length) {
    const avatars = thumbs.filter((t) => t.width && t.height && t.width === t.height);
    const pool = avatars.length ? avatars : thumbs;
    const best = [...pool].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best?.url) return best.url;
  }
  if (entry.thumbnail && isSafeThumbnailUrl(entry.thumbnail)) return entry.thumbnail;
  return '';
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
