import { watch } from 'vue';
import type { usePlayerStore } from '@renderer/stores/player';
import {
  initSubtitleRenderer,
  loadSubtitleTrack,
  removeSubtitleTrack,
  destroySubtitleRenderer
} from '@renderer/composables/useSubtitleRenderer';
import { logger } from '@shared/logger';

export function useVideoSubtitles(player: ReturnType<typeof usePlayerStore>) {
  function syncSubtitlesWithPiP(): void {
    if (player.pipActive) {
      removeSubtitleTrack();
      return;
    }
    const trackId = player.activeSubtitleId;
    if (!trackId) return;
    const track = player.subtitleTracks.find((t) => t.id === trackId);
    if (track) loadSubtitleTrack(track);
  }

  function destroySubtitles() {
    destroySubtitleRenderer();
    player.clearSubtitles();
  }

  function onVideoReady(video: HTMLVideoElement): void {
    initSubtitleRenderer(video);
    if (player.currentTrack) {
      player.loadSubtitles(player.currentTrack.path);
    }
  }

  function registerSubtitleWatcher(): void {
    watch(
      () => player.activeSubtitleId,
      async (trackId) => {
        if (!trackId || !player.currentTrack) {
          removeSubtitleTrack();
          return;
        }
        const track = player.subtitleTracks.find((t) => t.id === trackId);
        if (!track) return;

        if (track.source === 'embedded' && !track.content) {
          const result = await player.loadEmbeddedSubtitle(trackId, player.currentTrack.path);
          if (result) {
            track.content = result.content;
            track.format = result.format;
            track.fonts = result.fonts;
            await loadSubtitleTrack(track);
          } else {
            logger.error('Subtitles', 'extraction returned null');
          }
        } else {
          await loadSubtitleTrack(track);
        }
      }
    );
  }

  return { syncSubtitlesWithPiP, destroySubtitles, onVideoReady, registerSubtitleWatcher };
}
