import { ref, watch, computed, nextTick } from 'vue';
import type { usePlayerStore } from '@renderer/stores/player';
import type { useSettingsStore } from '@renderer/stores/settings';
import type { usePiP } from '@renderer/composables/usePiP';
import type { MediaFile } from '@renderer/types/media';
import {
  initSubtitleRenderer,
  loadSubtitleTrack,
  removeSubtitleTrack,
  destroySubtitleRenderer,
  preparePiPSubtitleData
} from '@renderer/composables/useSubtitleRenderer';
import { audioEngine } from '@renderer/modules/audioEngine';
import { logger } from '@renderer/utils/logger';

export function useVideoPlayer(ctx: {
  player: ReturnType<typeof usePlayerStore>;
  settings: ReturnType<typeof useSettingsStore>;
  pip: ReturnType<typeof usePiP>;
  notify: (text: string, duration?: number) => void;
}) {
  const { player, settings, pip, notify } = ctx;

  const videoRef = ref<HTMLVideoElement | null>(null);
  const videoEventsConnected = ref(false);
  let lastLoadedPath = '';
  let currentLoadId = 0;

  const videoFilterStyle = computed(() => {
    const f = settings.playback.videoFilter;
    if (!f || f === 'none') return {};
    return { filter: f };
  });

  function getTrackSrc(track: { path: string }): string {
    return `file:///${track.path.replace(/\\/g, '/')}`;
  }

  function connectVideoEvents(el: HTMLVideoElement) {
    if (videoEventsConnected.value) return;
    videoEventsConnected.value = true;
    let lastSaved = 0;
    el.addEventListener('timeupdate', () => {
      player.currentTime = el.currentTime;
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
        el.play().catch(() => {});
        return;
      }
      player.isPlaying = false;
      player.nextTrack();
    });
  }

  function setupVideo(track: MediaFile | null) {
    if (!track || track.type !== 'video' || !videoRef.value) return;
    const el = videoRef.value;
    const src = getTrackSrc(track);
    if (el.getAttribute('data-src') !== src) {
      const seekTo = player.pipTime > 0 ? player.pipTime : player.currentTime;
      if (player.pipTime > 0) player.pipTime = 0;
      el.setAttribute('data-src', src);
      el.src = src;
      connectVideoEvents(el);
      audioEngine.connectVideoElement(el);

      el.addEventListener(
        'canplay',
        () => {
          if (player.isPlaying && !player.pipActive) {
            el.play().catch(() => {});
          }
        },
        { once: true }
      );

      el.addEventListener(
        'loadedmetadata',
        () => {
          if (seekTo > 0) el.currentTime = seekTo;
          el.playbackRate = settings.playback.playbackSpeed;
        },
        { once: true }
      );

      el.addEventListener(
        'playing',
        () => {
          player.flushPendingQueue();
        },
        { once: true }
      );

      el.load();
    } else {
      el.volume = player.isMuted ? 0 : player.volume;
      el.playbackRate = settings.playback.playbackSpeed;
      if (player.isPlaying && !player.pipActive) el.play().catch(() => {});
    }
  }

  function onVideoRef(el: unknown) {
    videoRef.value = el as HTMLVideoElement;
    if (el && player.currentTrack?.type === 'video') {
      const loadId = ++currentLoadId;
      setupVideo(player.currentTrack);
      const video = el as HTMLVideoElement;
      const tryInit = () => {
        if (loadId !== currentLoadId) return;
        if (!video.isConnected) {
          nextTick(tryInit);
          return;
        }
        initSubtitleRenderer(video);
        if (player.currentTrack && player.currentTrack.path !== lastLoadedPath) {
          if (video.readyState >= 1 || video.videoWidth > 0) {
            lastLoadedPath = player.currentTrack.path;
            player.loadSubtitles(player.currentTrack.path);
          } else {
            video.addEventListener(
              'loadedmetadata',
              () => {
                if (loadId !== currentLoadId) return;
                if (player.currentTrack && player.currentTrack.path !== lastLoadedPath) {
                  lastLoadedPath = player.currentTrack.path;
                  player.loadSubtitles(player.currentTrack.path);
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

  async function togglePiP() {
    if (player.pipActive) {
      pip.stop();
      return;
    }

    let src = videoRef.value?.src || '';
    if (!src && player.currentTrack) {
      src = getTrackSrc(player.currentTrack);
    }
    if (!src) return;

    const startTime = videoRef.value?.currentTime || player.currentTime;

    const started = await pip.start(src, {
      position: settings.playback.pipPosition,
      width: settings.playback.pipWidth,
      height: settings.playback.pipHeight,
      startTime,
      subtitle: true
    });
    if (started) {
      player.pipTime = startTime;
      player.pipActive = true;
      if (videoRef.value) videoRef.value.pause();
      player.isPlaying = false;
      syncSubtitlesWithPiP();
    }
  }

  function init(track: MediaFile | null) {
    settings.updatePlayback({ videoFilter: 'none', playbackSpeed: 1 });

    if (track?.type === 'video') {
      setupVideo(track);

      const src = getTrackSrc(track);
      if (player.pipActive) {
        pip.loadTrack(src, null);
        preparePiPSubtitleData(track.path).then((subtitleData) => {
          if (player.pipActive) pip.updateSubtitle(subtitleData);
        });
      } else {
        pip.preload(src, null);
        preparePiPSubtitleData(track.path).then((subtitleData) => {
          pip.updateSubtitle(subtitleData);
        });
      }
    }
  }

  function destroy() {
    audioEngine.disconnectVideoElement();
    if (videoRef.value) {
      videoRef.value.pause();
      videoRef.value.removeAttribute('src');
      videoRef.value.load();
    }
    destroySubtitleRenderer();
    player.clearSubtitles();
  }

  watch(
    () => player.currentTrack,
    (track, oldTrack) => {
      if (oldTrack && track?.path !== oldTrack?.path) {
        currentLoadId++;
      }
      if (track?.type === 'video' && track.path !== lastLoadedPath) {
        lastLoadedPath = track.path;
        player.loadSubtitles(track.path);
      }
    }
  );

  watch(
    () => player.currentTrack,
    (track) => {
      if (!track) return;
      if (track.type !== 'video') return;

      settings.updatePlayback({ videoFilter: 'none', playbackSpeed: 1 });
      setupVideo(track);

      if (player.pipActive && track.type === 'video') {
        const src = getTrackSrc(track);
        pip.loadTrack(src, null);
        preparePiPSubtitleData(track.path).then((subtitleData) => {
          if (player.pipActive) {
            pip.updateSubtitle(subtitleData);
          }
        });
        if (videoRef.value) videoRef.value.pause();
        player.isPlaying = false;
      } else if (track.type === 'video') {
        const src = getTrackSrc(track);
        pip.preload(src, null);
        preparePiPSubtitleData(track.path).then((subtitleData) => {
          pip.updateSubtitle(subtitleData);
        });
      }

      const title = track.metadata?.title || track.name;
      const artist = track.metadata?.artist;
      notify(artist ? `${artist} - ${title}` : title, 2500);
    },
    {
      flush: 'post'
    }
  );

  watch(
    () => player.isPlaying,
    (playing) => {
      if (!videoRef.value || player.currentTrack?.type !== 'video') return;
      if (player.pipActive) {
        videoRef.value.pause();
        return;
      }
      if (playing) videoRef.value.play().catch(() => {});
      else videoRef.value.pause();
    }
  );

  watch(
    () => settings.playback.playbackSpeed,
    (speed) => {
      if (videoRef.value) videoRef.value.playbackRate = speed;
    }
  );

  watch([() => player.volume, () => player.isMuted], () => {
    if (videoRef.value) videoRef.value.volume = player.isMuted ? 0 : player.volume;
  });

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

  return {
    videoRef,
    videoFilterStyle,
    onVideoRef,
    togglePiP,
    syncSubtitlesWithPiP,
    init,
    destroy
  };
}
