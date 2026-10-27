import type { usePlayerStore } from '@renderer/stores/player';
import { audioEngine } from '@renderer/modules/audioEngine';
import {
  buffered as audioBuffered,
  currentTime as audioCurrentTime,
  duration as audioDuration,
  isPlaying as audioIsPlaying
} from '@renderer/composables/useAudioPlayer';
import { isCoreShell } from '@renderer/utils/runtimeMode';
import { logger } from '@shared/logger';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { i18n } from '@renderer/i18n';

type Player = ReturnType<typeof usePlayerStore>;

// Handlery zdarzeń elementu wideo wydzielone z `composables/useVideoSource.ts`
// (plan 2.8).

function syncVideoAudioRefs(el: HTMLVideoElement): void {
  if (!isCoreShell()) return;
  audioCurrentTime.value = el.currentTime;
  audioDuration.value = Number.isFinite(el.duration) ? el.duration : 0;
  audioIsPlaying.value = !el.paused;
  const b = el.buffered;
  audioBuffered.value =
    b.length > 0 && el.duration > 0 ? Math.min(1, b.end(b.length - 1) / el.duration) : 0;
}

export function connectVideoEvents(el: HTMLVideoElement, player: Player): void {
  let lastSaved = 0;
  let lastSecondarySyncTime = -1;
  el.addEventListener('timeupdate', () => {
    player.currentTime = el.currentTime;
    syncVideoAudioRefs(el);
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
  el.addEventListener('play', () => {
    if (isCoreShell()) audioIsPlaying.value = true;
  });
  el.addEventListener('durationchange', () => {
    player.duration = el.duration || 0;
    if (player.currentTrack) player.currentTrack.duration = el.duration || 0;
    syncVideoAudioRefs(el);
  });
  el.addEventListener('loadedmetadata', () => {
    player.duration = el.duration || 0;
    if (player.currentTrack) player.currentTrack.duration = el.duration || 0;
    syncVideoAudioRefs(el);
  });
  el.addEventListener('pause', () => {
    if (isCoreShell()) audioIsPlaying.value = false;
    if (player.currentTrack && player.currentTrack.type === 'video') {
      window.api?.setPlaybackPosition(player.currentTrack.path, el.currentTime);
    }
  });
  el.addEventListener('ended', () => {
    if (isCoreShell()) audioIsPlaying.value = false;
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
  state: VideoTranscodeState,
  signal?: AbortSignal
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
      notify(i18n.global.t('player.transcodingVideo'), 8000);
      window.api
        ?.transcodeVideo(track.path)
        .then((outPath) => {
          if (!outPath) {
            notify(i18n.global.t('player.videoUnsupported'), 4000);
            return;
          }
          if (player.currentTrack?.path !== track.path) return;
          el.src = toMediaServerUrl(outPath);
          el.load();
          const resume = () => {
            el.play().catch((e) => logger.warn('video', 'transcoded play rejected', e));
          };
          el.addEventListener('canplay', resume, { once: true, signal });
        })
        .catch(() => notify(i18n.global.t('player.videoUnsupported'), 4000));
    },
    { once: true, signal }
  );
}
