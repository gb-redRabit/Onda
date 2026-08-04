<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Images } from '@lucide/vue';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import type { MediaFile } from '@renderer/types/media';

const props = defineProps<{
  images: MediaFile[];
}>();
const emit = defineEmits<{
  open: [index: number];
}>();

const imageGridRef = ref<HTMLElement | null>(null);
const imageCols = ref(6);
const imageCellSize = ref(180);

const imageRowVirtualizer = useVirtualizer({
  get count() {
    return Math.ceil(props.images.length / imageCols.value);
  },
  getScrollElement: () => imageGridRef.value,
  estimateSize: () => imageCellSize.value + 52,
  overscan: 3
});

let rowObserver: ResizeObserver | null = null;

function updateImageCols() {
  const el = imageGridRef.value;
  if (!el) return;
  const w = el.clientWidth;
  const cols = Math.max(2, Math.floor(w / 200));
  imageCols.value = cols;
  const gaps = (cols - 1) * 12;
  imageCellSize.value = Math.max(120, Math.floor((w - 44 - gaps) / cols));
  imageRowVirtualizer.value.measure();
}

const visibleImages = computed(() => {
  const items = imageRowVirtualizer.value.getVirtualItems();
  const cols = imageCols.value;
  const result: Array<{ top: number; items: Array<{ img: MediaFile; index: number }> }> = [];
  for (const row of items) {
    const start = row.index * cols;
    const end = Math.min(start + cols, props.images.length);
    result.push({
      top: row.start,
      items: props.images.slice(start, end).map((img, i) => ({ img, index: start + i }))
    });
  }
  return result;
});

onMounted(() => {
  updateImageCols();
  if (imageGridRef.value) {
    rowObserver = new ResizeObserver(() => updateImageCols());
    rowObserver.observe(imageGridRef.value);
  }
});
onUnmounted(() => {
  rowObserver?.disconnect();
  rowObserver = null;
});
</script>

<template>
  <div v-if="images.length === 0" class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint">
    <Images :size="48" class="opacity-30" />
    <p class="text-sm">{{ $t('library.noImages') }}</p>
    <p class="text-xs">{{ $t('library.addFolderHint') }}</p>
  </div>
  <template v-else>
    <div class="flex items-center justify-between px-4 py-2 border-b border-border-default shrink-0">
      <span class="text-xs text-fg-faint">{{ images.length }} {{ $t('library.files') }}</span>
    </div>
    <div ref="imageGridRef" class="flex-1 overflow-auto p-4">
      <div :style="{ height: imageRowVirtualizer.getTotalSize() + 'px', position: 'relative' }">
        <div
          v-for="row in visibleImages"
          :key="'imgr-' + row.top"
          :style="{
            position: 'absolute',
            top: row.top + 'px',
            left: 0,
            width: '100%',
            display: 'flex',
            gap: '12px',
            padding: '6px'
          }"
        >
          <button
            v-for="item in row.items"
            :key="item.img.path"
            class="group rounded-xl overflow-hidden bg-bg-elevated border border-border-default hover:border-accent-base transition-colors text-left flex flex-col shrink-0"
            :style="{ width: imageCellSize + 'px' }"
            :title="item.img.name"
            @click="emit('open', item.index)"
          >
            <div class="aspect-square bg-bg-base overflow-hidden flex items-center justify-center">
              <img
                :src="toMediaServerUrl(item.img.path)"
                :alt="item.img.name"
                class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
            </div>
            <div class="px-2.5 py-2 min-w-0">
              <div class="text-xs font-medium truncate">{{ item.img.name }}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </template>
</template>