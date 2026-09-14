import { useI18n } from 'vue-i18n';
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

// Stream playback: queueing a single saved track and playing every item of a
// playlist/channel. Uses the player + UI stores directly; the store
// destructures the returned actions back into the same names.
export function createOnlineStreams() {
  const { t } = useI18n();

  // Queues a single saved track (platform-dispatched via the stored page URL).
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
    // The player bar appears instantly with the first item while it resolves.
    player.streamPending = buildStreamTrack(items[0]!, `yt:${items[0]!.id}`, 0);
    player.enrichTrack(player.streamPending);
    // Resolve with a small concurrency cap: parallel yt-dlp spawns hammer
    // YouTube and amplify the transient 403 rate-limit windows. The first item
    // plays immediately from its cached/prefetched URL; the rest can resolve in
    // the background while it plays.
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
          // If the user clicked a specific video while play-all was resolving,
          // respect the click: its pending stays, the first item goes to the
          // queue and everything follows in order. Same-video clicks already
          // promote through playStream - do not replay a current track.
          const current = player.currentTrack;
          if (current && current.id === track.id) {
            if (player.streamPending?.id === track.id) player.streamPending = null;
          } else if (player.streamPending && player.streamPending.id !== track.id) {
            // fall through: queue items[0] too, in original order
          } else {
            player.streamPending = null;
            player.setTrack(track);
            player.enrichTrack(track);
          }
        }
        // Rebuild the queue in the original order, dropping tracks that already
        // played (history) or are currently playing.
        const consumed = new Set(player.history.map((h) => h.path));
        const current = player.currentTrack;
        const queued = ordered
          .map((t, i) => ({ t, i }))
          .filter(
            ({ t }) => t !== null && (!current || t.id !== current.id) && !consumed.has(t.path)
          )
          .sort((a, b) => a.i - b.i)
          .map(({ t }) => t!);
        player.clearQueue();
        player.addToQueueMultiple(queued);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, () => worker())
    );
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
