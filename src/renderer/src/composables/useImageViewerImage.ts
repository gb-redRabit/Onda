import { ref, reactive } from 'vue';
import type { Ref } from 'vue';
import { toMediaServerUrl, loadScaledImageUrl } from '@renderer/utils/imageLoader';
import { useTimeoutFn } from './useTimers';
import type { FileItem } from '@renderer/types/explorer';

interface ImageViewerImageDeps {
  files: Ref<FileItem[]>;
  currentIndex: Ref<number>;
}

export function useImageViewerImage(deps: ImageViewerImageDeps) {
  const scale = ref(1);
  const rotation = ref(0);
  const kenStyle = reactive({ scale: 1, translateX: 0, translateY: 0 });
  const displaySrc = ref('');
  const usingHighRes = ref(false);
  let currentObjectUrl: string | null = null;

  function toFileUrl(file: FileItem): string {
    return toMediaServerUrl(file.path);
  }

  async function loadDisplayImage(file: FileItem, maxWidth: number = 1920): Promise<string> {
    try {
      const url = await loadScaledImageUrl(file.path, maxWidth);
      if (currentObjectUrl) {
        const stale = currentObjectUrl;
        setTimeout(() => URL.revokeObjectURL(stale), 1000);
      }
      currentObjectUrl = url;
      return url;
    } catch {
      return toFileUrl(file);
    }
  }

  const { start: startHighRes, stop: stopHighRes } = useTimeoutFn(() => {
    const file = deps.files.value[deps.currentIndex.value];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      displaySrc.value = toFileUrl(file);
      usingHighRes.value = true;
    };
    img.src = toFileUrl(file);
  }, 200);

  function loadAt(idx: number) {
    const file = deps.files.value[idx];
    if (!file) return;
    deps.currentIndex.value = idx;
    usingHighRes.value = false;
    loadDisplayImage(file, 1920).then((url) => {
      displaySrc.value = url;
    });
  }

  function loadInitial() {
    usingHighRes.value = false;
    const file = deps.files.value[deps.currentIndex.value];
    if (file) {
      loadDisplayImage(file, 1920).then((url) => {
        displaySrc.value = url;
      });
      preloadNext();
    }
  }

  function preloadNext() {
    const nextFile = deps.files.value[deps.currentIndex.value + 1];
    if (!nextFile) return;
    const img = new Image();
    img.src = toFileUrl(nextFile);
  }

  function scheduleHighRes() {
    stopHighRes();
    const file = deps.files.value[deps.currentIndex.value];
    if (!file) return;
    if (scale.value > 1.5) {
      startHighRes();
    } else if (usingHighRes.value) {
      usingHighRes.value = false;
      loadDisplayImage(file, 1920).then((url) => {
        displaySrc.value = url;
      });
    }
  }

  function fitToScreen() {
    scale.value = 1;
    rotation.value = 0;
    kenStyle.scale = 1;
    kenStyle.translateX = 0;
    kenStyle.translateY = 0;
    scheduleHighRes();
  }

  function zoomIn() {
    scale.value = Math.min(scale.value * 1.3, 5);
    scheduleHighRes();
  }

  function zoomOut() {
    scale.value = Math.max(scale.value / 1.3, 0.2);
    if (scale.value <= 1.5 && usingHighRes.value) {
      usingHighRes.value = false;
      const file = deps.files.value[deps.currentIndex.value];
      if (file) {
        loadDisplayImage(file, 1920).then((url) => {
          displaySrc.value = url;
        });
      }
    }
  }

  function rotate() {
    rotation.value = (rotation.value + 90) % 360;
  }

  function makeTransform(base: string): string {
    const s = scale.value * kenStyle.scale;
    return `${base} scale3d(${s},${s},1) rotate(${rotation.value}deg) translateX(${kenStyle.translateX}px) translateY(${kenStyle.translateY}px)`;
  }

  return {
    scale,
    rotation,
    kenStyle,
    displaySrc,
    usingHighRes,
    loadAt,
    loadInitial,
    preloadNext,
    scheduleHighRes,
    stopHighRes,
    fitToScreen,
    zoomIn,
    zoomOut,
    rotate,
    makeTransform
  };
}
