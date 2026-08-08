<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { PanelBottom } from '@lucide/vue';
import type { FileItem } from '@renderer/types/explorer';

const props = defineProps<{
  files: FileItem[];
  currentIndex: number;
  thumbCache: Map<string, string>;
  visible: boolean;
  showThumbs: boolean;
  scale: number;
  rotation: number;
  currentFile: FileItem | null;
}>();

const emit = defineEmits<{
  (e: 'goTo', idx: number): void;
  (e: 'update:showThumbs', val: boolean): void;
}>();

const ITEM_W = 68; // 64px thumb + 4px gap
const WINDOW = 30; // thumbs rendered on each side of currentIndex

const stripRef = ref<HTMLElement | null>(null);
let thumbObserver: IntersectionObserver | null = null;

const windowStart = computed(() => Math.max(0, props.currentIndex - WINDOW));
const windowEnd = computed(() => Math.min(props.files.length - 1, props.currentIndex + WINDOW));

const visibleThumbs = computed(() => {
  const out: { file: FileItem; idx: number }[] = [];
  for (let i = windowStart.value; i <= windowEnd.value; i++) {
    out.push({ file: props.files[i], idx: i });
  }
  return out;
});

const totalWidth = computed(() => props.files.length * ITEM_W);

const pendingBatch = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function loadThumbnail(file: FileItem) {
  if (props.thumbCache.has(file.path) || !window.api) return;
  props.thumbCache.set(file.path, '');
  pendingBatch.add(file.path);
  if (batchTimer === null) {
    batchTimer = setTimeout(flushBatch, 40);
  }
}

async function flushBatch() {
  batchTimer = null;
  if (pendingBatch.size === 0) return;
  const paths = [...pendingBatch];
  pendingBatch.clear();
  try {
    const result = (await window.api?.invoke('media:batchThumbnails', paths, 320)) as
      | Record<string, string>
      | undefined;
    for (const p of paths) {
      const dataUrl = result?.[p];
      if (dataUrl) props.thumbCache.set(p, dataUrl);
    }
  } catch {
    /* batch thumb fail, ignore */
  }
}

function setupThumbObserver() {
  thumbObserver?.disconnect();
  if (!stripRef.value) return;
  const els = stripRef.value.querySelectorAll('[data-thumb-idx]');
  thumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const idx = Number(entry.target.getAttribute('data-thumb-idx'));
        if (entry.isIntersecting) {
          const f = props.files[idx];
          if (f) loadThumbnail(f);
        }
      });
    },
    { root: stripRef.value, rootMargin: '100px' }
  );
  els.forEach((el) => thumbObserver!.observe(el));
}

function scrollToCurrent() {
  if (!stripRef.value) return;
  const strip = stripRef.value;
  const targetLeft = props.currentIndex * ITEM_W - strip.offsetWidth / 2 + 32;
  strip.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
}

function preloadNearby() {
  const half = WINDOW + 4;
  const start = Math.max(0, props.currentIndex - half);
  const end = Math.min(props.files.length - 1, props.currentIndex + half);
  for (let i = start; i <= end; i++) {
    const f = props.files[i];
    if (f && !props.thumbCache.has(f.path)) loadThumbnail(f);
  }
}

watch(
  () => props.showThumbs,
  (val) => {
    if (val)
      nextTick(() => {
        setupThumbObserver();
        scrollToCurrent();
      });
    else thumbObserver?.disconnect();
  }
);
watch(
  () => props.files.length,
  () => {
    nextTick(setupThumbObserver);
  }
);
watch(
  () => props.currentIndex,
  () => {
    preloadNearby();
    if (props.showThumbs)
      nextTick(() => {
        setupThumbObserver();
        scrollToCurrent();
      });
  }
);

onMounted(() => {
  nextTick(setupThumbObserver);
});
onBeforeUnmount(() => {
  thumbObserver?.disconnect();
  if (batchTimer !== null) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
});
</script>

<template>
  <div
    class="shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
    :class="visible ? 'max-h-50 opacity-100' : 'max-h-0 opacity-0'"
  >
    <div
      v-if="files.length > 1"
      ref="stripRef"
      class="relative px-3 py-2 bg-bg-overlay/60 border-t border-border-default/20 overflow-x-auto transition-all duration-200"
      :class="showThumbs ? 'h-20' : 'h-0 py-0 overflow-hidden'"
      @click.stop
    >
      <div class="relative h-full" :style="{ width: totalWidth + 'px' }">
        <template v-for="item in visibleThumbs" :key="item.file.path">
          <div
            :data-thumb-idx="item.idx"
            class="absolute top-0 rounded-md overflow-hidden border-2 transition-all cursor-pointer flex items-center justify-center"
            :class="[
              item.idx === currentIndex
                ? 'border-accent-base ring-1 ring-accent-base/30'
                : 'border-transparent',
              thumbCache.get(item.file.path) && item.idx !== currentIndex
                ? 'brightness-50 hover:brightness-75'
                : ''
            ]"
            :style="{
              left: item.idx * ITEM_W + 'px',
              width: '60px',
              height: '48px'
            }"
            @click="emit('goTo', item.idx)"
          >
            <img
              v-if="thumbCache.get(item.file.path)"
              :src="thumbCache.get(item.file.path)!"
              :alt="item.file.name"
              class="w-full h-full object-cover"
              draggable="false"
              loading="lazy"
            />
            <span v-else class="text-[10px] text-fg-faint">{{ item.idx + 1 }}</span>
          </div>
        </template>
      </div>
    </div>

    <div
      class="flex items-center justify-between px-4 py-1.5 bg-bg-elevated/60 text-xs text-fg-faint"
    >
      <div class="flex items-center gap-2">
        <button
          class="p-1 rounded transition-colors"
          :class="showThumbs ? 'text-accent-base' : 'text-fg-muted hover:text-fg-base'"
          title="Toggle thumbnails"
          @click="emit('update:showThumbs', !showThumbs)"
        >
          <PanelBottom :size="14" class="pointer-events-none" />
        </button>
        <div class="w-px h-3 bg-border-default/30" />
        <span>{{ currentIndex + 1 }} / {{ files.length }}</span>
        <span v-if="currentFile" class="text-fg-muted truncate max-w-50">{{
          currentFile.name
        }}</span>
      </div>
      <div class="flex items-center gap-2 text-fg-muted">
        <span v-if="scale !== 1">{{ Math.round(scale * 100) }}%</span>
        <span v-if="rotation !== 0">{{ rotation }}°</span>
      </div>
    </div>
  </div>
</template>
