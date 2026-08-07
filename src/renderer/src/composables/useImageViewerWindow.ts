import { ref, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { logger } from '@shared/logger';

export interface ImageViewerWindowDeps {
  settingsOpen: Ref<boolean>;
  uiVisible: Ref<boolean>;
  slideshowActive: Ref<boolean>;
  prev: () => void;
  next: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  rotate: () => void;
  toggleSlideshow: () => void;
  onClose: () => void;
  onUserActivity: () => void;
  stopIdle: () => void;
}

export function useImageViewerWindow(deps: ImageViewerWindowDeps) {
  const fullscreen = ref(false);
  let fsCleanup: (() => void) | null = null;

  function toggleFullscreen() {
    window.api
      ?.invoke('window:toggleFullscreen')
      .then((fs) => {
        fullscreen.value = !!fs;
      })
      .catch((err) => logger.error('ImageViewer', 'toggleFullscreen', err));
  }

  function onFullscreenChange(fs: unknown) {
    fullscreen.value = !!fs;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (deps.settingsOpen.value) {
        deps.settingsOpen.value = false;
        return;
      }
      deps.onClose();
    } else if (e.key === 'ArrowLeft') {
      deps.prev();
    } else if (e.key === 'ArrowRight') {
      deps.next();
    } else if (e.key === '+' || e.key === '=') {
      deps.zoomIn();
    } else if (e.key === '-') {
      deps.zoomOut();
    } else if (e.key === 'r') {
      deps.rotate();
    } else if (e.key === 'f') {
      toggleFullscreen();
    } else if (e.key === 'h') {
      if (deps.slideshowActive.value) {
        deps.uiVisible.value = !deps.uiVisible.value;
        deps.stopIdle();
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      deps.toggleSlideshow();
    }
  }

  function onMouseMove() {
    deps.onUserActivity();
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('mousemove', onMouseMove);
    window.api
      ?.invoke('window:isFullscreen')
      .then((fs) => {
        fullscreen.value = !!fs;
      })
      .catch((err) => logger.error('ImageViewer', 'isFullscreen', err));
    const cleanup = window.api?.on('window:fullscreenChanged', onFullscreenChange);
    if (cleanup) fsCleanup = cleanup;
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('mousemove', onMouseMove);
    if (fsCleanup) {
      fsCleanup();
      fsCleanup = null;
    }
    if (fullscreen.value) {
      window.api?.invoke('window:exitFullscreen');
    }
  });

  return { fullscreen, toggleFullscreen };
}
