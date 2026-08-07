import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { logger } from '@shared/logger';
import { useTimeoutFn, useDebounceFn } from './useTimers';
import { useImageViewerImage } from './useImageViewerImage';
import { useImageViewerTransition } from './useImageViewerTransition';
import { useImageViewerSlideshow } from './useImageViewerSlideshow';
import { createImageKeyHandler } from './useImageViewerKeyboard';
import type { FileItem } from '@renderer/types/explorer';

export interface ImageViewerProps {
  files: FileItem[];
  initialIndex: number;
}

export function useImageViewer(
  props: ImageViewerProps,
  emit: { close: () => void }
) {
  const files = computed(() => props.files);
  const currentIndex = ref(props.initialIndex);

  const image = useImageViewerImage({ files, currentIndex });

  const transition = useImageViewerTransition({
    files,
    currentIndex,
    displaySrc: image.displaySrc,
    loadAt: image.loadAt,
    preloadNext: image.preloadNext
  });

  const settingsOpen = ref(false);
  const fullscreen = ref(false);
  const loop = ref(false);
  const showThumbnails = ref(true);
  const showBottom = ref(true);
  const uiVisible = ref(true);
  const hasPrev = computed(() => loop.value || currentIndex.value > 0);
  const hasNext = computed(() => loop.value || currentIndex.value < files.value.length - 1);
  const thumbCache = ref<Map<string, string>>(new Map());
  let fsCleanup: (() => void) | null = null;

  const { start: startIdle, stop: stopIdle } = useTimeoutFn(() => {
    uiVisible.value = false;
  }, 3000);

  const debouncedZoom = useDebounceFn((delta: number) => {
    if (delta < 0) image.zoomIn();
    else image.zoomOut();
  }, 50);

  const slideshow = useImageViewerSlideshow({
    files: files.value,
    currentIndex,
    hasNext,
    loop,
    uiVisible,
    showBottom,
    settingsOpen,
    usingHighRes: image.usingHighRes,
    kenStyle: image.kenStyle,
    navigate: transition.navigateTo,
    next: () => transition.next(hasNext),
    loadAt: image.loadAt,
    resetIdleTimer,
    stopIdle
  });

  const { slideshowActive, stopSlideshow } = slideshow;

  function resetIdleTimer() {
    uiVisible.value = true;
    if (!slideshowActive.value || !slideshow.autoHideUI.value) return;
    stopIdle();
    startIdle();
  }

  function onMouseMove() {
    resetIdleTimer();
  }
  function handleClose() {
    if (slideshowActive.value) stopSlideshow();
    if (fullscreen.value) window.api?.invoke('window:exitFullscreen');
    emit.close();
  }

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

  function onWheel(e: WheelEvent) {
    debouncedZoom(e.deltaY);
  }

  const onKeydown = createImageKeyHandler({
    settingsOpen,
    uiVisible,
    slideshowActive,
    hasPrev,
    hasNext,
    handleClose,
    prev: () => transition.prev(hasPrev),
    next: () => transition.next(hasNext),
    zoomIn: image.zoomIn,
    zoomOut: image.zoomOut,
    rotate: image.rotate,
    toggleFullscreen,
    stopIdle,
    toggleSlideshow: slideshow.toggleSlideshow
  });

  const currentFile = computed(() => files.value[currentIndex.value] ?? null);

  watch([() => props.files, () => props.initialIndex], ([newFiles, idx]) => {
    if (newFiles.length === 0) return;
    currentIndex.value = idx;
    image.loadInitial();
  });

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
    image.loadInitial();
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('mousemove', onMouseMove);
    if (fsCleanup) {
      fsCleanup();
      fsCleanup = null;
    }
    stopSlideshow();
    transition.stopTransition();
    if (fullscreen.value) {
      window.api?.invoke('window:exitFullscreen');
    }
  });

  return {
    currentIndex,
    scale: image.scale,
    rotation: image.rotation,
    displaySrc: image.displaySrc,
    oldSrc: transition.oldSrc,
    imgError: transition.imgError,
    settingsOpen,
    fullscreen,
    loop,
    showThumbnails,
    showBottom,
    uiVisible,
    transitionType: transition.transitionType,
    transitionDuration: transition.transitionDuration,
    newStyle: transition.newStyle,
    oldStyle: transition.oldStyle,
    thumbCache,
    currentFile,
    hasPrev,
    hasNext,
    slideshowActive,
    slideshowInterval: slideshow.slideshowInterval,
    slideshowProgress: slideshow.slideshowProgress,
    kenBurns: slideshow.kenBurns,
    shuffleSlideshow: slideshow.shuffleSlideshow,
    autoHideUI: slideshow.autoHideUI,
    prev: () => transition.prev(hasPrev),
    next: () => transition.next(hasNext),
    goTo: transition.goTo,
    zoomIn: image.zoomIn,
    zoomOut: image.zoomOut,
    rotate: image.rotate,
    fitToScreen: image.fitToScreen,
    changeInterval: slideshow.changeInterval,
    handleClose,
    toggleSlideshow: slideshow.toggleSlideshow,
    toggleFullscreen,
    onImageLoaded: transition.onImageLoaded,
    onImageError: transition.onImageError,
    onWheel,
    makeTransform: image.makeTransform
  };
}
