import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { useI18n } from 'vue-i18n';
import type { usePlayerStore } from '@renderer/stores/player';
import type { useSettingsStore } from '@renderer/stores/settings';
import type { useUIStore } from '@renderer/stores/ui';
import {
  applyVolumeTarget,
  seekTarget,
  skipTarget
} from '@renderer/utils/mediaTransport';
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
    player.clearResumePrompt();
    const target = e.target as HTMLElement | null;
    if (target && target.closest && target.closest('[data-wheel-ignore]')) return;
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const newVol = Math.max(0, Math.min(1, player.volume + delta));
    player.setVolume(newVol);
    applyVolumeTarget(vp.videoRef.value, player.isMuted, newVol);
    showToast(t('player.volume', { n: Math.round(newVol * 100) }), 1200);
  }

  function onSeek(time: number) {
    player.seek(time);
    seekTarget(vp.videoRef.value, time);
    player.clearResumePrompt();
  }

  function onVolumeChange(value: number) {
    player.setVolume(value);
    applyVolumeTarget(vp.videoRef.value, player.isMuted, value);
    player.clearResumePrompt();
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
    const newTime = skipTarget(vp.videoRef.value, seconds);
    if (newTime === null) return;
    player.currentTime = newTime;
    player.clearResumePrompt();
    const sign = seconds > 0 ? '+' : '';
    showToast(`${sign}${seconds}s`, 1000);
  }

  function setSpeed(speed: number) {
    const clamped = Math.round(Math.max(0.2, Math.min(3, speed)) * 10) / 10;
    settings.updatePlayback({ playbackSpeed: clamped });
    if (vp.videoRef.value) vp.videoRef.value.playbackRate = clamped;
    player.clearResumePrompt();
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
    }
    clickTimer = setTimeout(() => {
      if (player.pipActive) return;
      player.togglePlay();
      showToast(player.isPlaying ? t('player.playing') : t('player.paused'), 1000);
      clickTimer = null;
    }, 180);
  }

  function handleDoubleClick() {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    toggleFullscreen();
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
        const timeout = Math.max(1, settings.playback.resumePromptTimeout || 7);
        resumePromptTimer = setTimeout(() => {
          player.clearResumePrompt();
        }, timeout * 1000);
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
    handleDoubleClick,
    onResumeContinue,
    onResumeStart,
    cleanup
  };
}
