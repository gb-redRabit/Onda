import { ref, computed, watch, nextTick } from 'vue';
import type { usePlayerStore } from '@renderer/stores/player';
import type { useSettingsStore } from '@renderer/stores/settings';
import type { usePiP } from '@renderer/composables/usePiP';
import type { MediaFile } from '@renderer/types/media';
import { preparePiPSubtitleData } from '@renderer/composables/useSubtitleRenderer';
import { useVideoCodec } from '@renderer/composables/useVideoCodec';
import { audioEngine } from '@renderer/modules/audioEngine';
import { logger } from '@shared/logger';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';

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
  const { player, settings, pip, notify } = ctx;
  const videoRef = ref<HTMLVideoElement | null>(null);
  const videoEventsConnected = ref(false);
  const { checkVideoAudioCodec } = useVideoCodec({ player, notify });
  let lastLoadedPath = '';
  let currentLoadId = 0;

  const videoFilterStyle = computed(() => {
    const f = settings.playback.videoFilter;
    if (!f || f === 'none') return {};
    return { filter: f };
  });

  function getTrackSrc(track: { path: string }): string {
    return toMediaServerUrl(track.path);
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
        el.play().catch((e) => logger.warn('video', 'repeat play rejected', e));
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
      audioEngine.disconnectSecondaryAudio();
      const seekTo = player.pipTime > 0 ? player.pipTime : player.currentTime;
      if (player.pipTime > 0) player.pipTime = 0;
      el.setAttribute('data-src', src);
      audioEngine.connectVideoElement(el);
      connectVideoEvents(el);
      el.src = src;

      el.addEventListener(
        'canplay',
        () => {
          if (player.isPlaying && !player.pipActive) {
            el.play().catch((e) => logger.warn('video', 'autoplay rejected', e));
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
      checkVideoAudioCodec(track, el);

      if (settings.playback.pipPreBuffer && track && !player.pipActive) {
        if (track.type === 'video') {
          preparePiPSubtitleData(track.path).then((subtitleData) => {
            pip.preload(src, subtitleData);
          });
        } else {
          pip.preload(src, null);
        }
      }
    } else {
      audioEngine.setVideoVolume(player.isMuted ? 0 : player.volume);
      el.playbackRate = settings.playback.playbackSpeed;
      if (player.isPlaying && !player.pipActive)
        el.play().catch((e) => logger.warn('video', 'resume play rejected', e));
    }
  }

  function onVideoRef(el: unknown) {
    videoRef.value = el as HTMLVideoElement;
    if (el && player.currentTrack?.type === 'video') {
      const loadId = ++currentLoadId;
      setupVideo(player.currentTrack);
      const video = el as HTMLVideoElement;
      let connectAttempts = 0;
      const tryInit = () => {
        if (loadId !== currentLoadId) return;
        if (!video.isConnected) {
          if (++connectAttempts <= 50) {
            nextTick(tryInit);
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

  function registerTrackWatcher(): void {
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
  }

  return { videoRef, videoFilterStyle, onVideoRef, setupVideo, getTrackSrc, registerTrackWatcher };
}
