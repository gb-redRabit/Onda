<script setup lang="ts">
import { computed, ref } from 'vue';
import { Music2, Play, Search } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useVirtualList } from '@renderer/composables/useVirtualList';
import { playTrackList } from '@renderer/utils/playTracks';
import MediaCover from '@renderer/components/MediaCover.vue';
import type { MediaFile } from '@renderer/types/media';

const library = useLibraryStore();
const player = usePlayerStore();

const query = ref('');
const scrollEl = ref<HTMLElement | null>(null);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const audioTracks = computed(() => library.audioTracks.filter((track) => track.type === 'audio'));
const sorted = computed(() =>
  [...audioTracks.value].sort((a, b) => collator.compare(trackTitle(a), trackTitle(b)))
);
const results = computed(() => {
  const q = query.value.trim();
  if (!q) return sorted.value;
  return library.search(q).filter((track) => track.type === 'audio');
});

const virtualizer = useVirtualList({
  count: () => results.value.length,
  scrollEl: () => scrollEl.value,
  estimateSize: () => 48,
  overscan: 8
});

function trackTitle(track: MediaFile | undefined): string {
  if (!track) return '';
  return track.metadata?.title || track.name;
}

function trackArtist(track: MediaFile | undefined): string {
  if (!track) return '';
  return track.metadata?.artist || track.metadata?.album || '';
}

function formatDuration(value: number | undefined): string {
  if (!value || !Number.isFinite(value)) return '';
  const total = Math.floor(value);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function playAt(index: number): void {
  const track = results.value[index];
  if (track) playTrackList([track]);
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0" data-testid="compact-tracks">
    <div class="px-3 py-2 shrink-0">
      <label class="relative block">
        <Search
          :size="13"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40"
        />
        <input
          v-model="query"
          type="search"
          :placeholder="$t('compact.searchPlaceholder')"
          :aria-label="$t('compact.searchPlaceholder')"
          class="w-full h-8 pl-8 pr-2 rounded-field bg-base-100 border border-base-300 text-[12px] outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
          data-testid="compact-search"
        />
      </label>
    </div>

    <div v-if="!library.isLoaded" class="px-4 py-6 text-[12px] text-base-content/50">
      {{ $t('compact.loading') }}
    </div>
    <div
      v-else-if="!results.length"
      class="px-4 py-8 flex flex-col items-center gap-2 text-center text-[12px] text-base-content/50"
    >
      <Music2 :size="20" />
      {{ query ? $t('compact.noResults') : $t('compact.emptyLibrary') }}
    </div>

    <div v-else ref="scrollEl" class="flex-1 min-h-0 overflow-auto compact-scroll">
      <div class="relative" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <button
          v-for="row in virtualizer.getVirtualItems()"
          :key="String(row.key)"
          class="absolute top-0 left-0 w-full px-2 flex items-center gap-2.5 text-left rounded-field hover:bg-base-content/5 transition-colors group"
          :style="{ transform: `translateY(${row.start}px)`, height: `${row.size}px` }"
          :data-testid="`compact-track-${row.index}`"
          @click="playAt(row.index)"
        >
          <span class="w-8 h-8 rounded overflow-hidden bg-base-300 shrink-0 relative">
            <MediaCover :path="results[row.index]?.path" :size="32" />
            <span
              class="absolute inset-0 hidden group-hover:grid place-items-center bg-black/45 text-white"
            >
              <Play :size="13" />
            </span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[12px] truncate">{{ trackTitle(results[row.index]) }}</span>
            <span class="block text-[10px] text-base-content/50 truncate">
              {{ trackArtist(results[row.index]) }}
            </span>
          </span>
          <span class="text-[10px] tabular-nums text-base-content/40 shrink-0">
            {{ formatDuration(results[row.index]?.duration) }}
          </span>
          <span
            v-if="player.currentTrack?.path === results[row.index]?.path"
            class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
            :aria-label="$t('compact.nowPlaying')"
          />
        </button>
      </div>
    </div>
  </div>
</template>
