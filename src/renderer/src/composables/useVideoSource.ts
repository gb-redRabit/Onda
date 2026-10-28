import { ref, computed } from 'vue';
import type { usePlayerStore } from '@renderer/stores/player';
import type { useSettingsStore } from '@renderer/stores/settings';
import type { usePiP } from '@renderer/composables/usePiP';
import type { MediaFile } from '@renderer/types/media';
import { useVideoCodec } from '@renderer/composables/useVideoCodec';
import { audioEngine } from '@renderer/modules/audioEngine';
import { logger } from '@shared/logger';
import { toMediaServerUrl, toMediaStreamUrl } from '@renderer/utils/mediaUrl';
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
    // Ścieżka już będąca proxy serwera mediów (np. `/stream?provider=` dla MEGA) — bez zmian.
    if (/\/stream\?/.test(track.path)) return track.path;
    // Zdalne URL-e (providerzy/strumienie) idą przez proxy serwera mediów (`/stream?url=`),
    // pliki lokalne przez `?path=`.
    if (/^https?:\/\//i.test(track.path)) return toMediaStreamUrl(track.path);
    return toMediaServerUrl(track.path);
  }

  function connectEventsOnce(el: HTMLVideoElement) {
    if (videoEventsConnected.value) return;
    videoEventsConnected.value = true;
    connectVideoEvents(el, player);
  }

  async function setupVideo(track: MediaFile | null) {
    if (!track || track.type !== 'video' || !videoRef.value) return;

    const src = getTrackSrc(track);
    const el = videoRef.value;
    const sourceChanged = el.getAttribute('data-src') !== src;
    // Token zmieniamy tylko przy faktycznej zmianie źródła. Dzięki temu dwa
    // równoległe wywołania dla tego samego utworu (ref + watcher) nie unieważniają
    // nawzajem swojej inicjalizacji napisów.
    const loadId = sourceChanged ? ++currentLoadId : currentLoadId;

    // Wideo lokalne jest serwowane przez lokalny serwer mediów — przyznaj dostęp do
    // folderu utworu, zanim element zażąda URL. Zdalne URL-e nie potrzebują zgody.
    if (!/^https?:\/\//i.test(track.path)) await window.api?.grantMediaAccess(track.path);
    if (loadId !== currentLoadId || videoRef.value !== el) return;

    /** Napisy inicjalizujemy dokładnie raz na faktycznie wczytane źródło. */
    const markReady = (): void => {
      if (loadId !== currentLoadId) return;
      if (lastLoadedPath === track.path) return;
      lastLoadedPath = track.path;
      onVideoReady(el);
    };

    if (sourceChanged) {
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
          markReady();
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
      if (!/^https?:\/\//i.test(track.path)) {
        checkVideoAudioCodec(track, el);
        attachVideoTranscodeFallback(el, track, player, notify, transcodeState, signal);
      }
      return;
    }

    audioEngine.setVideoVolume(player.isMuted ? 0 : player.volume);
    el.playbackRate = settings.playback.playbackSpeed;
    if (player.isPlaying && !player.pipActive)
      el.play().catch((e) => logger.warn('video', 'resume play rejected', e));

    if (el.readyState >= 1) {
      markReady();
    } else {
      // To samo źródło może być w trakcie ładowania (np. ref zamontował element,
      // a watcher wywołał setup ponownie). Token jest wspólny, więc listener
      // wystarczy dodać bez unieważniania trwającego `loadedmetadata`.
      el.addEventListener('loadedmetadata', markReady, { once: true });
    }
  }

  function onVideoRef(el: unknown) {
    if (!el) {
      currentLoadId++;
      lastLoadedPath = '';
      setupAbort?.abort();
      setupAbort = null;
      const old = videoRef.value;
      videoRef.value = null;
      if (old) {
        old.pause();
        old.removeAttribute('src');
        old.load();
      }
      audioEngine.disconnectVideoElement();
      audioEngine.disconnectSecondaryAudio();
      player.clearSubtitles();
      return;
    }

    const video = el as HTMLVideoElement;
    if (videoRef.value !== video) {
      videoEventsConnected.value = false;
    }
    videoRef.value = video;
    if (player.currentTrack?.type === 'video') {
      void setupVideo(player.currentTrack);
    }
  }

  // Śledzi zmianę utworu i unieważnia tylko stan poprzedniego źródła. Inicjalizacja
  // napisów należy do `setupVideo` (po `loadedmetadata`), więc nie oznaczamy tutaj
  // nowej ścieżki jako już wczytanej.
  function onTrackChanged(track: MediaFile | null, oldTrack: MediaFile | null): void {
    if (oldTrack && track?.path !== oldTrack?.path) {
      lastLoadedPath = '';
      transcodeState.attempted = '';
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
