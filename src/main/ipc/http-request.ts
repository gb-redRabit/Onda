import http from 'http';
import https from 'https';
import {
  createPinnedLookup,
  privateNetworkAllowedForTarget,
  resolveNetworkTarget
} from './network-target';

// Wspólny transport HTTP dla procesu main. Scala niemal identyczne
// szkielety żądań, które każde źródło mediów / scraper wcześniej tworzyły ręcznie: rozwiązuje
// cel (przypięty DNS, chroniony przed SSRF), podąża za przekierowaniami, usuwając
// nagłówki WYWOŁUJĄCEGO przy przejściu cross-origin (domyślne ustawienia protokołu są nakładane ponownie), oraz
// odrzuca odtworzenie body dla żądania innego niż GET cross-origin. Rozmiar body i timeout są ograniczone.

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Nagłówki wywołującego (np. poświadczenia): zachowywane przy przekierowaniach same-origin, usuwane przy cross-origin. */
  headers?: Record<string, string>;
  /** Domyślne ustawienia protokołu nakładane na każdym kroku (mogą zależeć od URL kroku, np. Referer). */
  defaultHeaders?: Record<string, string> | ((url: string) => Record<string, string>);
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Zezwala na niepubliczne adresy dla celu zatwierdzonego przez użytkownika. */
  allowPrivateNetwork?: boolean;
  /** Origin używany do decyzji o sieci prywatnej; domyślnie origin żądania. */
  trustedOrigin?: string;
  /** Zwraca false, aby odrzucić przekierowanie (np. allowlist pluginów). */
  onRedirect?: (next: string) => boolean;
}

export interface HttpRequestResult {
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  text: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

function defaultsFor(
  defaults: HttpRequestOptions['defaultHeaders'],
  url: string
): Record<string, string> {
  if (typeof defaults === 'function') return defaults(url);
  return defaults ?? {};
}

export function httpRequest(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpRequestResult> {
  return request(
    url,
    options.headers ?? {},
    options,
    options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    options.trustedOrigin
  );
}

function request(
  url: string,
  callerHeaders: Record<string, string>,
  options: HttpRequestOptions,
  redirectsLeft: number,
  trustedOrigin: string | undefined
): Promise<HttpRequestResult> {
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const origin = trustedOrigin ?? new URL(url).origin;
  const allowPrivate = privateNetworkAllowedForTarget(
    url,
    origin,
    options.allowPrivateNetwork === true
  );

  return resolveNetworkTarget(url, { allowPrivateNetwork: allowPrivate }).then(
    (target) =>
      new Promise<HttpRequestResult>((resolve, reject) => {
        const transport = target.url.protocol === 'https:' ? https : http;
        const req = transport.request(
          target.url,
          {
            method,
            headers: { ...defaultsFor(options.defaultHeaders, url), ...callerHeaders },
            lookup: createPinnedLookup(target.addresses)
          },
          (res) => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
              res.resume();
              if (redirectsLeft <= 0) {
                reject(new Error('Too many redirects'));
                return;
              }
              const next = new URL(res.headers.location, target.url).toString();
              if (options.onRedirect && !options.onRedirect(next)) {
                reject(new Error('Redirect not allowed'));
                return;
              }
              const sameOrigin = new URL(next).origin === target.url.origin;
              if (!sameOrigin && method !== 'GET') {
                reject(new Error('Cross-origin redirect refused'));
                return;
              }
              // Usuwamy nagłówki wywołującego przy przejściu cross-origin; domyślne
              // ustawienia protokołu nakłada rekurencyjne żądanie.
              const nextHeaders = sameOrigin ? callerHeaders : {};
              request(next, nextHeaders, options, redirectsLeft - 1, origin).then(resolve, reject);
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
              if (size > maxBytes) {
                req.destroy();
                reject(new Error('Response too large'));
                return;
              }
              chunks.push(c);
            });
            res.on('end', () =>
              resolve({
                status,
                statusText: res.statusMessage || '',
                headers: res.headers,
                text: Buffer.concat(chunks).toString('utf-8')
              })
            );
            res.on('error', reject);
          }
        );
        req.setTimeout(timeoutMs, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
      })
  );
}
