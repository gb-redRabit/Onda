<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { PanelBottom } from '@lucide/vue';
import type { FileItem } from '@renderer/types/explorer';
import { thumbTasks, processThumbQueue, thumbTaskDone } from '@renderer/utils/thumbLoader';

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

const stripRef = ref<HTMLElement | null>(null);
let thumbObserver: IntersectionObserver | null = null;

function loadThumbnail(file: FileItem) {
  if (props.thumbCache.has(file.path) || !window.api) return;
  props.thumbCache.set(file.path, '');
  thumbTasks.push(() => {
    window.api.invoke('media:getThumbnail', file.path, 320).then((dataUrl) => {
      if (dataUrl) props.thumbCache.set(file.path, dataUrl as string);
    }).catch(() => { /* thumb fail, ignore */ }).finally(() => { thumbTaskDone(); });
  });
  processThumbQueue();
}

function setupThumbObserver() {
  thumbObserver?.disconnect();
  if (!stripRef.value) return;
  const els = stripRef.value.querySelectorAll('[data-thumb-idx]');
  thumbObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const idx = Number(entry.target.getAttribute('data-thumb-idx'));
      if (entry.isIntersecting) {
        const f = props.files[idx];
        if (f) loadThumbnail(f);
      }
    });
  }, { root: stripRef.value, rootMargin: '100px' });
  els.forEach(el => thumbObserver!.observe(el));
}

function scrollToCurrent() {
  if (!stripRef.value) return;
  const el = stripRef.value.querySelector(`[data-thumb-idx="${props.currentIndex}"]`) as HTMLElement | null;
  if (!el) return;
  const strip = stripRef.value;
  const targetLeft = el.offsetLeft - strip.offsetWidth / 2 + el.offsetWidth / 2;
  strip.scrollTo({ left: targetLeft, behavior: 'smooth' });
}

function preloadNearby() {
  const half = 4;
  const start = Math.max(0, props.currentIndex - half);
  const end = Math.min(props.files.length - 1, props.currentIndex + half);
  for (let i = start; i <= end; i++) {
    const f = props.files[i];
    if (f && !props.thumbCache.has(f.path)) loadThumbnail(f);
  }
}

watch(() => props.showThumbs, (val) => { if (val) nextTick(() => { setupThumbObserver(); scrollToCurrent(); }); else thumbObserver?.disconnect(); });
watch(() => props.files.length, () => { nextTick(setupThumbObserver); });
watch(() => props.currentIndex, () => {
  preloadNearby();
  if (props.showThumbs) nextTick(scrollToCurrent);
});

onMounted(() => { nextTick(setupThumbObserver); });
onBeforeUnmount(() => { thumbObserver?.disconnect(); });
</script>

<template>
  <div
    class="shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
    :class="visible ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'"
  >
    <div
      v-if="files.length > 1"
      ref="stripRef"
      class="flex items-center gap-1 px-3 py-2 bg-bg-overlay/60 border-t border-border-default/20 overflow-x-auto transition-all duration-200"
      :class="showThumbs ? 'h-20' : 'h-0 py-0 overflow-hidden'"
      @click.stop
    >
      <template v-for="(file, idx) in files" :key="file.path">
        <div
          :data-thumb-idx="idx"
          class="shrink-0 rounded-md overflow-hidden border-2 transition-all cursor-pointer flex items-center justify-center"
          :class="[
            idx === currentIndex ? 'border-accent-base ring-1 ring-accent-base/30' : 'border-transparent',
            thumbCache.get(file.path) && idx !== currentIndex ? 'brightness-50 hover:brightness-75' : ''
          ]"
          :style="{ width: '64px', height: '48px' }"
          @click="emit('goTo', idx)"
        >
          <img
            v-if="thumbCache.get(file.path)"
            :src="thumbCache.get(file.path)!"
            :alt="file.name"
            class="w-full h-full object-cover"
            draggable="false"
            loading="lazy"
          />
          <span v-else class="text-[10px] text-fg-faint">{{ idx + 1 }}</span>
        </div>
      </template>
    </div>

    <div class="flex items-center justify-between px-4 py-1.5 bg-bg-elevated/60 text-xs text-fg-faint">
      <div class="flex items-center gap-2">
        <button class="p-1 rounded transition-colors" :class="showThumbs ? 'text-accent-base' : 'text-fg-muted hover:text-fg-base'" title="Toggle thumbnails" @click="emit('update:showThumbs', !showThumbs)">
          <PanelBottom :size="14" class="pointer-events-none" />
        </button>
        <div class="w-px h-3 bg-border-default/30" />
        <span>{{ currentIndex + 1 }} / {{ files.length }}</span>
        <span v-if="currentFile" class="text-fg-muted truncate max-w-[200px]">{{ currentFile.name }}</span>
      </div>
      <div class="flex items-center gap-2 text-fg-muted">
        <span v-if="scale !== 1">{{ Math.round(scale * 100) }}%</span>
        <span v-if="rotation !== 0">{{ rotation }}°</span>
      </div>
    </div>
  </div>
</template>
