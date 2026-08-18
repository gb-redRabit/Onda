import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { useI18n } from 'vue-i18n';
import type { usePlayerStore } from '@renderer/stores/player';
import type { useSettingsStore } from '@renderer/stores/settings';
import type { useUIStore } from '@renderer/stores/ui';
import { useVideoPlayer } from '@renderer/composables/useVideoPlayer';

interface PlayerControlsCtx {
  player: ReturnType<typeof usePlayerStore>;
  settings: ReturnType<typeof useSettingsStore>;
  ui: ReturnType<typeof useUIStore>;
  t: ReturnType<typeof useI18n>['t'];
  vp: ReturnType<typeof useVideoPlayer>;
  playerContainerRef: Ref<HTMLDivElement | null>;
}

export function usePlayerControls(ctx: PlayerControlsCtx) {
  const { player, settings, ui, t, vp, playerContainerRef } = ctx;

  const isFullscreen = ref(false);
  const showControls = ref(true);
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
  let resumePromptTimer: ReturnType<typeof setTimeout> | null = null;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(text: string, duration = 1500) {
    ui.notify('info', text, undefined, duration);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!vp.videoRef.value) return;
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const newVol = Math.max(0, Math.min(1, player.volume + delta));
    player.setVolume(newVol);
    vp.videoRef.value.volume = player.isMuted ? 0 : newVol;
    showToast(t('player.volume', { n: Math.round(newVol * 100) }), 1200);
  }

  function onSeek(time: number) {
    if (!vp.videoRef.value) return;
    player.seek(time);
    vp.videoRef.value.currentTime = time;
  }

  function onVolumeChange(value: number) {
    player.setVolume(value);
    if (vp.videoRef.value) vp.videoRef.value.volume = player.isMuted ? 0 : value;
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const target = playerContainerRef.value || document.documentElement;
      target.requestFullscreen().catch(() => {
        document.documentElement.requestFullscreen();
      });
    } else {
      document.exitFullscreen();
    }
  }

  function skip(seconds: number) {
    if (!vp.videoRef.value) return;
    const newTime = Math.max(
      0,
      Math.min(vp.videoRef.value.duration || 0, vp.videoRef.value.currentTime + seconds)
    );
    vp.videoRef.value.currentTime = newTime;
    player.currentTime = newTime;
    const sign = seconds > 0 ? '+' : '';
    showToast(`${sign}${seconds}s`, 1000);
  }

  function setSpeed(speed: number) {
    const clamped = Math.round(Math.max(0.2, Math.min(3, speed)) * 10) / 10;
    settings.updatePlayback({ playbackSpeed: clamped });
    if (vp.videoRef.value) vp.videoRef.value.playbackRate = clamped;
    showToast(`${clamped}x`, 1200);
  }

  function onMouseMove() {
    showControls.value = true;
    if (settings.playback.cursorHide && isFullscreen.value && playerContainerRef.value) {
      playerContainerRef.value.classList.remove('hide-cursor');
    }
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      if (player.isPlaying) {
        showControls.value = false;
        if (settings.playback.cursorHide && isFullscreen.value && playerContainerRef.value) {
          playerContainerRef.value.classList.add('hide-cursor');
        }
      }
    }, settings.playback.cursorTimeout * 1000);
  }

  function handleClick() {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      toggleFullscreen();
      return;
    }
    clickTimer = setTimeout(() => {
      if (player.pipActive) return;
      player.togglePlay();
      showToast(player.isPlaying ? t('player.playing') : t('player.paused'), 1000);
      clickTimer = null;
    }, 250);
  }

  function onResumeContinue() {
    const prompt = player.resumePrompt;
    if (prompt && vp.videoRef.value) {
      vp.videoRef.value.currentTime = prompt.position;
      player.currentTime = prompt.position;
      vp.videoRef.value.play().catch(() => {});
      window.api?.setPlaybackPosition(prompt.path, prompt.position);
    }
    player.clearResumePrompt();
  }

  function onResumeStart() {
    const prompt = player.resumePrompt;
    if (prompt) window.api?.clearPlaybackPosition(prompt.path);
    player.clearResumePrompt();
  }

  watch(
    () => player.resumePrompt,
    (prompt) => {
      if (resumePromptTimer) {
        clearTimeout(resumePromptTimer);
        resumePromptTimer = null;
      }
      if (prompt) {
        resumePromptTimer = setTimeout(() => {
          player.clearResumePrompt();
        }, 7000);
      }
    }
  );

  function cleanup() {
    if (resumePromptTimer) clearTimeout(resumePromptTimer);
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (clickTimer) clearTimeout(clickTimer);
  }

  return {
    isFullscreen,
    showControls,
    showToast,
    onWheel,
    onSeek,
    onVolumeChange,
    toggleFullscreen,
    skip,
    setSpeed,
    onMouseMove,
    handleClick,
    onResumeContinue,
    onResumeStart,
    cleanup
  };
}
