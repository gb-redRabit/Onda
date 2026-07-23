<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive } from 'vue';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2, Play, Pause, Settings2, Fullscreen, PanelBottom, Clock, Repeat, GripHorizontal } from '@lucide/vue';
import type { FileItem } from '@renderer/types/explorer';

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon',
  tiff: 'image/tiff', tif: 'image/tif'
};

const props = defineProps<{
  files: FileItem[];
  initialIndex: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const SLIDESHOW_INTERVALS = [1000, 2000, 3000, 5000, 10000] as const;
const TRANSITION_TYPES = ['fade', 'slide', 'zoom', 'swirl'] as const;
const TRANSITION_DURATIONS = [200, 400, 500, 600, 800, 1000] as const;

const currentIndex = ref(props.initialIndex);
const scale = ref(1);
const rotation = ref(0);
const displaySrc = ref('');
const oldSrc = ref('');
const imgError = ref(false);
const slideshowActive = ref(false);
const slideshowInterval = ref(3000);
const transitionType = ref<'fade' | 'slide' | 'zoom' | 'swirl'>('fade');
const transitionDuration = ref(500);
const direction = ref<'next' | 'prev'>('next');
const transitioning = ref(false);
const settingsOpen = ref(false);
const fullscreen = ref(false);
const loop = ref(false);
const showThumbnails = ref(true);
const slideshowProgress = ref(0);
let slideshowTimer: ReturnType<typeof setTimeout> | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let transitionTimer: ReturnType<typeof setTimeout> | null = null;

const currentFile = computed(() => props.files[currentIndex.value] ?? null);
const hasPrev = computed(() => loop.value || currentIndex.value > 0);
const hasNext = computed(() => loop.value || currentIndex.value < props.files.length - 1);
const counter = computed(() => `${currentIndex.value + 1} / ${props.files.length}`);

const newStyle = reactive({ opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0px)' });
const oldStyle = reactive({ opacity: 0, transform: 'translateX(0) scale(1)', filter: 'blur(0px)' });

// thumbnail cache
const thumbCache = new Map<string, string>();
const thumbWindow = computed(() => {
  const range = 4;
  const start = Math.max(0, currentIndex.value - range);
  const end = Math.min(props.files.length - 1, currentIndex.value + range);
  const indices: number[] = [];
  for (let i = start; i <= end; i++) indices.push(i);
  return indices;
});

function loadThumbnail(file: FileItem) {
  if (thumbCache.has(file.path)) return;
  thumbCache.set(file.path, '');
  if (window.api) {
    window.api.invoke('fs:readFile', file.path).then((b64: any) => {
      if (b64) {
        const mime = getMimeType(file.extension);
        thumbCache.set(file.path, `data:${mime};base64,${b64}`);
      }
    }).catch(() => {});
  }
}

watch(thumbWindow, (indices) => {
  indices.forEach(i => { const f = props.files[i]; if (f) loadThumbnail(f); });
}, { immediate: true });

function computeEnterStart() {
  switch (transitionType.value) {
    case 'fade': return { opacity: 0, transform: 'translateX(0) scale(1)', filter: 'blur(0px)' };
    case 'slide':
      return direction.value === 'next'
        ? { opacity: 1, transform: 'translateX(15%) scale(0.95)', filter: 'blur(4px)' }
        : { opacity: 1, transform: 'translateX(-15%) scale(0.95)', filter: 'blur(4px)' };
    case 'zoom': return { opacity: 0, transform: 'translateX(0) scale(0.7)', filter: 'blur(0px)' };
    case 'swirl': return { opacity: 0, transform: 'translateX(0) scale(0.5) rotate(-15deg)', filter: 'blur(6px)' };
    default: return { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0px)' };
  }
}

function computeOldExit() {
  switch (transitionType.value) {
    case 'fade': return { opacity: 0, transform: 'translateX(0) scale(1.05)', filter: 'blur(0px)' };
    case 'slide':
      return direction.value === 'next'
        ? { opacity: 0, transform: 'translateX(-15%) scale(0.95)', filter: 'blur(4px)' }
        : { opacity: 0, transform: 'translateX(15%) scale(0.95)', filter: 'blur(4px)' };
    case 'zoom': return { opacity: 0, transform: 'translateX(0) scale(1.2)', filter: 'blur(0px)' };
    case 'swirl': return { opacity: 0, transform: 'translateX(0) scale(1.3) rotate(15deg)', filter: 'blur(6px)' };
    default: return { opacity: 0, transform: 'translateX(0) scale(1)', filter: 'blur(0px)' };
  }
}

function fitToScreen() { scale.value = 1; rotation.value = 0; }

function getMimeType(ext?: string): string {
  return MIME_MAP[ext?.replace('.', '').toLowerCase() || ''] || 'image/jpeg';
}

async function loadImage(file: FileItem): Promise<string> {
  if (!file) return '';
  imgError.value = false;
  try {
    if (window.api) {
      const b64 = await window.api.invoke('fs:readFile', file.path) as string | null;
      if (b64) { const mime = getMimeType(file.extension); return `data:${mime};base64,${b64}`; }
    } else { return `file:///${file.path.replace(/\\/g, '/')}`; }
  } catch { /* noop */ }
  imgError.value = true;
  return '';
}

function navigateTo(newIdx: number, dir: 'prev' | 'next') {
  if (transitioning.value || newIdx === currentIndex.value) return;
  direction.value = dir;
  if (displaySrc.value) oldSrc.value = displaySrc.value;
  currentIndex.value = newIdx;
  transitioning.value = true;

  const enterStart = computeEnterStart();
  Object.assign(newStyle, { opacity: 0, transform: enterStart.transform, filter: enterStart.filter });

  const file = props.files[newIdx];
  if (!file) { transitioning.value = false; return; }

  loadImage(file).then(src => {
    if (!src) { imgError.value = true; endTransition(); return; }
    displaySrc.value = src;
    nextTick(() => {
      Object.assign(newStyle, { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0px)' });
      Object.assign(oldStyle, computeOldExit());
      transitionTimer = setTimeout(endTransition, transitionDuration.value);
    });
  });
}

function endTransition() {
  Object.assign(oldStyle, { opacity: 0, transform: 'translateX(0) scale(1)', filter: 'blur(0px)' });
  oldSrc.value = '';
  transitioning.value = false;
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

function zoomIn() { scale.value = Math.min(scale.value * 1.3, 5); }
function zoomOut() { scale.value = Math.max(scale.value / 1.3, 0.2); }
function rotate() { rotation.value = (rotation.value + 90) % 360; }

function toggleSlideshow() {
  if (slideshowActive.value) stopSlideshow(); else startSlideshow();
}

function startSlideshow() {
  slideshowActive.value = true;
  settingsOpen.value = false;
  slideshowProgress.value = 0;
  if (props.files.length < 2) { stopSlideshow(); return; }
  advanceWhenReady();
}

function advanceWhenReady() {
  if (!slideshowActive.value) return;
  if (hasNext.value) {
    next(); runProgress();
    slideshowTimer = setTimeout(advanceWhenReady, slideshowInterval.value);
  } else if (loop.value) {
    const firstIdx = 0;
    currentIndex.value = firstIdx;
    const file = props.files[firstIdx];
    if (file) loadImage(file).then(src => { if (src) displaySrc.value = src; });
    runProgress();
    slideshowTimer = setTimeout(advanceWhenReady, slideshowInterval.value);
  } else {
    stopSlideshow();
  }
}

function runProgress() {
  if (progressTimer) clearInterval(progressTimer);
  slideshowProgress.value = 0;
  const step = 100 / (slideshowInterval.value / 16);
  progressTimer = setInterval(() => {
    slideshowProgress.value = Math.min(slideshowProgress.value + step, 100);
  }, 16);
}

function stopSlideshow() {
  slideshowActive.value = false; slideshowProgress.value = 0;
  if (slideshowTimer !== null) { clearTimeout(slideshowTimer); slideshowTimer = null; }
  if (progressTimer !== null) { clearInterval(progressTimer); progressTimer = null; }
}

function changeInterval(ms: number) {
  slideshowInterval.value = ms;
  if (slideshowActive.value) { stopSlideshow(); startSlideshow(); }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    fullscreen.value = true;
  } else {
    document.exitFullscreen();
    fullscreen.value = false;
  }
}

function onWheel(e: WheelEvent) {
  if (e.deltaY < 0) zoomIn(); else zoomOut();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (settingsOpen.value) { settingsOpen.value = false; return; }
    stopSlideshow();
    if (fullscreen.value) { document.exitFullscreen(); fullscreen.value = false; }
    emit('close');
  } else if (e.key === 'ArrowLeft') { prev(); }
  else if (e.key === 'ArrowRight') { next(); }
  else if (e.key === '+' || e.key === '=') { zoomIn(); }
  else if (e.key === '-') { zoomOut(); }
  else if (e.key === 'r') { rotate(); }
  else if (e.key === 'f') { toggleFullscreen(); }
  else if (e.key === ' ') { e.preventDefault(); toggleSlideshow(); }
}

function onFullscreenChange() { fullscreen.value = !!document.fullscreenElement; }

watch([() => props.files, () => props.initialIndex], ([files, idx]) => {
  if (files.length === 0) return;
  currentIndex.value = idx;
  const file = files[idx];
  if (file) loadImage(file).then(src => { if (src) displaySrc.value = src; });
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  const file = currentFile.value;
  if (file) loadImage(file).then(src => { if (src) displaySrc.value = src; });
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  stopSlideshow();
  if (transitionTimer !== null) clearTimeout(transitionTimer);
  if (fullscreen.value) document.exitFullscreen();
});
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex flex-col bg-black/95 select-none"
    @click.self="emit('close')"
  >
    <div class="flex-1 flex flex-row min-h-0">
      <!-- image area -->
      <div
        class="flex-1 flex items-center justify-center relative overflow-hidden"
        @wheel.prevent="onWheel"
      >
        <button
          v-if="hasPrev && !slideshowActive"
          class="absolute left-3 z-10 p-2 rounded-full bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-all"
          @click="prev"
        >
          <ChevronLeft :size="28" class="pointer-events-none" />
        </button>

        <div class="flex items-center justify-center w-full h-full p-8">
          <img
            v-if="oldSrc"
            :src="oldSrc"
            class="absolute inset-0 max-w-full max-h-full m-auto pointer-events-none"
            :style="{
              ...oldStyle,
              transition: `all ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              transform: `${oldStyle.transform} scale(${scale}) rotate(${rotation}deg)`,
              willChange: 'transform, opacity, filter'
            }"
            draggable="false"
          />
          <img
            v-show="displaySrc && !imgError"
            :src="displaySrc"
            :key="currentIndex"
            class="absolute inset-0 max-w-full max-h-full m-auto"
            :style="{
              ...newStyle,
              transition: `all ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              transform: `${newStyle.transform} scale(${scale}) rotate(${rotation}deg)`,
              willChange: 'transform, opacity, filter'
            }"
            draggable="false"
            @error="imgError = true"
            @dblclick="fitToScreen"
          />
          <div v-if="!displaySrc && !oldSrc" class="text-fg-faint text-sm">
            <div v-if="imgError">Failed to load image</div>
            <div v-else class="flex flex-col items-center gap-3">
              <div class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin" />
              <span class="text-xs">Loading...</span>
            </div>
          </div>
        </div>

        <button
          v-if="hasNext && !slideshowActive"
          class="absolute right-3 z-10 p-2 rounded-full bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-all"
          @click="next"
        >
          <ChevronRight :size="28" class="pointer-events-none" />
        </button>

        <div
          v-if="slideshowActive"
          class="absolute top-0 left-0 right-0 h-0.5 bg-white/10 z-10"
        >
          <div
            class="h-full bg-accent-base transition-all duration-150 ease-linear"
            :style="{ width: slideshowProgress + '%' }"
          />
        </div>
      </div>

      <!-- toolbar on the right -->
      <div class="relative flex flex-col items-center px-2 py-3 bg-black/60 gap-1 shrink-0" @click.stop>
        <button
          class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
          title="Close (Esc)"
          @click="emit('close')"
        >
          <X :size="16" class="pointer-events-none" />
        </button>
        <div class="flex-1" />

        <div class="flex flex-col items-center gap-1">
          <div class="relative">
            <button
              class="p-1.5 rounded-lg transition-colors"
              :class="slideshowActive ? 'text-accent-base bg-accent-ghost' : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'"
              :title="slideshowActive ? 'Stop slideshow (Space)' : 'Start slideshow (Space)'"
              @click="toggleSlideshow"
            >
              <span v-show="!slideshowActive"><Play :size="16" class="pointer-events-none" /></span>
              <span v-show="slideshowActive"><Pause :size="16" class="pointer-events-none" /></span>
            </button>
            <button
              class="p-1 rounded-lg transition-colors block mx-auto mt-0.5"
              :class="settingsOpen ? 'text-accent-base bg-accent-ghost' : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'"
              title="Slideshow settings"
              @click="settingsOpen = !settingsOpen"
            >
              <Settings2 :size="12" class="pointer-events-none" />
            </button>
            <div
              v-if="settingsOpen"
              class="absolute right-full mr-2 top-0 bg-surface-dialog border border-border-default rounded-lg shadow-xl p-3 min-w-[220px] z-20"
              @click.stop
            >
              <div class="text-xs font-semibold text-fg-base mb-2 tracking-wide uppercase">Slideshow</div>

              <div class="text-[11px] text-fg-muted mb-1 flex items-center gap-1">
                <Clock :size="11" class="pointer-events-none" /> Interval
              </div>
              <div class="flex flex-wrap gap-1 mb-2">
                <button
                  v-for="ms in SLIDESHOW_INTERVALS"
                  :key="ms"
                  class="px-2 py-1 text-xs rounded-md transition-colors"
                  :class="slideshowInterval === ms ? 'bg-accent-base text-white' : 'bg-bg-hover text-fg-muted hover:text-fg-base'"
                  @click="changeInterval(ms)"
                >
                  {{ ms / 1000 + 's' }}
                </button>
              </div>

              <div class="text-[11px] text-fg-muted mb-1 flex items-center gap-1">
                <GripHorizontal :size="11" class="pointer-events-none" /> Transition
              </div>
              <div class="flex flex-wrap gap-1 mb-2">
                <button
                  v-for="type in TRANSITION_TYPES"
                  :key="type"
                  class="px-2 py-1 text-xs rounded-md capitalize transition-colors"
                  :class="transitionType === type ? 'bg-accent-base text-white' : 'bg-bg-hover text-fg-muted hover:text-fg-base'"
                  @click="transitionType = type"
                >
                  {{ type }}
                </button>
              </div>

              <div class="text-[11px] text-fg-muted mb-1 flex items-center gap-1">
                <Clock :size="11" class="pointer-events-none" /> Duration
              </div>
              <div class="flex flex-wrap gap-1 mb-2">
                <button
                  v-for="d in TRANSITION_DURATIONS"
                  :key="d"
                  class="px-2 py-1 text-xs rounded-md transition-colors"
                  :class="transitionDuration === d ? 'bg-accent-base text-white' : 'bg-bg-hover text-fg-muted hover:text-fg-base'"
                  @click="transitionDuration = d"
                >
                  {{ d }}ms
                </button>
              </div>

              <div class="flex items-center justify-between mb-1">
                <div class="text-[11px] text-fg-muted flex items-center gap-1">
                  <Repeat :size="11" class="pointer-events-none" /> Loop
                </div>
                <button
                  class="w-7 h-4 rounded-full transition-colors relative"
                  :class="loop ? 'bg-accent-base' : 'bg-bg-hover'"
                  @click="loop = !loop"
                >
                  <div
                    class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                    :class="loop ? 'translate-x-3.5' : 'translate-x-0.5'"
                  />
                </button>
              </div>
            </div>
          </div>

          <button
            class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
            title="Fit to screen"
            @click="fitToScreen"
          >
            <Maximize2 :size="16" class="pointer-events-none" />
          </button>
          <button
            class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
            title="Zoom In (+)"
            @click="zoomIn"
          >
            <ZoomIn :size="16" class="pointer-events-none" />
          </button>
          <button
            class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
            title="Zoom Out (-)"
            @click="zoomOut"
          >
            <ZoomOut :size="16" class="pointer-events-none" />
          </button>
          <button
            class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
            title="Rotate (R)"
            @click="rotate"
          >
            <RotateCw :size="16" class="pointer-events-none" />
          </button>
          <button
            class="p-1.5 rounded-lg transition-colors"
            :class="fullscreen ? 'text-accent-base bg-accent-ghost' : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'"
            :title="fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'"
            @click="toggleFullscreen"
          >
            <Fullscreen :size="16" class="pointer-events-none" />
          </button>
        </div>

        <div class="flex-1" />
      </div>
    </div>

    <!-- thumbnail strip -->
    <div
      v-if="files.length > 1"
      class="flex items-center gap-1 px-3 py-2 bg-black/50 border-t border-white/5 overflow-x-auto shrink-0 transition-all duration-200"
      :class="showThumbnails ? 'h-16' : 'h-0 py-0 overflow-hidden'"
      @click.stop
    >
      <template v-for="(file, idx) in files" :key="file.path">
        <div
          class="shrink-0 rounded-md overflow-hidden border-2 transition-all cursor-pointer flex items-center justify-center"
          :class="[
            idx === currentIndex ? 'border-accent-base ring-1 ring-accent-base/30' : 'border-transparent',
            thumbWindow.includes(idx) ? 'brightness-50 hover:brightness-75' : ''
          ]"
          :style="{ width: '64px', height: '48px' }"
          @click="goTo(idx)"
        >
          <img
            v-if="thumbCache.get(file.path)"
            :src="thumbCache.get(file.path)!"
            :alt="file.name"
            class="w-full h-full object-cover"
            draggable="false"
          />
          <span v-else class="text-[10px] text-fg-faint">{{ idx + 1 }}</span>
        </div>
      </template>
    </div>

    <!-- footer bar -->
    <div class="flex items-center justify-between px-4 py-1.5 bg-black/40 text-xs text-fg-faint shrink-0">
      <div class="flex items-center gap-2">
        <button
          class="p-1 rounded transition-colors"
          :class="showThumbnails ? 'text-accent-base' : 'text-fg-muted hover:text-fg-base'"
          title="Toggle thumbnails"
          @click="showThumbnails = !showThumbnails"
        >
          <PanelBottom :size="14" class="pointer-events-none" />
        </button>
        <div class="w-px h-3 bg-white/10" />
        <span>{{ counter }}</span>
        <span v-if="currentFile" class="text-fg-muted truncate max-w-[200px]">{{ currentFile.name }}</span>
      </div>
      <div class="flex items-center gap-2 text-fg-muted">
        <span v-if="scale !== 1">{{ Math.round(scale * 100) }}%</span>
        <span v-if="rotation !== 0">{{ rotation }}°</span>
      </div>
    </div>

    <div v-if="settingsOpen" class="fixed inset-0 z-10" @click="settingsOpen = false" />
  </div>
</template>
