<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Disc3, LayoutList, LayoutGrid } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import AlbumCard from '@renderer/components/library/AlbumCard.vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { usePlayerStore } from '@renderer/stores/player';

const props = defineProps<{
  albums: Array<[string, MediaFile[]]>;
  viewMode: 'list' | 'grid';
}>();
const emit = defineEmits<{
  'update:viewMode': [mode: 'list' | 'grid'];
  playTracks: [tracks: MediaFile[]];
}>();

const player = usePlayerStore();

function onAlbumHover(path: string) {
  if (path) player.loadCover(path);
}

const sortKey = ref<'name' | 'count' | 'year'>('name');
const sortedAlbums = computed(() => {
  const list = [...props.albums];
  if (sortKey.value === 'count') list.sort((a, b) => b[1].length - a[1].length);
  else if (sortKey.value === 'year')
    list.sort((a, b) => (b[1][0]?.metadata?.year || 0) - (a[1][0]?.metadata?.year || 0));
  else list.sort((a, b) => a[0].localeCompare(b[0]));
  return list;
});

const albumListRef = ref<HTMLElement | null>(null);
const albumListVirtualizer = useVirtualizer({
  get count() {
    return sortedAlbums.value.length;
  },
  getScrollElement: () => albumListRef.value,
  estimateSize: () => 56,
  overscan: 10
});

const albumGridRef = ref<HTMLElement | null>(null);
const grid = useVirtualGrid(albumGridRef, 200, 5);

const albumRowVirtualizer = useVirtualizer({
  get count() {
    return Math.ceil(sortedAlbums.value.length / grid.cols.value);
  },
  getScrollElement: () => albumGridRef.value,
  estimateSize: () => 256,
  overscan: 3
});

const visibleAlbums = computed(() => {
  const items = albumRowVirtualizer.value.getVirtualItems();
  const cols = grid.cols.value;
  const result: Array<{ top: number; albums: Array<[string, MediaFile[]]> }> = [];
  for (const row of items) {
    const start = row.index * cols;
    const end = Math.min(start + cols, sortedAlbums.value.length);
    result.push({
      top: row.start,
      albums: sortedAlbums.value.slice(start, end)
    });
  }
  return result;
});

onMounted(() => grid.observe());
onUnmounted(() => grid.destroy());
</script>

<template>
  <div
    v-if="albums.length === 0"
    class="flex flex-col items-center justify-center h-full gap-3 text-base-content/50"
  >
    <Disc3 :size="48" class="opacity-30" />
    <p class="text-sm">{{ $t('library.noAlbums') }}</p>
  </div>
  <template v-else>
    <div
      class="flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-100/50 backdrop-blur shrink-0 sticky top-0 z-[1]"
    >
      <span class="text-xs font-medium text-base-content/60"
        >{{ albums.length }} {{ $t('library.tracksCount') }}</span
      >
      <div class="flex items-center gap-1.5">
        <select
          v-model="sortKey"
          class="px-2 py-1 rounded-field bg-base-100 border border-base-300 text-xs focus:border-primary focus:outline-none"
        >
          <option value="name">Nazwa A→Z</option>
          <option value="count">Liczba utworów</option>
          <option value="year">Rok</option>
        </select>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="
            viewMode === 'list'
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 border border-base-300 text-base-content/50 hover:text-base-content hover:border-primary/30'
          "
          :title="$t('library.viewModeList')"
          @click="emit('update:viewMode', 'list')"
        >
          <LayoutList :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="
            viewMode === 'grid'
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 border border-base-300 text-base-content/50 hover:text-base-content hover:border-primary/30'
          "
          :title="$t('library.viewModeGrid')"
          @click="emit('update:viewMode', 'grid')"
        >
          <LayoutGrid :size="14" />
        </button>
      </div>
    </div>

    <template v-if="viewMode === 'list'">
      <div ref="albumListRef" class="flex-1 overflow-auto">
        <div
          :style="{
            height: albumListVirtualizer.getTotalSize() + 'px',
            width: '100%',
            position: 'relative'
          }"
        >
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
              class="flex items-center gap-3 px-4 py-2 hover:bg-base-100 border border-transparent hover:border-base-300 hover:shadow-sm rounded-field transition-all cursor-pointer h-full mx-2"
              @click="emit('playTracks', sortedAlbums[v.index][1])"
              @mouseenter="onAlbumHover(sortedAlbums[v.index][1][0]?.path || '')"
            >
              <div
                class="w-10 h-10 rounded-field overflow-hidden bg-base-200 border border-base-300 shrink-0 flex items-center justify-center"
              >
                <MediaCover
                  :path="sortedAlbums[v.index][1][0]?.path"
                  :size="16"
                  :render-as-video="false"
                  fallback="disc"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ sortedAlbums[v.index][0] }}</div>
                <div class="text-xs text-base-content/50 truncate">
                  {{ sortedAlbums[v.index][1][0]?.metadata?.artist || $t('common.unknown') }} ·
                  {{ sortedAlbums[v.index][1].length }} {{ $t('library.tracksCount') }}
                </div>
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
