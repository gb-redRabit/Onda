import { httpRequest } from '../http-request';
import { urlAllowed } from './plugins-guards';
import {
  MAX_FETCH_BYTES,
  MAX_FETCH_TEXT_BYTES,
  MAX_FETCH_REDIRECTS,
  DEFAULT_FETCH_TIMEOUT_MS,
  MAX_FETCH_TIMEOUT_MS
} from './plugins-core';
import type { PluginFetchOptions, PluginFetchResult } from '../../../shared/types/ipc';

// Pobieranie sieciowe pluginów (wyodrębnione z `plugins-handlers.ts`, plan 2.8).
// Sprawdzanie uprawnień zostaje w handlerze: wywołujący przekazują rozwiązaną
// allowlistę sieciową pluginu. Transport HTTP jest współdzielony ze źródłami mediów;
// polityka przekierowań allowlisty i kody błędów pozostają specyficzne dla pluginów.

/** Mapuje komunikat błędu transportu na kod błędu pobierania pluginu. */
function classifyFetchError(message: string): PluginFetchResult['code'] {
  if (message === 'Timeout') return 'timeout';
  if (message === 'Response too large') return 'too-large';
  if (
    message === 'Too many redirects' ||
    message === 'Redirect not allowed' ||
    message === 'Cross-origin redirect refused'
  ) {
    return 'redirect-loop';
  }
  if (/private network/i.test(message)) return 'forbidden';
  return 'network';
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
    const result = await httpRequest(url, {
      method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      headers: options.headers || {},
      defaultHeaders: { 'User-Agent': 'Onda-plugin/1.0' },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      timeoutMs,
      maxBytes: MAX_FETCH_BYTES,
      maxRedirects: MAX_FETCH_REDIRECTS,
      onRedirect: (next) => urlAllowed(next, allow)
    });
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
      headers: result.headers as Record<string, string>,
      data
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message, code: classifyFetchError(message) };
  }
}
