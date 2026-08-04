<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Film, LayoutList, LayoutGrid } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import LibraryVideoRow from '@renderer/components/library/LibraryVideoRow.vue';
import VideoCard from '@renderer/components/library/VideoCard.vue';

const props = defineProps<{
  tracks: MediaFile[];
  viewMode: 'list' | 'grid';
}>();
const emit = defineEmits<{
  'update:viewMode': [mode: 'list' | 'grid'];
  play: [track: MediaFile];
  playAll: [];
}>();

const videoListRef = ref<HTMLElement | null>(null);
const videoListVirtualizer = useVirtualizer({
  get count() {
    return props.tracks.length;
  },
  getScrollElement: () => videoListRef.value,
  estimateSize: () => 48,
  overscan: 10
});

const videoGridRef = ref<HTMLElement | null>(null);
const grid = useVirtualGrid(videoGridRef, 210, 6);

const videoRowVirtualizer = useVirtualizer({
  get count() {
    return Math.ceil(props.tracks.length / grid.cols.value);
  },
  getScrollElement: () => videoGridRef.value,
  estimateSize: () => 220,
  overscan: 3
});

const visibleVideo = computed(() => {
  const items = videoRowVirtualizer.value.getVirtualItems();
  const cols = grid.cols.value;
  const result: Array<{ top: number; tracks: MediaFile[] }> = [];
  for (const row of items) {
    const start = row.index * cols;
    const end = Math.min(start + cols, props.tracks.length);
    result.push({
      top: row.start,
      tracks: props.tracks.slice(start, end)
    });
  }
  return result;
});

onMounted(() => grid.observe());
onUnmounted(() => grid.destroy());
</script>

<template>
  <div v-if="tracks.length === 0" class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint">
    <Film :size="48" class="opacity-30" />
    <p class="text-sm">{{ $t('library.noVideo') }}</p>
    <p class="text-xs">{{ $t('library.addFolderHint') }}</p>
  </div>
  <template v-else>
    <div class="flex items-center justify-between px-4 py-2 border-b border-border-default shrink-0">
      <span class="text-xs text-fg-faint">{{ tracks.length }} {{ $t('library.files') }}</span>
      <div class="flex items-center gap-2">
        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="viewMode === 'list' ? 'bg-accent-ghost text-accent-base' : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'"
          :title="$t('library.viewModeList')"
          @click="emit('update:viewMode', 'list')"
        >
          <LayoutList :size="14" />
        </button>
        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="viewMode === 'grid' ? 'bg-accent-ghost text-accent-base' : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'"
          :title="$t('library.viewModeGrid')"
          @click="emit('update:viewMode', 'grid')"
        >
          <LayoutGrid :size="14" />
        </button>
        <button
          class="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors"
          @click="emit('playAll')"
        >
          <Film :size="12" /> {{ $t('library.playAll') }}
        </button>
      </div>
    </div>

    <template v-if="viewMode === 'list'">
      <div ref="videoListRef" class="flex-1 overflow-auto">
        <div :style="{ height: videoListVirtualizer.getTotalSize() + 'px', width: '100%', position: 'relative' }">
          <div
            v-for="v in videoListVirtualizer.getVirtualItems()"
            :key="'vl-' + v.key"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: v.size + 'px',
              transform: 'translateY(' + v.start + 'px)'
            }"
          >
            <LibraryVideoRow :track="tracks[v.index]" @play="emit('play', $event)" />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div ref="videoGridRef" class="flex-1 overflow-auto p-4">
        <div :style="{ height: videoRowVirtualizer.getTotalSize() + 'px', position: 'relative' }">
          <div
            v-for="row in visibleVideo"
            :key="'vr-' + row.top"
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
            <VideoCard v-for="videoCard in row.tracks" :key="videoCard.path" :track="videoCard" @play="emit('play', $event)" />
          </div>
        </div>
      </div>
    </template>
  </template>
</template>