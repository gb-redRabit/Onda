<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance } from 'vue';
import { ChevronLeft, Disc3, ListPlus, Play } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useVirtualList } from '@renderer/composables/useVirtualList';
import { playTrackList } from '@renderer/utils/playTracks';
import { groupLabel } from '@renderer/utils/libraryLabels';
import MediaCover from '@renderer/components/MediaCover.vue';
import type { MediaFile } from '@renderer/types/media';

type AlbumEntry = [label: string, tracks: MediaFile[]];

const library = useLibraryStore();
const player = usePlayerStore();
const selectedKey = ref<string | null>(null);
const albums = computed(() => library.albums as AlbumEntry[]);

function albumKey(album: AlbumEntry): string {
  const first = album[1][0];
  return `${album[0]}::${first?.metadata?.albumArtist || first?.metadata?.artist || ''}`;
}

// Trzymamy klucz, nie tablicę utworów: po rescanie biblioteki otwarty album
// dalej pokazuje aktualne dane (albo wraca do siatki, jeśli zniknął).
const selected = computed<AlbumEntry | null>(() => {
  if (selectedKey.value === null) return null;
  return albums.value.find((album) => albumKey(album) === selectedKey.value) ?? null;
});

// Siatka 2-kolumnowa jest wirtualizowana wierszami — duże biblioteki nie
// montują setek okładek naraz. Wysokość wiersza mierzymy, bo zależy od
// szerokości okna (okładka jest kwadratowa).
const COLUMNS = 2;
const scrollEl = ref<HTMLElement | null>(null);
const rowCount = computed(() => Math.ceil(albums.value.length / COLUMNS));
const virtualizer = useVirtualList({
  count: () => rowCount.value,
  scrollEl: () => scrollEl.value,
  estimateSize: () => 236,
  overscan: 3,
  measureElement: (element) => element.getBoundingClientRect().height
});

interface AlbumCell {
  album: AlbumEntry;
  index: number;
}

function rowCells(rowIndex: number): AlbumCell[] {
  const start = rowIndex * COLUMNS;
  return albums.value
    .slice(start, start + COLUMNS)
    .map((album, offset) => ({ album, index: start + offset }));
}

function measureRow(node: Element | ComponentPublicInstance | null): void {
  if (node instanceof HTMLElement) virtualizer.value.measureElement(node);
}

// Lista utworów w szczegółach albumu też jest wirtualizowana — albumy
// kompilacyjne potrafią mieć setki pozycji.
const detailScrollEl = ref<HTMLElement | null>(null);
const detailVirtualizer = useVirtualList({
  count: () => selected.value?.[1].length ?? 0,
  scrollEl: () => detailScrollEl.value,
  estimateSize: () => 32,
  overscan: 6,
  measureElement: (element) => element.getBoundingClientRect().height
});

function measureDetailRow(node: Element | ComponentPublicInstance | null): void {
  if (node instanceof HTMLElement) detailVirtualizer.value.measureElement(node);
}

function trackTitle(track: MediaFile | undefined): string {
  if (!track) return '';
  return track.metadata?.title || track.name;
}

function playAlbum(album: AlbumEntry): void {
  playTrackList(album[1]);
}

function playFrom(album: AlbumEntry, index: number): void {
  playTrackList(album[1].slice(index));
}

function addAlbumToQueue(album: AlbumEntry): void {
  for (const track of album[1]) player.addToQueue(track);
}

function addFrom(album: AlbumEntry, index: number): void {
  const track = album[1][index];
  if (track) player.addToQueue(track);
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0" data-testid="compact-albums">
    <template v-if="!selected">
      <div
        v-if="!albums.length"
        class="px-4 py-8 flex flex-col items-center gap-2 text-center text-[12px] text-base-content/50"
      >
        <Disc3 :size="22" />
        {{ $t('compact.emptyAlbums') }}
      </div>
      <div v-else ref="scrollEl" class="flex-1 min-h-0 overflow-auto compact-scroll px-2 py-2">
        <div class="relative" :style="{ height: `${virtualizer.getTotalSize()}px` }">
          <div
            v-for="row in virtualizer.getVirtualItems()"
            :key="String(row.key)"
            :ref="measureRow"
            :data-index="row.index"
            class="absolute top-0 left-0 w-full grid grid-cols-2 gap-2 pb-2"
            :style="{ transform: `translateY(${row.start}px)` }"
          >
            <button
              v-for="cell in rowCells(row.index)"
              :key="cell.index"
              class="text-left p-1.5 rounded-field hover:bg-base-content/5 transition-colors"
              :data-testid="`compact-album-${cell.index}`"
              @click="selectedKey = albumKey(cell.album)"
            >
              <span class="block aspect-square rounded-md overflow-hidden bg-base-300">
                <MediaCover :path="cell.album[1][0]?.path" :size="160" fallback="disc" />
              </span>
              <span class="block mt-1.5 text-[12px] font-medium truncate">{{
                groupLabel(cell.album[0], $t)
              }}</span>
              <span class="block text-[10px] text-base-content/50 truncate">
                {{
                  cell.album[1][0]?.metadata?.albumArtist ||
                  cell.album[1][0]?.metadata?.artist ||
                  '—'
                }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-2 px-2 py-2 shrink-0">
        <button
          class="flex items-center gap-1 text-[11px] text-base-content/60 hover:text-base-content"
          data-testid="compact-album-back"
          @click="selectedKey = null"
        >
          <ChevronLeft :size="14" />
          {{ $t('compact.back') }}
        </button>
      </div>
      <div class="px-3 pb-2 flex items-center gap-3 shrink-0" data-testid="compact-album-detail">
        <span class="w-20 h-20 rounded-lg overflow-hidden bg-base-300 shrink-0">
          <MediaCover :path="selected[1][0]?.path" :size="80" fallback="disc" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold truncate">{{
            groupLabel(selected[0], $t)
          }}</span>
          <span class="block text-[11px] text-base-content/55 truncate">
            {{ selected[1][0]?.metadata?.albumArtist || selected[1][0]?.metadata?.artist || '—' }}
          </span>
          <button
            class="mt-2 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-field bg-primary text-primary-content text-[11px] font-medium hover:brightness-110"
            data-testid="compact-play-album"
            @click="playAlbum(selected)"
          >
            <Play :size="12" />
            {{ $t('compact.playAlbum') }}
          </button>
          <button
            class="mt-2 ml-1.5 inline-grid place-items-center w-7 h-7 rounded-field border border-base-300 text-base-content/60 hover:text-primary-text hover:bg-primary/10"
            :title="$t('compact.addAlbumToQueue')"
            :aria-label="$t('compact.addAlbumToQueue')"
            data-testid="compact-add-album-queue"
            @click="addAlbumToQueue(selected)"
          >
            <ListPlus :size="14" />
          </button>
        </span>
      </div>
      <div ref="detailScrollEl" class="flex-1 min-h-0 overflow-auto compact-scroll px-2 pb-2">
        <div class="relative" :style="{ height: `${detailVirtualizer.getTotalSize()}px` }">
          <div
            v-for="row in detailVirtualizer.getVirtualItems()"
            :key="String(row.key)"
            :ref="measureDetailRow"
            :data-index="row.index"
            class="absolute top-0 left-0 w-full flex items-center gap-1 px-2 py-1.5 rounded-field text-left hover:bg-base-content/5 transition-colors group"
            :style="{ transform: `translateY(${row.start}px)` }"
          >
            <button
              class="flex min-w-0 flex-1 items-center gap-2 text-left"
              :data-testid="`compact-album-track-${row.index}`"
              @click="playFrom(selected, row.index)"
            >
              <span class="w-5 text-[10px] text-base-content/35 tabular-nums">{{
                row.index + 1
              }}</span>
              <span class="min-w-0 flex-1">
                <span class="block text-[12px] truncate">{{
                  trackTitle(selected[1][row.index])
                }}</span>
              </span>
              <Play :size="11" class="text-base-content/30" />
            </button>
            <button
              class="grid place-items-center w-7 h-7 shrink-0 rounded-field text-base-content/35 hover:text-primary-text hover:bg-primary/10 transition-colors"
              :title="$t('compact.addToQueue')"
              :aria-label="$t('compact.addToQueue')"
              :data-testid="`compact-album-track-add-${row.index}`"
              @click.stop="addFrom(selected, row.index)"
            >
              <ListPlus :size="14" />
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
