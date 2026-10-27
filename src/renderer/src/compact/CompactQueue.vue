<script setup lang="ts">
import { computed, ref } from 'vue';
import { GripVertical, ListMusic, Play, Trash2 } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import MediaCover from '@renderer/components/MediaCover.vue';
import type { MediaFile } from '@renderer/types/media';

const player = usePlayerStore();
const dragIndex = ref<number | null>(null);

const current = computed(() => player.currentTrack);
const items = computed(() => player.displayQueue);

function trackTitle(track: MediaFile | null | undefined): string {
  if (!track) return '';
  return track.metadata?.title || track.name;
}

function trackArtist(track: MediaFile | null | undefined): string {
  if (!track) return '';
  return track.metadata?.artist || track.metadata?.album || '';
}

function playNow(index: number): void {
  const track = items.value[index];
  if (!track) return;
  player.removeFromQueue(index);
  player.setTrack(track);
}

function onDragStart(index: number): void {
  dragIndex.value = index;
}

function onDrop(index: number): void {
  if (dragIndex.value === null) return;
  player.reorderQueue(dragIndex.value, index);
  dragIndex.value = null;
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0" data-testid="compact-queue">
    <div class="flex items-center gap-2 px-3 py-2 shrink-0">
      <span class="text-[11px] uppercase tracking-wider text-base-content/50">
        {{ $t('compact.nowPlaying') }}
      </span>
      <span class="flex-1" />
      <button
        v-if="items.length"
        class="text-[11px] text-base-content/50 hover:text-error transition-colors"
        data-testid="compact-clear-queue"
        @click="player.clearQueue()"
      >
        {{ $t('compact.clearQueue') }}
      </button>
    </div>

    <div v-if="current" class="px-2 shrink-0">
      <div class="flex items-center gap-2.5 p-2 rounded-field bg-primary/10">
        <span class="w-8 h-8 rounded overflow-hidden bg-base-300 shrink-0">
          <MediaCover :path="current.path" :size="32" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[12px] truncate font-medium">{{ trackTitle(current) }}</span>
          <span class="block text-[10px] text-base-content/55 truncate">
            {{ trackArtist(current) }}
          </span>
        </span>
        <span class="text-[10px] text-primary-text">{{ $t('compact.playing') }}</span>
      </div>
    </div>

    <div class="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-base-content/50 shrink-0">
      {{ $t('compact.upNext') }}
    </div>

    <div v-if="!items.length" class="px-4 py-6 text-[12px] text-base-content/50">
      {{ $t('compact.emptyQueue') }}
    </div>

    <div v-else class="flex-1 min-h-0 overflow-auto compact-scroll px-2 pb-2">
      <div
        v-for="(track, index) in items"
        :key="`${track.path}-${index}`"
        class="flex items-center gap-2 px-1.5 py-1 rounded-field hover:bg-base-content/5 transition-colors"
        draggable="true"
        :data-testid="`compact-queue-item-${index}`"
        @dragstart="onDragStart(index)"
        @dragover.prevent
        @drop="onDrop(index)"
      >
        <GripVertical :size="13" class="text-base-content/25 shrink-0 cursor-grab" />
        <button
          class="w-7 h-7 rounded overflow-hidden bg-base-300 shrink-0 group relative"
          :title="$t('compact.playNow')"
          :aria-label="$t('compact.playNow')"
          @click="playNow(index)"
        >
          <MediaCover :path="track.path" :size="28" />
          <span
            class="absolute inset-0 hidden group-hover:grid place-items-center bg-black/45 text-white"
          >
            <Play :size="11" />
          </span>
        </button>
        <button class="min-w-0 flex-1 text-left" @click="playNow(index)">
          <span class="block text-[12px] truncate">{{ trackTitle(track) }}</span>
          <span class="block text-[10px] text-base-content/50 truncate">
            {{ trackArtist(track) }}
          </span>
        </button>
        <button
          class="grid place-items-center w-6 h-6 rounded-field text-base-content/35 hover:text-error hover:bg-error/10 shrink-0"
          :title="$t('compact.remove')"
          :aria-label="$t('compact.remove')"
          @click="player.removeFromQueue(index)"
        >
          <Trash2 :size="12" />
        </button>
      </div>
    </div>

    <div v-if="!items.length && !current" class="px-4 pb-6 text-center text-base-content/30">
      <ListMusic :size="22" class="mx-auto" />
    </div>
  </div>
</template>
