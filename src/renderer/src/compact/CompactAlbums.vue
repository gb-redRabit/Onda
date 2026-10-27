<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronLeft, Disc3, Play } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import { playTrackList } from '@renderer/utils/playTracks';
import MediaCover from '@renderer/components/MediaCover.vue';
import type { MediaFile } from '@renderer/types/media';

type AlbumEntry = [label: string, tracks: MediaFile[]];

const library = useLibraryStore();
const selected = ref<AlbumEntry | null>(null);
const albums = computed(() => library.albums as AlbumEntry[]);

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
      <div v-else class="flex-1 min-h-0 overflow-auto compact-scroll px-2 py-2">
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="(album, index) in albums"
            :key="`${album[0]}-${index}`"
            class="text-left p-1.5 rounded-field hover:bg-base-content/5 transition-colors"
            :data-testid="`compact-album-${index}`"
            @click="selected = album"
          >
            <span class="block aspect-square rounded-md overflow-hidden bg-base-300">
              <MediaCover :path="album[1][0]?.path" :size="160" fallback="disc" />
            </span>
            <span class="block mt-1.5 text-[12px] font-medium truncate">{{ album[0] }}</span>
            <span class="block text-[10px] text-base-content/50 truncate">
              {{ album[1][0]?.metadata?.albumArtist || album[1][0]?.metadata?.artist || '—' }}
            </span>
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-2 px-2 py-2 shrink-0">
        <button
          class="flex items-center gap-1 text-[11px] text-base-content/60 hover:text-base-content"
          data-testid="compact-album-back"
          @click="selected = null"
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
          <span class="block text-sm font-semibold truncate">{{ selected[0] }}</span>
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
        </span>
      </div>
      <div class="flex-1 min-h-0 overflow-auto compact-scroll px-2 pb-2">
        <button
          v-for="(track, index) in selected[1]"
          :key="`${track.path}-${index}`"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-field text-left hover:bg-base-content/5 transition-colors"
          :data-testid="`compact-album-track-${index}`"
          @click="playFrom(selected, index)"
        >
          <span class="w-5 text-[10px] text-base-content/35 tabular-nums">{{ index + 1 }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-[12px] truncate">{{ trackTitle(track) }}</span>
          </span>
          <Play :size="11" class="text-base-content/30" />
        </button>
      </div>
    </template>
  </div>
</template>
