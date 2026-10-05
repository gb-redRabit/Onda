import { ref, computed } from 'vue';
import type { usePlayerStore } from '@renderer/stores/player';
import type { useSettingsStore } from '@renderer/stores/settings';
import type { usePiP } from '@renderer/composables/usePiP';
import type { MediaFile } from '@renderer/types/media';
import { useVideoCodec } from '@renderer/composables/useVideoCodec';
import { audioEngine } from '@renderer/modules/audioEngine';
import { logger } from '@shared/logger';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import {
  attachVideoTranscodeFallback,
  connectVideoEvents,
  type VideoTranscodeState
} from '@renderer/utils/videoElementHandlers';

export interface VideoPlayerContext {
  player: ReturnType<typeof usePlayerStore>;
  settings: ReturnType<typeof useSettingsStore>;
  pip: ReturnType<typeof usePiP>;
  notify: (text: string, duration?: number) => void;
}

export function useVideoSource(
  ctx: VideoPlayerContext,
  onVideoReady: (video: HTMLVideoElement) => void
) {
  const { player, settings, notify } = ctx;
  const videoRef = ref<HTMLVideoElement | null>(null);
  const videoEventsConnected = ref(false);
  const { checkVideoAudioCodec } = useVideoCodec({ player, notify });
  let lastLoadedPath = '';
  let currentLoadId = 0;
  const transcodeState: VideoTranscodeState = { attempted: '' };
  // Usuwa jednorazowe listenery z poprzedniego źródła przy zmianie utworu.
  // Bez tego `canplay`/`loadedmetadata` niedoszłe do końca zostawały na elemencie
  // i odpalały się przy następnym `src` ze starym `seekTo`, a listenery `error`
  // kumulowały się przy każdym przełączeniu.
  let setupAbort: AbortController | null = null;

  const videoFilterStyle = computed(() => {
    const f = settings.playback.videoFilter;
    if (!f || f === 'none') return {};
    return { filter: f };
  });

  function getTrackSrc(track: { path: string }): string {
    return toMediaServerUrl(track.path);
  }

  function connectEventsOnce(el: HTMLVideoElement) {
    if (videoEventsConnected.value) return;
    videoEventsConnected.value = true;
    connectVideoEvents(el, player);
  }

  async function setupVideo(track: MediaFile | null) {
    if (!track || track.type !== 'video' || !videoRef.value) return;
    // Wideo jest serwowane przez lokalny serwer mediów — przyznaj dostęp do
    // folderu utworu, zanim element zażąda URL.
    await window.api?.grantMediaAccess(track.path);
    const el = videoRef.value;
    const src = getTrackSrc(track);
    if (el.getAttribute('data-src') !== src) {
      audioEngine.disconnectSecondaryAudio();
      const seekTo = player.pipTime > 0 ? player.pipTime : player.currentTime;
      if (player.pipTime > 0) player.pipTime = 0;
      el.setAttribute('data-src', src);
      audioEngine.connectVideoElement(el);
      connectEventsOnce(el);
      el.src = src;

      setupAbort?.abort();
      setupAbort = new AbortController();
      const { signal } = setupAbort;

      el.addEventListener(
        'canplay',
        () => {
          if (player.isPlaying && !player.pipActive) {
            el.play().catch((e) => logger.warn('video', 'autoplay rejected', e));
          }
        },
        { once: true, signal }
      );

      el.addEventListener(
        'loadedmetadata',
        () => {
          if (seekTo > 0) el.currentTime = seekTo;
          el.playbackRate = settings.playback.playbackSpeed;
        },
        { once: true, signal }
      );

      el.addEventListener(
        'playing',
        () => {
          player.enrichPendingQueue();
        },
        { once: true, signal }
      );

      el.load();
      checkVideoAudioCodec(track, el);
      attachVideoTranscodeFallback(el, track, player, notify, transcodeState, signal);
    } else {
      audioEngine.setVideoVolume(player.isMuted ? 0 : player.volume);
      el.playbackRate = settings.playback.playbackSpeed;
      if (player.isPlaying && !player.pipActive)
        el.play().catch((e) => logger.warn('video', 'resume play rejected', e));
    }
  }

  function onVideoRef(el: unknown) {
    if (el && videoRef.value !== el) {
      videoEventsConnected.value = false;
    }
    videoRef.value = el as HTMLVideoElement;
    if (el && player.currentTrack?.type === 'video') {
      const loadId = ++currentLoadId;
      setupVideo(player.currentTrack);
      const video = el as HTMLVideoElement;
      let connectAttempts = 0;
      // Czeka, aż element zostanie dołączony do DOM, potem jednorazowo przygotowuje
      // napisy. rAF naturalnie dławi się wraz z kartą, koszt jest ograniczony (~2s).
      const tryInit = () => {
        if (loadId !== currentLoadId) return;
        if (!video.isConnected) {
          if (++connectAttempts <= 120) {
            requestAnimationFrame(tryInit);
          }
          return;
        }
        if (player.currentTrack && player.currentTrack.path !== lastLoadedPath) {
          if (video.readyState >= 1 || video.videoWidth > 0) {
            lastLoadedPath = player.currentTrack.path;
            onVideoReady(video);
          } else {
            video.addEventListener(
              'loadedmetadata',
              () => {
                if (loadId !== currentLoadId) return;
                if (player.currentTrack && player.currentTrack.path !== lastLoadedPath) {
                  lastLoadedPath = player.currentTrack.path;
                  onVideoReady(video);
                }
              },
              { once: true }
            );
          }
        }
      };
      tryInit();
    }
  }

  // Śledzi oczekującą inicjalizację onVideoRef i anuluje ją, jeśli bieżący utwór
  // zmieni się, zanim element zostanie podłączony. Wywoływane przez pojedynczy scalony
  // watcher currentTrack w useVideoPlayer.
  function onTrackChanged(track: MediaFile | null, oldTrack: MediaFile | null): void {
    if (oldTrack && track?.path !== oldTrack?.path) {
      currentLoadId++;
      transcodeState.attempted = '';
    }
    if (track?.type === 'video' && track.path !== lastLoadedPath) {
      lastLoadedPath = track.path;
      player.loadSubtitles(track.path);
    }
  }

  return {
    videoRef,
    videoFilterStyle,
    onVideoRef,
    setupVideo,
    getTrackSrc,
    onTrackChanged
  };
}
