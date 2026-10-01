import { existsSync } from 'fs';
import { win32 as winPath, posix as posixPath } from 'path';
import { fetchPageText } from '../player-scraper';
import type { YoutubeAuthMethod } from '../../../shared/types/settings';
import type { YouTubeResolvedItem } from '../../../shared/types/online';
import { extractAvatarUrl, mapResolvedEntry, type YtDlpEntry } from './youtube-mappers';
export {
  formatDuration,
  formatUploadDate,
  isStableAvatarUrl,
  isSafeThumbnailUrl,
  pickThumbnail,
  mapExternalResolvedEntry,
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
  // True, gdy cookiesPath wskazuje tymczasowy plik, który musi zostać usunięty przez
  // wywołującego po zakończeniu procesu yt-dlp (patrz cleanupYtAuthTemp).
  temp?: boolean;
}

// Znajduje plik wykonywalny Node.js, którego yt-dlp może użyć do rozwiązania JavaScriptowych
// wyzwań YouTube (signature / n-challenge). Bez niego yt-dlp raportuje "JS runtimes:
// none", a ekstrakcja odtwarzania kończy się błędem "The page needs to be reloaded".
export function detectJsRuntime(
  env: NodeJS.ProcessEnv,
  probe: (path: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform
): string | null {
  // npm ustawia to na binarkę node uruchamiającą skrypty npm (przepływ dev).
  if (env.npm_node_execpath && probe(env.npm_node_execpath)) {
    return env.npm_node_execpath;
  }
  const separator = platform === 'win32' ? ';' : ':';
  const exe = platform === 'win32' ? 'node.exe' : 'node';
  // Buduj ścieżki-kandydatów gramatyką danej platformy. Testy IPC działają na
  // każdej platformie CI, więc wyszukiwanie win32 musi dawać separatory win32 nawet
  // gdy host jest posix (i odwrotnie); sam join() hosta mieszałby
  // separatory (C:\foo + /bar) i nigdy nie dopasował prawdziwego pliku wykonywalnego.
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

// Cache'owany wrapper wokół detectJsRuntime dla wywołań produkcyjnych. Zwraca null, gdy
// nie istnieje żaden runtime — yt-dlp spada wtedy do własnego wykrywania.
function resolveJsRuntime(): string | null {
  if (cachedRuntime === undefined) {
    cachedRuntime = detectJsRuntime(process.env, existsSync, process.platform);
  }
  return cachedRuntime;
}

// Wstrzykuje flagi uwierzytelniania (cookies sesji) do komendy yt-dlp.
// Działa zarówno dla sesji Google w aplikacji ("electron"), importowanego pliku
// cookies ("manual") i przeglądarki systemowej ("browser"). Przekazuje też jawny JS
// runtime do yt-dlp, aby rozwiązywanie signature/n-challenge nigdy nie zawiodło po cichu.
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
  // Gdy wywołujący zakończył już listę opcji przez '--', wszystkie wstrzyknięte
  // flagi muszą trafić *przed* tym separatorem; inaczej yt-dlp potraktuje je jako
  // pozycyjne URL-e.
  const sepIndex = args.indexOf('--');
  if (sepIndex >= 0) {
    args.splice(sepIndex, 0, ...extras);
  } else {
    args.push(...extras);
  }
  return args;
}

// Buduje bazową (przed auth) listę argumentów do rozwiązania bezpośredniego URL
// strumienia audio przez `yt-dlp -g`. Flagi auth są wstrzykiwane później przez buildYtArgs
// w momencie spawn, więc to pozostaje czystą funkcją i jest testowalne jednostkowo.
export function buildStreamGetArgs(
  url: string,
  proxyArgs: string[] = [],
  options: { fallback?: boolean; generic?: boolean } = {}
): string[] {
  // Preferuj formaty progresywne (https), które <audio> odtworzy bezpośrednio:
  // strumienie DASH (http_dash_segments) i HLS (m3u8) wymagają MSE/hls.js. Końcowy
  // fallback ba/bestaudio/b/w zachowuje wynik (możliwie HLS, raportowany
  // jako czytelny błąd), gdy nie istnieje format progresywny.
  // --no-check-formats unika błędu "Requested format is not available",
  // gdy weryfikacja formatów yt-dlp jest zablokowana (częste dla -g).
  // -4 wymusza IPv4: URL-e odtwarzania są podpisane adresem IP klienta, który widział YouTube,
  // a nasze proxy serwera mediów łączy się niezawodnie przez IPv4 — URL podpisany v6
  // daje 403, gdy trasa IPv6 ISP jest niestabilna.
  // player_client=ios_safari,tv_embedded: od 2026-08 eksperyment SABR YouTube'a
  // usuwa URL-e formatów DASH tylko-audio (itag 140/251) dla
  // klientów android/web, zostawiając tylko połączony 360p itag 18 (~50 MB
  // na utwór). ios_safari (visionOS) i tv_embedded nadal zwracają zwykłe CDN-owe
  // URL-e tylko-audio (itag 251 opus ≈ 2,7 MB) i rozwiązują ~2× szybciej.
  // `fallback` (android,web) jest używany jako druga próba, gdy oba główne
  // klienty zawiodą (filmy z ograniczeniem wiekowym itp.) — degraduje do itag 18, ale
  // utrzymuje odtwarzanie tam, gdzie główne klienty nie potrafią wyodrębnić wcale.
  const client = options.fallback ? 'android,web' : 'ios_safari,tv_embedded';
  const platformArgs = options.generic
    ? []
    : ['-4', '--extractor-args', `youtube:player_client=${client}`];
  return [
    url,
    '--no-playlist',
    '-f',
    'ba[protocol^=https]/bestaudio[protocol^=https]/b[protocol^=https]/w[protocol^=https]/ba/bestaudio/b/w',
    '-g',
    ...platformArgs,
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

// Parsuje jednoliniowe stdout `yt-dlp -g` do zwalidowanego URL strumienia.
// Odrzuca puste wyjście, wartości inne niż http(s) i playlisty HLS (Chromium
// <audio> nie odtworzy .m3u8 bez hls.js).
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

// Serializuje cookies do formatu pliku cookie Netscape/Mozilla akceptowanego przez yt-dlp.
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

// Minimalne sprawdzenie strukturalne pliku cookie Netscape (>= 1 linia danych z 7
// kolumnami rozdzielonymi tabulatorem). HTTP 400 w Windows jest unikane przez przepisanie
// importowanego pliku z natywnym dla OS EOL.
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

// Odwrotność serializeCookies: parsuje plik cookie Netscape z powrotem do
// parametrów cookie-set. Używane do ponownego zasilenia partycji sesji w aplikacji z
// zapisanego pliku, gdy store cookie Chromium zgubi żywą sesję.
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
      // Cookie host-only NIE mogą nieść opcji domain (Chromium
      // potraktowałby je inaczej jako cookie super-domenowe).
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
} from '../../../shared/youtube';

// Normalizuje płaski wpis yt-dlp (wiersz playlisty/kanału lub pełne info o wideo)
// do kształtu, który renderer konsumuje dla podglądu resolve.
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

// Mapuje wpis kontenera playlisty/kanału na wynik podglądu renderera.
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
