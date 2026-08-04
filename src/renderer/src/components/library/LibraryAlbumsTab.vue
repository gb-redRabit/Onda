<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Disc3, LayoutList, LayoutGrid } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import AlbumCard from '@renderer/components/library/AlbumCard.vue';

const props = defineProps<{
  albums: Array<[string, MediaFile[]]>;
  viewMode: 'list' | 'grid';
}>();
const emit = defineEmits<{
  'update:viewMode': [mode: 'list' | 'grid'];
  playTracks: [tracks: MediaFile[]];
}>();

const albumListRef = ref<HTMLElement | null>(null);
const albumListVirtualizer = useVirtualizer({
  get count() {
    return props.albums.length;
  },
  getScrollElement: () => albumListRef.value,
  estimateSize: () => 48,
  overscan: 10
});

const albumGridRef = ref<HTMLElement | null>(null);
const grid = useVirtualGrid(albumGridRef, 200, 5);

const albumRowVirtualizer = useVirtualizer({
  get count() {
    return Math.ceil(props.albums.length / grid.cols.value);
  },
  getScrollElement: () => albumGridRef.value,
  estimateSize: () => 210,
  overscan: 3
});

const visibleAlbums = computed(() => {
  const items = albumRowVirtualizer.value.getVirtualItems();
  const cols = grid.cols.value;
  const result: Array<{ top: number; albums: Array<[string, MediaFile[]]> }> = [];
  for (const row of items) {
    const start = row.index * cols;
    const end = Math.min(start + cols, props.albums.length);
    result.push({
      top: row.start,
      albums: props.albums.slice(start, end)
    });
  }
  return result;
});

onMounted(() => grid.observe());
onUnmounted(() => grid.destroy());
</script>

<template>
  <div v-if="albums.length === 0" class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint">
    <Disc3 :size="48" class="opacity-30" />
    <p class="text-sm">{{ $t('library.noAlbums') }}</p>
  </div>
  <template v-else>
    <div class="flex items-center justify-between px-4 py-2 border-b border-border-default shrink-0">
      <span class="text-xs text-fg-faint">{{ albums.length }} {{ $t('library.tracksCount') }}</span>
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
      </div>
    </div>

    <template v-if="viewMode === 'list'">
      <div ref="albumListRef" class="flex-1 overflow-auto">
        <div :style="{ height: albumListVirtualizer.getTotalSize() + 'px', width: '100%', position: 'relative' }">
          <div
            v-for="v in albumListVirtualizer.getVirtualItems()"
            :key="'al-' + v.key"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: v.size + 'px',
              transform: 'translateY(' + v.start + 'px)'
            }"
          >
            <div
              class="flex items-center gap-3 px-4 py-2 hover:bg-bg-hover transition-colors cursor-pointer h-full"
              @click="emit('playTracks', albums[v.index][1])"
            >
              <div class="w-8 h-8 rounded-lg bg-accent-ghost flex items-center justify-center shrink-0">
                <Disc3 :size="14" class="text-accent-base" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ albums[v.index][0] }}</div>
                <div class="text-xs text-fg-faint">{{ albums[v.index][1].length }} {{ $t('library.tracksCount') }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div ref="albumGridRef" class="flex-1 overflow-auto p-4">
        <div :style="{ height: albumRowVirtualizer.getTotalSize() + 'px', position: 'relative' }">
          <div
            v-for="row in visibleAlbums"
            :key="'ar-' + row.top"
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
            <AlbumCard
              v-for="[name, tracks] in row.albums"
              :key="name"
              :name="name"
              :tracks="tracks"
              @play="emit('playTracks', $event)"
            />
          </div>
        </div>
      </div>
    </template>
  </template>
</template>