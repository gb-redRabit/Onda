import { watch } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { audioEngine } from '@renderer/modules/audioEngine';
import { logger } from '@shared/logger';
import { useVideoSource, type VideoPlayerContext } from './useVideoSource';
import { useVideoSubtitles } from './useVideoSubtitles';
import { useVideoPiP } from './useVideoPiP';

export function useVideoPlayer(ctx: VideoPlayerContext) {
  const { player, settings, pip, notify } = ctx;

  const subtitles = useVideoSubtitles(player);
  const source = useVideoSource(ctx, subtitles.onVideoReady);
  const { videoRef } = source;
  const pipCtrl = useVideoPiP(
    player,
    settings,
    pip,
    () => videoRef.value,
    source.getTrackSrc,
    subtitles.syncSubtitlesWithPiP
  );

  subtitles.registerSubtitleWatcher();

  function init(track: MediaFile | null) {
    settings.updatePlayback({ videoFilter: 'none', playbackSpeed: 1 });

    if (track?.type === 'video') {
      source.setupVideo(track);

      const src = source.getTrackSrc(track);
      if (player.pipActive) {
        pipCtrl.updatePiPSubtitles(track, true);
      } else {
        pip.preload(src, null);
        pipCtrl.updatePiPSubtitles(track, false);
      }
    }
  }

  function destroy() {
    audioEngine.disconnectVideoElement();
    audioEngine.disconnectSecondaryAudio();
    if (videoRef.value) {
      videoRef.value.pause();
      videoRef.value.removeAttribute('src');
      videoRef.value.load();
    }
    subtitles.destroySubtitles();
  }

  watch(
    () => player.currentTrack,
    (track, oldTrack) => {
      source.onTrackChanged(track, oldTrack);
      if (!track || track.type !== 'video') return;

      settings.updatePlayback({ videoFilter: 'none', playbackSpeed: 1 });
      source.setupVideo(track);

      const src = source.getTrackSrc(track);
      if (player.pipActive) {
        pipCtrl.updatePiPSubtitles(track, true);
        videoRef.value?.pause();
        player.isPlaying = false;
      } else {
        pip.preload(src, null);
        pipCtrl.updatePiPSubtitles(track, false);
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
        audioEngine.pauseSecondaryAudio();
        return;
      }
      if (playing) {
        videoRef.value.play().catch((e) => logger.warn('video', 'play rejected', e));
        audioEngine.playSecondaryAudio();
      } else {
        videoRef.value.pause();
        audioEngine.pauseSecondaryAudio();
      }
    }
  );

  watch(
    () => settings.playback.playbackSpeed,
    (speed) => {
      if (videoRef.value) videoRef.value.playbackRate = speed;
    }
  );

  let lastSecondarySyncTime = -1;

  watch(
    () => player.currentTime,
    (time) => {
      if (!audioEngine.hasSecondaryAudio) return;
      if (lastSecondarySyncTime < 0 || Math.abs(time - lastSecondarySyncTime) > 0.5) {
        audioEngine.seekSecondaryAudio(time);
      }
      lastSecondarySyncTime = time;
    }
  );

  watch([() => player.volume, () => player.isMuted], () => {
    if (!videoRef.value) return;
    if (audioEngine.hasSecondaryAudio) {
      audioEngine.setVideoVolume(0);
      audioEngine.setVolume(player.isMuted ? 0 : player.volume);
    } else {
      audioEngine.setVideoVolume(player.isMuted ? 0 : player.volume);
    }
  });

  return {
    videoRef,
    videoFilterStyle: source.videoFilterStyle,
    onVideoRef: source.onVideoRef,
    togglePiP: pipCtrl.togglePiP,
    syncSubtitlesWithPiP: subtitles.syncSubtitlesWithPiP,
    init,
    destroy
  };
}
