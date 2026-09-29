import { classifyYtDlpError, redactSecrets } from '../downloads/error-classifier';
import { logger } from '../../shared/logger';
import { cacheStream, getCachedStream } from './youtube-stream-cache';
import type { IpcStreamResult } from '../../shared/types/ipc';
import { buildStreamGetArgs, parseStreamGetOutput, detectYtKind } from './youtube-utils';
import { readNetworkArgs } from './proxy-utils';
import { runYtDlp } from './youtube-fetch';
import { isHttpUrl } from '../../shared/platform';
import { resolveNetworkTarget } from './network-target';
import { registerGenericStreamUrl } from '../media-server-stream-registry';

// Resolves a direct audio stream URL for a video via `yt-dlp -g`. Results are
// cached (LRU, 5h TTL — googlevideo URLs stay valid ~6h) because repeated -g
// calls are slow (~3-10s) and can trigger rate-limits. The cache is persisted
// to userData so repeat plays stay instant across app restarts.
// In-flight dedupe: a hover-prefetch and the subsequent click must not spawn
// two yt-dlp processes for the same URL — the second caller awaits the first.
// Split out of `youtube-handlers.ts` (plan 2.8).
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
  // Primary attempt uses ios_safari/tv_embedded (audio-only 251, ~3 s resolve).
  // When both fail (e.g. age-restricted videos), retry once with the android,web
  // client pair — it degrades to the combined itag 18, but keeps playback alive.
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
