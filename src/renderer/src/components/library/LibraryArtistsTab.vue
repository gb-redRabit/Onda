<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Mic2, LayoutList, LayoutGrid } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';

const props = defineProps<{
  artists: Array<[string, MediaFile[]]>;
  viewMode: 'list' | 'grid';
}>();
const emit = defineEmits<{
  'update:viewMode': [mode: 'list' | 'grid'];
  playTracks: [tracks: MediaFile[]];
}>();

const artistListRef = ref<HTMLElement | null>(null);
const artistListVirtualizer = useVirtualizer({
  get count() {
    return props.artists.length;
  },
  getScrollElement: () => artistListRef.value,
  estimateSize: () => 48,
  overscan: 10
});

const artistGridRef = ref<HTMLElement | null>(null);
const grid = useVirtualGrid(artistGridRef, 180, 5);

const artistRowVirtualizer = useVirtualizer({
  get count() {
    return Math.ceil(props.artists.length / grid.cols.value);
  },
  getScrollElement: () => artistGridRef.value,
  estimateSize: () => 150,
  overscan: 3
});

const visibleArtists = computed(() => {
  const items = artistRowVirtualizer.value.getVirtualItems();
  const cols = grid.cols.value;
  const result: Array<{ top: number; artists: Array<[string, MediaFile[]]> }> = [];
  for (const row of items) {
    const start = row.index * cols;
    const end = Math.min(start + cols, props.artists.length);
    result.push({
      top: row.start,
      artists: props.artists.slice(start, end)
    });
  }
  return result;
});

onMounted(() => grid.observe());
onUnmounted(() => grid.destroy());
</script>

<template>
  <div
    v-if="artists.length === 0"
    class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint"
  >
    <Mic2 :size="48" class="opacity-30" />
    <p class="text-sm">{{ $t('library.noArtists') }}</p>
  </div>
  <template v-else>
    <div
      class="flex items-center justify-between px-4 py-2 border-b border-border-default shrink-0"
    >
      <span class="text-xs text-fg-faint"
        >{{ artists.length }} {{ $t('library.tracksCount') }}</span
      >
      <div class="flex items-center gap-2">
        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="
            viewMode === 'list'
              ? 'bg-accent-ghost text-accent-base'
              : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
          "
          :title="$t('library.viewModeList')"
          @click="emit('update:viewMode', 'list')"
        >
          <LayoutList :size="14" />
        </button>
        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="
            viewMode === 'grid'
              ? 'bg-accent-ghost text-accent-base'
              : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
          "
          :title="$t('library.viewModeGrid')"
          @click="emit('update:viewMode', 'grid')"
        >
          <LayoutGrid :size="14" />
        </button>
      </div>
    </div>

    <template v-if="viewMode === 'list'">
      <div ref="artistListRef" class="flex-1 overflow-auto">
        <div
          :style="{
            height: artistListVirtualizer.getTotalSize() + 'px',
            width: '100%',
            position: 'relative'
          }"
        >
          <div
            v-for="v in artistListVirtualizer.getVirtualItems()"
            :key="'arl-' + v.key"
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
              @click="emit('playTracks', artists[v.index][1])"
            >
              <div
                class="w-8 h-8 rounded-full bg-accent-ghost flex items-center justify-center shrink-0"
              >
                <Mic2 :size="14" class="text-accent-base" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ artists[v.index][0] }}</div>
                <div class="text-xs text-fg-faint">
                  {{ artists[v.index][1].length }} {{ $t('library.tracksCount') }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div ref="artistGridRef" class="flex-1 overflow-auto p-4">
        <div :style="{ height: artistRowVirtualizer.getTotalSize() + 'px', position: 'relative' }">
          <div
            v-for="row in visibleArtists"
            :key="'arg-' + row.top"
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
              v-for="[name, tracks] in row.artists"
              :key="name"
              class="flex-1 min-w-0 flex flex-col items-center p-4 rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all text-center"
              @click="emit('playTracks', tracks)"
            >
              <div
                class="w-16 h-16 rounded-full bg-accent-ghost flex items-center justify-center mb-2"
              >
                <Mic2 :size="24" class="text-accent-base" />
              </div>
              <div class="text-sm font-medium truncate w-full">{{ name }}</div>
              <div class="text-xs text-fg-faint mt-0.5">
                {{ tracks.length }} {{ $t('library.tracksCount') }}
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>
  </template>
</template>
