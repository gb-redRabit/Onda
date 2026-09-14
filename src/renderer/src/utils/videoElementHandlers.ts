import type { usePlayerStore } from '@renderer/stores/player';
import { audioEngine } from '@renderer/modules/audioEngine';
import { logger } from '@shared/logger';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';

type Player = ReturnType<typeof usePlayerStore>;

// Video-element event handlers extracted from `composables/useVideoSource.ts`
// (plan 2.8).

export function connectVideoEvents(el: HTMLVideoElement, player: Player): void {
  let lastSaved = 0;
  let lastSecondarySyncTime = -1;
  el.addEventListener('timeupdate', () => {
    player.currentTime = el.currentTime;
    if (audioEngine.hasSecondaryAudio) {
      if (lastSecondarySyncTime < 0 || Math.abs(el.currentTime - lastSecondarySyncTime) > 0.5) {
        audioEngine.seekSecondaryAudio(el.currentTime);
        lastSecondarySyncTime = el.currentTime;
      }
    }
    if (player.currentTrack && el.currentTime - lastSaved > 3) {
      lastSaved = el.currentTime;
      window.api?.setPlaybackPosition(player.currentTrack.path, el.currentTime);
    }
  });
  el.addEventListener('durationchange', () => {
    player.duration = el.duration || 0;
    if (player.currentTrack) player.currentTrack.duration = el.duration || 0;
  });
  el.addEventListener('loadedmetadata', () => {
    player.duration = el.duration || 0;
    if (player.currentTrack) player.currentTrack.duration = el.duration || 0;
  });
  el.addEventListener('pause', () => {
    if (player.currentTrack && player.currentTrack.type === 'video') {
      window.api?.setPlaybackPosition(player.currentTrack.path, el.currentTime);
    }
  });
  el.addEventListener('ended', () => {
    if (player.currentTrack && player.currentTrack.type === 'video') {
      window.api?.clearPlaybackPosition(player.currentTrack.path);
    }
    if (player.pipActive) return;
    if (player.repeat === 'one') {
      el.currentTime = 0;
      el.play().catch((e) => logger.warn('video', 'repeat play rejected', e));
      return;
    }
    player.isPlaying = false;
    player.nextTrack();
  });
}

export interface VideoTranscodeState {
  attempted: string;
}

/**
 * Fallback dla plików, których Chromium nie potrafi zdekodować (HEVC w MKV/MP4,
 * WMV, FLV, MPEG-4 Part 2 itd.) — bez tego wideo po prostu nie startuje.
 * Przy błędzie dekodowania/demuxowania transkodujemy cały plik przez ffmpeg
 * do H.264/AAC i podstawiamy w miejsce oryginału.
 */
export function attachVideoTranscodeFallback(
  el: HTMLVideoElement,
  track: { path: string },
  player: Player,
  notify: (text: string, duration?: number) => void,
  state: VideoTranscodeState
): void {
  el.addEventListener(
    'error',
    () => {
      if (
        !el.error ||
        (el.error.code !== MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED &&
          el.error.code !== MediaError.MEDIA_ERR_DECODE)
      ) {
        return;
      }
      if (state.attempted === track.path) return;
      state.attempted = track.path;
      if (player.currentTrack?.path !== track.path) return;
      el.pause();
      notify('Transcoding video, please wait…', 8000);
      window.api
        ?.transcodeVideo(track.path)
        .then((outPath) => {
          if (!outPath) {
            notify('Video format not supported', 4000);
            return;
          }
          if (player.currentTrack?.path !== track.path) return;
          el.src = toMediaServerUrl(outPath);
          el.load();
          const resume = () => {
            el.play().catch((e) => logger.warn('video', 'transcoded play rejected', e));
          };
          el.addEventListener('canplay', resume, { once: true });
        })
        .catch(() => notify('Video format not supported', 4000));
    },
    { once: true }
  );
}
