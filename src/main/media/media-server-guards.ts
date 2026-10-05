import crypto from 'crypto';
import { sep } from 'path';
import { isAllowedRadioHost } from '../ipc/radio-store';

// Czyste helpery bezpieczeństwa/strumienia wyodrębnione z `media-server.ts` (plan 2.8).
// `media-server` re-eksportuje `isAllowedStreamHost` i `validateStreamUrl`, aby
// importerzy i testy pozostały bez zmian.

export function isWithinRoot(filePath: string, root: string): boolean {
  if (process.platform === 'win32') {
    const f = filePath.toLowerCase();
    const r = root.toLowerCase();
    if (f === r) return true;
    return f.startsWith(r) && (f.charAt(r.length) === '\\' || f.charAt(r.length) === '/');
  }
  if (filePath === root) return true;
  return (
    filePath.startsWith(root) &&
    (filePath.charAt(root.length) === sep || filePath.charAt(root.length) === '/')
  );
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Wspólny guard z `utils/origin-guard` (te same reguły co protokół `onda://`).
export { allowedAppOrigin as allowedOrigin } from '../utils/origin-guard';

// Proxy zdalnych strumieni (odtwarzanie online). Dozwolone są tylko hosty mediów
// YouTube/SoundCloud oraz hosty stacji radiowych dodanych przez użytkownika, aby
// endpoint nie mógł być nadużyty jako otwarty proxy SSRF; renderer może do niego
// dotrzeć wyłącznie z URL-ami wyprodukowanymi przez `yt:stream:get` / `sc:stream:get`
// lub stacjami zapisanymi przez `radio:save`.
export const STREAM_ALLOWED_HOSTS = [
  'googlevideo.com',
  'ytimg.com',
  'youtube.com',
  'youtu.be',
  // CDN progresywnego MP3 SoundCloud + hosty stron (tam przekierowują krótkie linki).
  'sndcdn.com',
  'soundcloud.com',
  'snd.sc'
];
export const STREAM_MAX_REDIRECTS = 3;
// 403 z googlevideo są zwykle przejściowe (throttling per-IP, niestabilny routing
// brzegowy), więc daj każdemu strumieniowi do 4 prób z krótkim backoffem. Ostatnia
// zwłoka jest dłuższa: okna throttlingu na współdzielonym IP CGNAT mogą przetrwać
// pierwsze dwie, a 4. próba zwykle trafia w świeże okno.
export const STREAM_MAX_ATTEMPTS = 4;
// Zwłoka przed próbą ponowienia N (indeks 0 = przed próbą 2, itd.).
export const STREAM_RETRY_DELAYS = [400, 1200, 3000];
export const STREAM_TIMEOUT_MS = 30000;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function isAllowedStreamHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    STREAM_ALLOWED_HOSTS.some((suffix) => h === suffix || h.endsWith('.' + suffix)) ||
    isAllowedRadioHost(h)
  );
}

// Waliduje cel strumienia dla proxy /stream: https na dozwolonym hoście mediów
// YouTube lub http(s) na hoście stacji radiowej dodanej przez użytkownika
// (strumienie Icecast/SHOUTcast są często zwykłym http). Zwraca null, gdy
// odrzucono.
export function validateStreamUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const isHttps = parsed.protocol === 'https:';
  const isHttp = parsed.protocol === 'http:';
  const isYtHost = STREAM_ALLOWED_HOSTS.some((suffix) => {
    const h = parsed.hostname.toLowerCase();
    return h === suffix || h.endsWith('.' + suffix);
  });
  if (!isHttps && !(isHttp && isAllowedRadioHost(parsed.hostname))) {
    return null;
  }
  if (!isYtHost && !isAllowedRadioHost(parsed.hostname)) {
    return null;
  }
  return parsed;
}

// UA przypominający przeglądarkę: niektóre endpointy googlevideo odrzucają żądania,
// których User-Agent nie wygląda jak przeglądarka.
export const STREAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
