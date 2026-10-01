import { i18n } from '@renderer/i18n';
import { useUIStore } from '@renderer/stores/ui';
import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';
import type { YouTubeResolvedItem } from '@renderer/types/online';
import type { IpcStreamResult } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import {
  buildStreamTrack,
  streamChannelFor,
  streamErrorMessage,
  streamTargetFor
} from '@renderer/utils/onlineHelpers';

// Odtwarzanie strumieni: kolejkowanie pojedynczego zapisanego utworu i odtwarzanie każdego elementu
// playlisty/kanału. Używa bezpośrednio store player + UI; store
// destrukturyzuje zwrócone akcje z powrotem do tych samych nazw.
export function createOnlineStreams() {
  const t = i18n.global.t;

  // Kolejkuje pojedynczy zapisany utwór (dyspozycja po platformie przez zapisany URL strony).
  async function queueSavedTrack(video: {
    id: string;
    title: string;
    duration?: string;
    thumbnail?: string;
    url?: string;
  }) {
    const player = usePlayerStore();
    const url = streamTargetFor(video);
    const result = (await window.api?.invoke(streamChannelFor(url), url)) as
      IpcStreamResult | undefined;
    if (!result?.success || !result.url) {
      useUIStore().notify('error', video.title, streamErrorMessage(t, result?.code ?? 'network'));
      return;
    }
    const track = buildStreamTrack(video, result.url, player.queueLength);
    player.enrichTrack(track);
    player.addToQueueMultiple([track]);
    useUIStore().notify('success', t('saved.addedToQueue'));
  }

  async function playAllStreams(items: YouTubeResolvedItem[]) {
    if (items.length === 0) return;
    const player = usePlayerStore();
    logger.info('yt', `playAllStreams start items=${items.length} first=${items[0]!.id}`);
    // Pasek odtwarzacza pojawia się natychmiast z pierwszym elementem, gdy ten się rozwiązuje.
    player.streamPending = buildStreamTrack(items[0]!, `yt:${items[0]!.id}`, 0);
    player.enrichTrack(player.streamPending);
    // Rozwiązuj z małym limitem współbieżności: równoległe procesy yt-dlp dobijają
    // YouTube i wzmacniają przejściowe okna limitu 403. Pierwszy element
    // odtwarza się natychmiast z zbuforowanego/prefetchowanego URL; reszta może rozwiązywać się w
    // tle, gdy on się odtwarza.
    const ordered: (MediaFile | null)[] = items.map(() => null);
    let failures = 0;
    let started = false;
    const MAX_CONCURRENT = 4;
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        const item = items[idx]!;
        const url = streamTargetFor(item);
        let result: IpcStreamResult | undefined;
        try {
          result = (await window.api?.invoke(streamChannelFor(url), url)) as
            IpcStreamResult | undefined;
        } catch {
          result = undefined;
        }
        if (!result?.success || !result.url) {
          failures++;
          continue;
        }
        const track = buildStreamTrack(item, result.url, idx);
        ordered[idx] = track;
        if (!started) {
          started = true;
          // Jeśli użytkownik kliknął konkretne wideo, gdy play-all się rozwiązywał,
          // uszanuj kliknięcie: jego pending zostaje, pierwszy element trafia do
          // kolejki, a wszystko idzie po kolei. Kliknięcia tego samego wideo już
          // promują przez playStream - nie odtwarzaj bieżącego utworu ponownie.
          const current = player.currentTrack;
          if (current && current.id === track.id) {
            if (player.streamPending?.id === track.id) player.streamPending = null;
          } else if (player.streamPending && player.streamPending.id !== track.id) {
            // przejdź dalej: zakolejkuj też items[0], w oryginalnej kolejności
          } else {
            player.streamPending = null;
            player.setTrack(track);
            player.enrichTrack(track);
          }
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, () => worker())
    );

    // Odbuduj kolejkę raz, w oryginalnej kolejności, odrzucając utwory, które już
    // się odtworzyły (historia) lub są aktualnie odtwarzane. Robienie tego na rozwiązany element było
    // O(n²) i pozwalało równoległym workerom odsłaniać na wpół zbudowane stany kolejki.
    {
      const consumed = new Set(player.history.map((h) => h.path));
      const current = player.currentTrack;
      const queued = ordered
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t !== null && (!current || t.id !== current.id) && !consumed.has(t.path))
        .sort((a, b) => a.i - b.i)
        .map(({ t }) => t!);
      player.clearQueue();
      player.addToQueueMultiple(queued);
    }
    if (failures > 0) {
      useUIStore().notify(
        'warning',
        t('youtube.playAll'),
        t('youtube.playAllFailures', { count: failures })
      );
    }
    if (!started) {
      player.streamPending = null;
    }
  }

  return { queueSavedTrack, playAllStreams };
}
