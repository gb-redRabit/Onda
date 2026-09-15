import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';

export interface AudioImmersiveOptions {
  isDragging: () => boolean;
  onDragMove: (e: MouseEvent) => void;
  showLayoutEditor: Ref<boolean>;
}

// Immersive-mode behaviour of the audio view: HUD/cursor auto-hide, fullscreen
// toggling and global keyboard shortcuts.
export function useAudioImmersive({
  isDragging,
  onDragMove,
  showLayoutEditor
}: AudioImmersiveOptions) {
  const audio = useAudioPlayer();
  const player = usePlayerStore();
  const settings = useSettingsStore();

  const viewEl = ref<HTMLElement | null>(null);
  const showUI = ref(true);
  const uiTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const uiFireAt = ref(0);
  const isFullscreen = ref(false);
  const cursorHideTimeout = computed(() => (settings.playback.cursorTimeout ?? 3) * 1000);

  function setCursorVisible(visible: boolean) {
    if (!viewEl.value) return;
    viewEl.value.classList.toggle('hide-cursor', !visible);
  }

  function hideUIAfterDelay() {
    const now = Date.now();
    const delay = cursorHideTimeout.value;
    if (uiTimeout.value) {
      if (uiFireAt.value - now > delay / 3) return;
      clearTimeout(uiTimeout.value);
    }
    uiFireAt.value = now + delay;
    uiTimeout.value = setTimeout(() => {
      uiTimeout.value = null;
      if (audio.isPlaying.value && settings.playback.cursorHide) {
        showUI.value = false;
        setCursorVisible(false);
      }
    }, delay);
  }

  function onMouseMove(e: MouseEvent) {
    if (isDragging()) onDragMove(e);
    showUI.value = true;
    setCursorVisible(true);
    hideUIAfterDelay();
  }

  function toggleFullscreen() {
    if (!viewEl.value) return;
    if (!isFullscreen.value) {
      viewEl.value
        .requestFullscreen()
        .then(() => {
          isFullscreen.value = true;
          setCursorVisible(true);
          showUI.value = false;
          hideUIAfterDelay();
        })
        .catch(() => {
          /* best-effort: intentionally ignored (non-fatal) */
        });
    } else {
      document
        .exitFullscreen()
        .then(() => {
          isFullscreen.value = false;
          showUI.value = true;
          setCursorVisible(true);
        })
        .catch(() => {
          /* best-effort: intentionally ignored (non-fatal) */
        });
    }
  }

  function onFullscreenChange() {
    if (!document.fullscreenElement && isFullscreen.value) {
      isFullscreen.value = false;
      showUI.value = true;
      setCursorVisible(true);
    }
  }

  function skip(seconds: number) {
    const newTime = Math.max(0, Math.min(audio.duration.value, audio.currentTime.value + seconds));
    audio.seek(newTime);
  }

  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    )
      return;
    // Edytor layoutu przejmuje klawisze strzałek.
    if (showLayoutEditor.value) return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        audio.isPlaying.value ? audio.pause() : audio.play();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skip(e.shiftKey ? -30 : -10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        skip(e.shiftKey ? 30 : 10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        audio.setVolume(Math.min(1, audio.volume.value + 0.05));
        break;
      case 'ArrowDown':
        e.preventDefault();
        audio.setVolume(Math.max(0, audio.volume.value - 0.05));
        break;
      case 'm':
        e.preventDefault();
        player.toggleMute();
        break;
      case '0':
        e.preventDefault();
        audio.seek(0);
        break;
      case 'f':
        e.preventDefault();
        if (player.currentTrack) player.toggleFavorite(player.currentTrack.path);
        break;
      case 'F11':
      case 'Escape':
        if (isFullscreen.value) {
          e.preventDefault();
          toggleFullscreen();
        }
        break;
    }
  }

  watch(
    () => audio.isPlaying.value,
    (playing) => {
      if (playing) {
        hideUIAfterDelay();
      } else {
        showUI.value = true;
        setCursorVisible(true);
        if (uiTimeout.value) clearTimeout(uiTimeout.value);
      }
    }
  );

  onMounted(() => {
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    hideUIAfterDelay();
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (uiTimeout.value) clearTimeout(uiTimeout.value);
    if (document.fullscreenElement)
      document.exitFullscreen().catch(() => {
        /* best-effort: intentionally ignored (non-fatal) */
      });
  });

  function setViewEl(el: unknown): void {
    viewEl.value = (el as HTMLElement | null) ?? null;
  }

  return { setViewEl, showUI, isFullscreen, onMouseMove, toggleFullscreen, skip };
}
