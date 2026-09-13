import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { urlAllowed, resolveRedirectUrl } from './plugins-guards';
import {
  MAX_FETCH_BYTES,
  MAX_FETCH_TEXT_BYTES,
  MAX_FETCH_REDIRECTS,
  DEFAULT_FETCH_TIMEOUT_MS,
  MAX_FETCH_TIMEOUT_MS
} from './plugins-core';
import type { PluginFetchOptions, PluginFetchResult } from '../../shared/types/ipc';

// Plugin network fetch (extracted from `plugins-handlers.ts`, plan 2.8). The
// permission lookup stays in the handler: callers pass the plugin's resolved
// network allowlist so this module is pure orchestration + HTTP transport.

function fetchRequest(
  url: string,
  opts: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
  },
  onRedirect: (next: string) => boolean,
  redirectsLeft = MAX_FETCH_REDIRECTS
): Promise<{ status: number; statusText: string; headers: Record<string, string>; text: string }> {
  return new Promise((resolvePromise, reject) => {
    const transport = url.startsWith('https:') ? httpsRequest : httpRequest;
    const req = transport(
      url,
      {
        method: opts.method,
        headers: { 'User-Agent': 'Onda-plugin/1.0', ...opts.headers }
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject({ code: 'redirect-loop', message: 'Too many redirects' });
            return;
          }
          const next = resolveRedirectUrl(url, res.headers.location);
          if (!next || !onRedirect(next)) {
            reject({ code: 'redirect-loop', message: 'Redirect not allowed' });
            return;
          }
          fetchRequest(next, opts, onRedirect, redirectsLeft - 1).then(resolvePromise, reject);
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_FETCH_BYTES) {
            req.destroy();
            reject({ code: 'too-large', message: 'Response too large' });
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolvePromise({
            status,
            statusText: res.statusMessage || '',
            headers: res.headers as Record<string, string>,
            text: Buffer.concat(chunks).toString('utf-8')
          });
        });
        res.on('error', (e) => reject({ code: 'network', message: e.message }));
      }
    );
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy();
      reject({ code: 'timeout', message: 'Timeout' });
    });
    req.on('error', (e) => reject({ code: 'network', message: e.message }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export async function runPluginFetch(
  allow: string[],
  url: string,
  options: PluginFetchOptions
): Promise<PluginFetchResult> {
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return { success: false, error: 'Invalid method', code: 'invalid-url' };
  }
  if (!urlAllowed(url, allow)) {
    return { success: false, error: 'URL not permitted by plugin allowlist', code: 'forbidden' };
  }
  const requestedTimeout =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_FETCH_TIMEOUT_MS;
  const timeoutMs = Math.min(requestedTimeout, MAX_FETCH_TIMEOUT_MS);
  try {
    const result = await fetchRequest(
      url,
      {
        method,
        headers: options.headers || {},
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        timeoutMs
      },
      (next) => urlAllowed(next, allow)
    );
    if (result.text.length > MAX_FETCH_TEXT_BYTES) {
      return { success: false, error: 'Response too large', code: 'too-large' };
    }
    let data: unknown = result.text;
    if (options.responseType === 'json') {
      try {
        data = result.text ? JSON.parse(result.text) : null;
      } catch {
        return { success: false, error: 'Invalid JSON response', code: 'unknown' };
      }
    }
    return {
      success: true,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      data
    };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return {
      success: false,
      error: err.message || String(e),
      code: (err.code as PluginFetchResult['code']) || 'unknown'
    };
  }
}
