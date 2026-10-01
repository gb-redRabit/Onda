import { classifyYtDlpError, redactSecrets } from '../../downloads/error-classifier';
import { logger } from '../../../shared/logger';
import { cacheStream, getCachedStream } from './youtube-stream-cache';
import type { IpcStreamResult } from '../../../shared/types/ipc';
import { buildStreamGetArgs, parseStreamGetOutput, detectYtKind } from './youtube-utils';
import { readNetworkArgs } from '../proxy-utils';
import { runYtDlp } from './youtube-fetch';
import { isHttpUrl } from '../../../shared/platform';
import { resolveNetworkTarget } from '../network-target';
import { registerGenericStreamUrl } from '../../media/media-server-stream-registry';

// Rozwiązuje bezpośredni URL strumienia audio dla wideo przez `yt-dlp -g`. Wyniki są
// cache'owane (LRU, TTL 5h — URL-e googlevideo pozostają ważne ~6h), bo powtarzane wywołania -g
// są wolne (~3-10 s) i mogą wyzwalać rate-limity. Cache jest utrwalany
// w userData, aby powtórne odtwarzania były natychmiastowe między restartami aplikacji.
// Dedupe w locie: prefetch przy hoverze i kolejne kliknięcie nie mogą uruchomić
// dwóch procesów yt-dlp dla tego samego URL — drugi wywołujący czeka na pierwszy.
// Wyodrębnione z `youtube-handlers.ts` (plan 2.8).
const streamPending = new Map<string, Promise<IpcStreamResult>>();

export function getStreamUrl(url: string): Promise<IpcStreamResult> {
  const kind = typeof url === 'string' ? detectYtKind(url) : null;
  if (
    typeof url !== 'string' ||
    !url.trim() ||
    url.length > 2048 ||
    (kind !== 'video' && !(kind === null && isHttpUrl(url)))
  ) {
    return Promise.resolve({
      success: false,
      error: 'Invalid YouTube video link',
      code: 'invalid'
    });
  }

  const cached = getCachedStream(url);
  if (cached) {
    if (detectYtKind(url) === null) {
      return registerGenericStreamUrl(cached.url)
        .then(() => ({ success: true, url: cached.url }))
        .catch((e: unknown) => ({
          success: false,
          error: e instanceof Error ? e.message : String(e),
          code: 'network' as const
        }));
    }
    return Promise.resolve({ success: true, url: cached.url });
  }

  const pending = streamPending.get(url);
  if (pending) return pending;

  const task = resolveStreamUrl(url).finally(() => {
    streamPending.delete(url);
  });
  streamPending.set(url, task);
  return task;
}

async function resolveStreamUrl(url: string): Promise<IpcStreamResult> {
  const t0 = Date.now();
  const generic = detectYtKind(url) === null;
  try {
    await resolveNetworkTarget(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg, code: 'invalid' };
  }
  const proxyArgs = await readNetworkArgs(generic ? 'generic' : 'youtube');
  // Główna próba używa ios_safari/tv_embedded (tylko audio 251, ~3 s rozwiązania).
  // Gdy obie zawiodą (np. filmy z ograniczeniem wiekowym), ponów raz z parą
  // klientów android,web — degraduje do połączonego itag 18, ale utrzymuje odtwarzanie.
  for (const fallback of [false, true]) {
    try {
      const stdout = await runYtDlp(
        buildStreamGetArgs(url, proxyArgs, { fallback, generic }),
        30000
      );
      const parsed = parseStreamGetOutput(stdout);
      logger.info(
        'yt',
        `stream resolve${fallback ? ' (fallback)' : ''} ms=${Date.now() - t0} url=${url}`
      );
      if (!parsed.ok || !parsed.url) {
        const code = parsed?.code === 'hls' ? 'hls' : 'invalid';
        if (!fallback) continue;
        return {
          success: false,
          error: code === 'hls' ? 'HLS streams are not supported yet' : 'Invalid stream URL',
          code
        };
      }
      if (generic) {
        try {
          await registerGenericStreamUrl(parsed.url);
        } catch (e: unknown) {
          const err = e as { message?: string };
          return {
            success: false,
            error: err.message || 'The extracted stream host is not publicly reachable',
            code: 'network'
          };
        }
      }
      cacheStream(url, parsed.url);
      return { success: true, url: parsed.url };
    } catch (e: unknown) {
      const err = e as { message?: string };
      const msg = err.message || String(e);
      if (!fallback) {
        logger.warn(
          'yt',
          `stream get failed ms=${Date.now() - t0}, retrying with fallback clients`,
          msg
        );
        continue;
      }
      logger.warn('yt', `stream get failed (fallback) ms=${Date.now() - t0}`, msg);
      return { success: false, error: redactSecrets(msg), code: classifyYtDlpError(msg) };
    }
  }
  return { success: false, error: 'Unknown stream error', code: 'network' };
}
