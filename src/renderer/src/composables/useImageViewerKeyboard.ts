import type { Ref } from 'vue';

export interface ImageViewerKeyCtx {
  settingsOpen: Ref<boolean>;
  uiVisible: Ref<boolean>;
  slideshowActive: Ref<boolean>;
  hasPrev: Ref<boolean>;
  hasNext: Ref<boolean>;
  handleClose: () => void;
  prev: () => void;
  next: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  rotate: () => void;
  toggleFullscreen: () => void;
  stopIdle: () => void;
  toggleSlideshow: () => void;
}

export function createImageKeyHandler(ctx: ImageViewerKeyCtx) {
  return function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (ctx.settingsOpen.value) {
        ctx.settingsOpen.value = false;
        return;
      }
      ctx.handleClose();
    } else if (e.key === 'ArrowLeft') {
      ctx.prev();
    } else if (e.key === 'ArrowRight') {
      ctx.next();
    } else if (e.key === '+' || e.key === '=') {
      ctx.zoomIn();
    } else if (e.key === '-') {
      ctx.zoomOut();
    } else if (e.key === 'r') {
      ctx.rotate();
    } else if (e.key === 'f') {
      ctx.toggleFullscreen();
    } else if (e.key === 'h') {
      if (ctx.slideshowActive.value) {
        ctx.uiVisible.value = !ctx.uiVisible.value;
        ctx.stopIdle();
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      ctx.toggleSlideshow();
    }
  };
}
