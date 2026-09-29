import https from 'https';
import http from 'http';
import {
  createPinnedLookup,
  privateNetworkAllowedForTarget,
  resolveNetworkTarget
} from './network-target';

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
  const origin = trustedOrigin ?? new URL(url).origin;
  const allowPrivate = privateNetworkAllowedForTarget(url, origin, allowPrivateNetwork);
  const target = await resolveNetworkTarget(url, { allowPrivateNetwork: allowPrivate });
  return new Promise((resolve, reject) => {
    const transport = target.url.protocol === 'https:' ? https : http;
    const req = transport.request(
      target.url,
      {
        method: 'GET',
        lookup: createPinnedLookup(target.addresses),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: url,
          ...headers
        }
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            res.resume();
            reject(new Error('Too many redirects'));
            return;
          }
          res.resume();
          const next = new URL(res.headers.location, target.url).toString();
          const nextHeaders = new URL(next).origin === target.url.origin ? headers : {};
          fetchPageText(next, nextHeaders, redirectsLeft - 1, allowPrivateNetwork, origin).then(
            resolve,
            reject
          );
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new Error('Response too large'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      }
    );
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.on('error', reject);
    req.end();
  });
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
