<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive } from 'vue';
import { useTimeoutFn, useIntervalFn, useRafFn, useDebounceFn } from '@vueuse/core';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import type { FileItem } from '@renderer/types/explorer';
import ImageViewerThumbnails from './ImageViewerThumbnails.vue';
import ImageViewerToolbar from './ImageViewerToolbar.vue';
import { logger } from '@shared/logger';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { computeEnterStart, computeOldExit } from '@renderer/utils/imageTransitions';

const props = defineProps<{
  files: FileItem[];
  initialIndex: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const NON_RANDOM_TYPES = [
  'fade',
  'slide',
  'zoom',
  'swirl',
  'slideUp',
  'slideDown',
  'zoomOut'
] as const;

const currentIndex = ref(props.initialIndex);
const scale = ref(1);
const rotation = ref(0);
const displaySrc = ref('');
const oldSrc = ref('');
const imgError = ref(false);
const slideshowActive = ref(false);
const slideshowInterval = ref(3000);
const transitionType = ref<string>('fade');
const activeTransition = ref<string>('fade');
const transitionDuration = ref(500);
const direction = ref<'next' | 'prev'>('next');
const transitioning = ref(false);
const settingsOpen = ref(false);
const fullscreen = ref(false);
const loop = ref(false);
const showThumbnails = ref(true);
const slideshowProgress = ref(0);
const kenBurns = ref(false);
const shuffleSlideshow = ref(false);
const usingHighRes = ref(false);
const showBottom = ref(true);
const autoHideUI = ref(true);
const uiVisible = ref(true);
let shuffleOrder: number[] = [];

// --- VueUse timer composables (auto-cleanup on unmount) ---

const progressStep = computed(() => 100 / (slideshowInterval.value / 16));

const { start: startTransition, stop: stopTransition } = useTimeoutFn(
  endTransition,
  transitionDuration
);

const { start: startIdle, stop: stopIdle } = useTimeoutFn(() => {
  uiVisible.value = false;
}, 3000);

const { start: startHighRes, stop: stopHighRes } = useTimeoutFn(() => {
  const file = currentFile.value;
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    displaySrc.value = toFileUrl(file);
    usingHighRes.value = true;
  };
  img.src = toFileUrl(file);
}, 200);

const { pause: pauseProgress, resume: resumeProgress } = useIntervalFn(
  () => {
    slideshowProgress.value = Math.min(slideshowProgress.value + progressStep.value, 100);
  },
  16,
  { immediate: false }
);

const { pause: pauseKen, resume: resumeKen } = useRafFn(
  () => {
    if (!kenBurns.value || !slideshowActive.value) {
      pauseKen();
      return;
    }
    const elapsed = performance.now() % slideshowInterval.value;
    const t = elapsed / slideshowInterval.value;
    kenStyle.scale = 1 + t * 0.15;
    kenStyle.translateX = t * 2;
    kenStyle.translateY = t * 1;
  },
  { immediate: false }
);

const debouncedZoom = useDebounceFn((delta: number) => {
  if (delta < 0) zoomIn();
  else zoomOut();
}, 50);

// ---

function resetIdleTimer() {
  if (!slideshowActive.value || !autoHideUI.value) {
    uiVisible.value = true;
    return;
  }
  uiVisible.value = true;
  stopIdle();
  startIdle();
}

function onMouseMove() {
  resetIdleTimer();
}

const currentFile = computed(() => props.files[currentIndex.value] ?? null);
const hasPrev = computed(() => loop.value || currentIndex.value > 0);
const hasNext = computed(() => loop.value || currentIndex.value < props.files.length - 1);

const newStyle = reactive({
  opacity: 1,
  transform: 'translateX(0) scale3d(1,1,1)',
  filter: 'blur(0px)'
});
const oldStyle = reactive({
  opacity: 0,
  transform: 'translateX(0) scale3d(1,1,1)',
  filter: 'blur(0px)'
});
const kenStyle = reactive({ scale: 1, translateX: 0, translateY: 0 });

const thumbCache = ref<Map<string, string>>(new Map());
let fsCleanup: (() => void) | null = null;
let currentObjectUrl: string | null = null;

function toFileUrl(file: FileItem): string {
  return toMediaServerUrl(file.path);
}

async function loadDisplayImage(file: FileItem, maxWidth: number = 1920): Promise<string> {
  try {
    const resp = await fetch(`onda:///?path=${encodeURIComponent(file.path)}&w=${maxWidth}`);
    if (!resp.ok) throw new Error(resp.statusText);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
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

function getEnterStart() {
  return computeEnterStart(activeTransition.value, direction.value);
}

function getOldExit() {
  return computeOldExit(activeTransition.value, direction.value);
}

function fitToScreen() {
  scale.value = 1;
  rotation.value = 0;
  kenStyle.scale = 1;
  kenStyle.translateX = 0;
  kenStyle.translateY = 0;
  scheduleHighRes();
}

function scheduleHighRes() {
  stopHighRes();
  const file = currentFile.value;
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

function onImageLoaded() {
  if (!transitioning.value) return;
  nextTick(() => {
    Object.assign(newStyle, {
      opacity: 1,
      transform: 'translateX(0) scale3d(1,1,1)',
      filter: 'blur(0px)'
    });
    Object.assign(oldStyle, getOldExit());
    startTransition();
  });
}

function onImageError() {
  if (transitioning.value) {
    imgError.value = true;
    endTransition();
  }
}

function endTransition() {
  Object.assign(oldStyle, {
    opacity: 0,
    transform: 'translateX(0) scale3d(1,1,1)',
    filter: 'blur(0px)'
  });
  oldSrc.value = '';
  transitioning.value = false;
}

function navigateTo(newIdx: number, dir: 'prev' | 'next') {
  if (transitioning.value || newIdx === currentIndex.value) return;
  direction.value = dir;
  if (transitionType.value === 'random') {
    activeTransition.value = NON_RANDOM_TYPES[Math.floor(Math.random() * NON_RANDOM_TYPES.length)];
  } else {
    activeTransition.value = transitionType.value;
  }
  if (displaySrc.value) oldSrc.value = displaySrc.value;
  currentIndex.value = newIdx;
  transitioning.value = true;
  imgError.value = false;

  const enterStart = getEnterStart();
  Object.assign(newStyle, {
    opacity: 0,
    transform: enterStart.transform,
    filter: enterStart.filter
  });

  const file = props.files[newIdx];
  if (!file) {
    transitioning.value = false;
    return;
  }

  usingHighRes.value = false;
  loadDisplayImage(file, 1920).then((url) => {
    displaySrc.value = url;
  });
  preloadNext();
}

function preloadNext() {
  const nextIdx = currentIndex.value + 1;
  if (nextIdx >= props.files.length) return;
  const nextFile = props.files[nextIdx];
  if (!nextFile) return;
  const img = new Image();
  img.src = toFileUrl(nextFile);
}

function prev() {
  if (!hasPrev.value) return;
  const idx = currentIndex.value - 1;
  navigateTo(idx < 0 ? props.files.length - 1 : idx, 'prev');
}

function next() {
  if (!hasNext.value) return;
  const idx = currentIndex.value + 1;
  navigateTo(idx >= props.files.length ? 0 : idx, 'next');
}

function goTo(idx: number) {
  if (idx === currentIndex.value) return;
  navigateTo(idx, idx > currentIndex.value ? 'next' : 'prev');
}

function zoomIn() {
  scale.value = Math.min(scale.value * 1.3, 5);
  scheduleHighRes();
}
function zoomOut() {
  scale.value = Math.max(scale.value / 1.3, 0.2);
  if (scale.value <= 1.5 && usingHighRes.value) {
    usingHighRes.value = false;
    loadDisplayImage(currentFile.value!, 1920).then((url) => {
      displaySrc.value = url;
    });
  }
}
function rotate() {
  rotation.value = (rotation.value + 90) % 360;
}

function toggleSlideshow() {
  if (slideshowActive.value) stopSlideshow();
  else startSlideshow();
}

function startSlideshow() {
  slideshowActive.value = true;
  settingsOpen.value = false;
  slideshowProgress.value = 0;
  showBottom.value = false;
  uiVisible.value = true;
  if (props.files.length < 2) {
    stopSlideshow();
    return;
  }
  if (autoHideUI.value) resetIdleTimer();
  if (shuffleSlideshow.value) {
    shuffleOrder = [...Array(props.files.length).keys()].filter((i) => i !== currentIndex.value);
    for (let i = shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
    }
  }
  runProgress();
  scheduleAdvance();
}

const { start: scheduleAdvance, stop: cancelAdvance } = useTimeoutFn(() => {
  if (!slideshowActive.value) return;
  if (shuffleSlideshow.value && shuffleOrder.length > 0) {
    const nextIdx = shuffleOrder.shift()!;
    navigateTo(nextIdx, 'next');
    runProgress();
    scheduleAdvance();
  } else if (hasNext.value) {
    next();
    runProgress();
    scheduleAdvance();
  } else if (loop.value) {
    const file = props.files[0];
    if (file) {
      currentIndex.value = 0;
      usingHighRes.value = false;
      loadDisplayImage(file, 1920).then((url) => {
        displaySrc.value = url;
      });
    }
    runProgress();
    scheduleAdvance();
  } else {
    stopSlideshow();
  }
}, slideshowInterval);

function runProgress() {
  pauseProgress();
  slideshowProgress.value = 0;
  resumeProgress();
  if (kenBurns.value) resumeKen();
}

function stopSlideshow() {
  slideshowActive.value = false;
  slideshowProgress.value = 0;
  showBottom.value = true;
  uiVisible.value = true;
  stopIdle();
  kenStyle.scale = 1;
  kenStyle.translateX = 0;
  kenStyle.translateY = 0;
  pauseKen();
  cancelAdvance();
  pauseProgress();
}

function changeInterval(ms: number) {
  slideshowInterval.value = ms;
  if (slideshowActive.value) {
    stopSlideshow();
    startSlideshow();
  }
}

function handleClose() {
  if (slideshowActive.value) stopSlideshow();
  if (fullscreen.value) window.api?.invoke('window:exitFullscreen');
  emit('close');
}

function toggleFullscreen() {
  window.api
    ?.invoke('window:toggleFullscreen')
    .then((fs) => {
      fullscreen.value = !!fs;
    })
    .catch((err) => logger.error('ImageViewer', 'toggleFullscreen', err));
}

function onWheel(e: WheelEvent) {
  debouncedZoom(e.deltaY);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (settingsOpen.value) {
      settingsOpen.value = false;
      return;
    }
    handleClose();
  } else if (e.key === 'ArrowLeft') {
    prev();
  } else if (e.key === 'ArrowRight') {
    next();
  } else if (e.key === '+' || e.key === '=') {
    zoomIn();
  } else if (e.key === '-') {
    zoomOut();
  } else if (e.key === 'r') {
    rotate();
  } else if (e.key === 'f') {
    toggleFullscreen();
  } else if (e.key === 'h') {
    if (slideshowActive.value) {
      uiVisible.value = !uiVisible.value;
      stopIdle();
    }
  } else if (e.key === ' ') {
    e.preventDefault();
    toggleSlideshow();
  }
}

function onFullscreenChange(fs: unknown) {
  fullscreen.value = !!fs;
}

watch([() => props.files, () => props.initialIndex], ([files, idx]) => {
  if (files.length === 0) return;
  currentIndex.value = idx;
  const file = files[idx];
  if (file) {
    usingHighRes.value = false;
    loadDisplayImage(file, 1920).then((url) => {
      displaySrc.value = url;
    });
    preloadNext();
  }
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
  const file = currentFile.value;
  if (file) {
    usingHighRes.value = false;
    loadDisplayImage(file, 1920).then((url) => {
      displaySrc.value = url;
    });
    preloadNext();
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('mousemove', onMouseMove);
  if (fsCleanup) {
    fsCleanup();
    fsCleanup = null;
  }
  stopSlideshow();
  stopTransition();
  if (fullscreen.value) {
    window.api?.invoke('window:exitFullscreen');
  }
});

function makeTransform(base: string): string {
  const s = scale.value * kenStyle.scale;
  return `${base} scale3d(${s},${s},1) rotate(${rotation.value}deg) translateX(${kenStyle.translateX}px) translateY(${kenStyle.translateY}px)`;
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex flex-col bg-bg-base/95 select-none"
    :class="slideshowActive && !uiVisible ? 'cursor-none' : ''"
    @click.self="handleClose"
  >
    <div class="flex-1 flex flex-row min-h-0 relative">
      <div
        class="absolute inset-0 flex items-center justify-center overflow-hidden contain-layout"
        @wheel.prevent="onWheel"
      >
        <button
          v-if="hasPrev && !slideshowActive"
          class="absolute left-3 z-10 p-2 rounded-full bg-bg-overlay/60 text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-all"
          @click="prev"
        >
          <ChevronLeft :size="28" class="pointer-events-none" />
        </button>

        <div class="flex items-center justify-center w-full h-full p-8 contain-layout">
          <img
            v-if="oldSrc"
            :src="oldSrc"
            class="absolute inset-0 max-w-full max-h-full m-auto pointer-events-none"
            :style="{
              ...oldStyle,
              transition: `all ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              transform: makeTransform(oldStyle.transform),
              willChange: 'transform, opacity, filter'
            }"
            draggable="false"
          />
          <img
            v-show="displaySrc && !imgError"
            :key="currentIndex"
            :src="displaySrc"
            class="absolute inset-0 max-w-full max-h-full m-auto"
            :style="{
              ...newStyle,
              transition: `all ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              transform: makeTransform(newStyle.transform),
              willChange: 'transform, opacity, filter'
            }"
            draggable="false"
            @load="onImageLoaded"
            @error="onImageError"
            @dblclick="fitToScreen"
          />
          <div v-if="!displaySrc && !oldSrc" class="text-fg-faint text-sm">
            <div v-if="imgError">Failed to load image</div>
            <div v-else class="flex flex-col items-center gap-3">
              <div
                class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
              />
              <span class="text-xs">Loading...</span>
            </div>
          </div>
        </div>

        <button
          v-if="hasNext && !slideshowActive"
          class="absolute right-3 z-10 p-2 rounded-full mr-12 bg-bg-overlay/60 text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-all"
          @click="next"
        >
          <ChevronRight :size="28" class="pointer-events-none" />
        </button>

        <div
          v-if="slideshowActive"
          class="absolute top-0 left-0 right-0 h-0.5 bg-border-default/30 z-10 transition-opacity duration-300"
          :class="uiVisible ? 'opacity-100' : 'opacity-0'"
        >
          <div
            class="h-full bg-accent-base transition-all duration-150 ease-linear"
            :style="{ width: slideshowProgress + '%' }"
          />
        </div>
      </div>

      <ImageViewerToolbar
        :slideshow-active="slideshowActive"
        :settings-open="settingsOpen"
        :slideshow-interval="slideshowInterval"
        :transition-type="transitionType"
        :transition-duration="transitionDuration"
        :loop="loop"
        :shuffle="shuffleSlideshow"
        :ken-burns="kenBurns"
        :auto-hide="autoHideUI"
        :fullscreen="fullscreen"
        :ui-visible="uiVisible"
        @close="handleClose"
        @toggle-slideshow="toggleSlideshow"
        @toggle-settings="settingsOpen = !settingsOpen"
        @fit-to-screen="fitToScreen"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @rotate="rotate"
        @toggle-fullscreen="toggleFullscreen"
        @update:interval="changeInterval"
        @update:transition-type="transitionType = $event"
        @update:transition-duration="transitionDuration = $event"
        @update:loop="loop = $event"
        @update:shuffle="shuffleSlideshow = $event"
        @update:ken-burns="kenBurns = $event"
        @update:auto-hide="autoHideUI = $event"
      />
    </div>

    <ImageViewerThumbnails
      :files="files"
      :current-index="currentIndex"
      :thumb-cache="thumbCache"
      :visible="showBottom"
      :show-thumbs="showThumbnails"
      :scale="scale"
      :rotation="rotation"
      :current-file="currentFile"
      @go-to="goTo"
      @update:show-thumbs="showThumbnails = $event"
    />

    <div v-if="settingsOpen" class="fixed inset-0 z-10" @click="settingsOpen = false" />
  </div>
</template>
