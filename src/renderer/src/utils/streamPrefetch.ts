import type { IpcStreamResult } from '@shared/types/ipc';
import { toMediaStreamUrl } from '@renderer/utils/mediaUrl';
import { streamTargetFor, streamChannelFor } from '@renderer/utils/onlineHelpers';

// Wystarczająco wysoko, by pokryć rząd siatki + jedno kliknięcie w przód; wystarczająco nisko,
// by nie zarzucać YouTube równoległymi spawnami yt-dlp (wzmacniają przejściowe okna 403).
const PREFETCH_MAX_IN_FLIGHT = 5;

export interface StreamPrefetcher {
  prefetch(video: { id: string; url?: string }): Promise<void>;
}

// Rozwiązuje URL strumienia przed kliknięciem (widoczność karty), by odtwarzanie startowało
// natychmiast: cache LRU procesu głównego obsługuje wtedy kliknięcie bez czekania na
// resolver. Best-effort — prawdziwe błędy ujawniają się przez playStream.
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
        // Rozgrzej połączenie CDN od razu przez proxy media servera (ponawia
        // przejściowe 403 z backoffem). Zanim użytkownik kliknie, URL
        // minął już swoje okno rate-limitu, więc kliknięcie ładuje się w
        // jednej próbie zamiast płacić 403 + opóźnienia ponowień.
        try {
          await fetch(toMediaStreamUrl(res.url), { headers: { Range: 'bytes=0-1' } });
        } catch {
          // sonda best-effort — odtwarzanie od niej nie zależy
        }
      }
    } catch {
      // ignoruj: prefetch jest best-effort
    } finally {
      inFlight--;
    }
  }

  return { prefetch };
}
