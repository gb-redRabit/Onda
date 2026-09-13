import type { IpcStreamResult } from '@shared/types/ipc';
import { toMediaStreamUrl } from '@renderer/utils/mediaUrl';
import { streamTargetFor, streamChannelFor } from '@renderer/utils/onlineHelpers';

// High enough to cover a grid row + one click ahead; low enough to not hammer
// YouTube with parallel yt-dlp spawns (they amplify transient 403 windows).
const PREFETCH_MAX_IN_FLIGHT = 5;

export interface StreamPrefetcher {
  prefetch(video: { id: string; url?: string }): Promise<void>;
}

// Resolves a stream URL ahead of the click (card visibility) so playback starts
// instantly: the main process LRU cache then serves the click without waiting on
// the resolver. Best-effort — real errors surface through playStream.
export function createStreamPrefetcher(): StreamPrefetcher {
  const prefetched = new Set<string>();
  let inFlight = 0;

  async function prefetch(video: { id: string; url?: string }): Promise<void> {
    if (prefetched.has(video.id) || inFlight >= PREFETCH_MAX_IN_FLIGHT) return;
    if (prefetched.size > 1000) prefetched.clear();
    prefetched.add(video.id);
    inFlight++;
    const url = streamTargetFor(video);
    try {
      const res = (await window.api?.invoke(streamChannelFor(url), url)) as
        IpcStreamResult | undefined;
      if (res?.success && res.url) {
        // Warm the CDN connection right away through the media-server proxy (it
        // retries transient 403s with backoff). By the time the user clicks, the
        // URL has already passed its rate-limit window, so the click loads in a
        // single attempt instead of paying 403s + retry delays.
        try {
          await fetch(toMediaStreamUrl(res.url), { headers: { Range: 'bytes=0-1' } });
        } catch {
          // best-effort probe — playback does not depend on it
        }
      }
    } catch {
      // ignore: prefetch is best-effort
    } finally {
      inFlight--;
    }
  }

  return { prefetch };
}
