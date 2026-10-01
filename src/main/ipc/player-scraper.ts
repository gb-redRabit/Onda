import { privateNetworkAllowedForTarget, resolveNetworkTarget } from './network-target';
import { httpRequest } from './http-request';

interface PlayerScrapeResult {
  url: string;
  kind: 'hls' | 'direct';
  /** Strona embed — wymagana jako Referer przy pobieraniu HLS przez yt-dlp. */
  referer: string;
}

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

/** Wyciąga bezpośrednie URL-e mediów (m3u8/mp4) z HTML/JS strony playera. */
export function extractMediaUrls(html: string): { hls: string[]; direct: string[] } {
  const decoded = html.replace(/\\\//g, '/').replace(/\\u002F/g, '/');
  const hls: string[] = [];
  const direct: string[] = [];
  const hlsRe =
    /(?:file|src|url|href|link)\s*[:=]\s*["'](https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)|(https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)/gi;
  for (const m of decoded.matchAll(hlsRe)) {
    const u = (m[1] || m[2] || '').trim();
    if (u && !hls.includes(u)) hls.push(u);
  }
  const directRe =
    /(?:file|src|url)\s*[:=]\s*["'](https?:\/\/[^"'\s\\<>]+\.(?:mp4|webm|mov|m4v)[^"'\s\\<>]*)|(https?:\/\/[^"'\s\\<>]+\.(?:mp4|webm|mov|m4v)[^"'\s\\<>]*)/gi;
  for (const m of decoded.matchAll(directRe)) {
    const u = (m[1] || m[2] || '').trim();
    if (u && !direct.includes(u) && !u.includes('.m3u8')) direct.push(u);
  }
  return { hls, direct };
}

export async function fetchPageText(
  url: string,
  headers: Record<string, string>,
  redirectsLeft = MAX_REDIRECTS,
  allowPrivateNetwork = false,
  trustedOrigin?: string
): Promise<string> {
  const res = await httpRequest(url, {
    method: 'GET',
    headers,
    defaultHeaders: (u) => ({
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: u
    }),
    allowPrivateNetwork,
    trustedOrigin,
    maxRedirects: redirectsLeft,
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES
  });
  return res.text;
}

/**
 * Próbuje wyciągnąć bezpośredni URL wideo (m3u8 > mp4) ze strony playera/embed.
 * Fallback dla serwisów, których yt-dlp nie zna albo zna pod inną domeną.
 */
export async function scrapePlayerUrl(
  embedUrl: string,
  headers: Record<string, string>,
  allowPrivateNetwork = false
): Promise<PlayerScrapeResult | null> {
  if (!/^https:\/\//i.test(embedUrl)) return null;
  try {
    const html = await fetchPageText(embedUrl, headers, MAX_REDIRECTS, allowPrivateNetwork);
    const { hls, direct } = extractMediaUrls(html);
    if (hls.length) {
      await validateExtractedUrl(hls[0]!, embedUrl, allowPrivateNetwork);
      return { url: hls[0]!, kind: 'hls', referer: embedUrl };
    }
    if (direct.length) {
      await validateExtractedUrl(direct[0]!, embedUrl, allowPrivateNetwork);
      return { url: direct[0]!, kind: 'direct', referer: embedUrl };
    }
    return null;
  } catch {
    return null;
  }
}

async function validateExtractedUrl(
  url: string,
  embedUrl: string,
  allowPrivateNetwork: boolean
): Promise<void> {
  const allowPrivate = privateNetworkAllowedForTarget(
    url,
    new URL(embedUrl).origin,
    allowPrivateNetwork
  );
  await resolveNetworkTarget(url, { allowPrivateNetwork: allowPrivate });
}
