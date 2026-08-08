<script setup lang="ts">
import { ref, watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { X, Music2, GripVertical, Trash2 } from '@lucide/vue';
import { formatDuration } from '@renderer/utils/formatters';
import { buildMediaFile } from '@renderer/utils/explorerMedia';
import type { MediaFile } from '@renderer/types/media';
import MediaCover from '@renderer/components/MediaCover.vue';
import TrackInfo from '@renderer/components/TrackInfo.vue';

const player = usePlayerStore();
const dragOverIndex = ref<number | null>(null);
const dragIndex = ref<number | null>(null);

const durationPending = new Map<string, Promise<number>>();

function fetchDuration(filePath: string): Promise<number> {
  let p = durationPending.get(filePath);
  if (!p) {
    p = (window.api?.getDuration(filePath) ?? Promise.resolve(0))
      .catch(() => 0)
      .finally(() => {
        durationPending.delete(filePath);
      });
    durationPending.set(filePath, p);
  }
  return p;
}

async function loadCovers(tracks: MediaFile[]) {
  for (const track of tracks) {
    player.loadCover(track.path);
  }
}

watch(
  () => player.displayQueue,
  (newQueue) => {
    loadCovers(newQueue);
  },
  { immediate: true }
);

watch(
  () => player.currentTrack,
  (track) => {
    if (track) player.loadCover(track.path);
  },
  { immediate: true }
);

function onDragStart(e: DragEvent, index: number) {
  dragIndex.value = index;
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', `queue:${index}`);
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragOverIndex.value = index;
}

function onDragLeave() {
  dragOverIndex.value = null;
}

function onDrop(e: DragEvent, toIndex: number) {
  e.preventDefault();
  dragOverIndex.value = null;
  const data = e.dataTransfer!.getData('text/plain');

  if (data.startsWith('queue:')) {
    const fromIndex = parseInt(data.split(':')[1]);
    if (fromIndex !== toIndex) {
      player.reorderQueue(fromIndex, toIndex);
    }
  } else if (data.startsWith('file:')) {
    const filePath = data.replace('file:', '');
    const file = buildMediaFile({ path: filePath, size: 0 });
    player.insertInQueue(toIndex, file);
    fetchDuration(filePath).then((dur) => {
      file.duration = dur;
    });
  }
}

function onFileDrop(e: DragEvent) {
  e.preventDefault();
  dragOverIndex.value = null;
  const files = e.dataTransfer?.files;
  if (!files) return;
  for (const file of Array.from(files)) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isMedia = [
      'mp3',
      'flac',
      'wav',
      'ogg',
      'aac',
      'm4a',
      'opus',
      'aiff',
      'mp4',
      'mkv',
      'avi',
      'webm',
      'mov'
    ].includes(ext);
    if (isMedia) {
      const filePath = window.api.getFilePath(file);
      const mediaFile = buildMediaFile({
        path: filePath,
        name: file.name,
        extension: ext,
        size: file.size,
        mimeType: file.type || ''
      });
      player.addToQueue(mediaFile);
      fetchDuration(filePath).then((dur) => {
        mediaFile.duration = dur;
      });
    }
  }
}
</script>

<template>
  <div
    class="h-full flex flex-col bg-bg-surface border-l border-border-default"
    @dragover.prevent
    @drop="onFileDrop"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-border-default">
      <h3 class="text-sm font-semibold flex items-center gap-2">
        <span>{{ $t('queue.title') }}</span>
        <span class="text-[11px] text-fg-faint font-normal">({{ player.queueLength }})</span>
      </h3>
      <div class="flex items-center gap-1">
        <button
          v-if="player.displayQueue.length"
          class="text-[11px] text-fg-faint hover:text-red-base transition-colors px-2 py-1"
          @click="player.clearQueue"
        >
          {{ $t('queue.clear') }}
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover hover:text-fg-base transition-colors"
          @click="player.toggleQueue"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- now playing -->
    <div v-if="player.currentTrack" class="px-4 py-3 border-b border-border-default bg-bg-elevated">
      <div class="text-[10px] text-accent-base font-medium uppercase tracking-wider mb-2">
        {{ $t('queue.nowPlaying') }}
      </div>
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-accent-ghost flex items-center justify-center shrink-0 overflow-hidden"
        >
          <MediaCover
            :path="player.currentTrack.path"
            :size="16"
            :autoplay="true"
            fallback="music"
          />
        </div>
        <TrackInfo :track="player.currentTrack" class="min-w-0 flex-1" titleSize="text-sm" />
        <span class="text-xs text-fg-faint font-mono shrink-0">{{
          formatDuration(player.currentTrack.duration || 0)
        }}</span>
      </div>
    </div>

    <!-- drop hint when empty -->
    <div
      v-if="player.displayQueue.length === 0"
      class="flex-1 flex flex-col items-center justify-center py-12 text-fg-faint"
    >
      <Music2 :size="32" class="mb-2 opacity-30" />
      <p class="text-xs">{{ $t('queue.empty') }}</p>
      <p class="text-[10px] text-fg-faint/50 mt-1">{{ $t('queue.dropHint') }}</p>
    </div>

    <!-- queue list with drag & drop -->
    <div v-else class="flex-1 overflow-auto">
      <div class="py-1">
        <div
          v-for="(track, i) in player.displayQueue"
          :key="i"
          class="flex items-center gap-2 px-4 py-2 hover:bg-bg-hover transition-colors group cursor-pointer"
          :class="{ 'border-t-2 border-accent-base': dragOverIndex === i }"
          draggable="true"
          @dragstart="onDragStart($event, i)"
          @dragover="onDragOver($event, i)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, i)"
          @click="player.setTrack(track)"
        >
          <GripVertical
            :size="12"
            class="text-fg-faint/40 shrink-0 opacity-0 group-hover:opacity-100 cursor-grab"
          />
          <div
            class="w-8 h-8 rounded-md bg-bg-overlay flex items-center justify-center shrink-0 overflow-hidden"
          >
            <MediaCover :path="track.path" :size="12" fallback="music" />
          </div>
          <TrackInfo
            :track="track"
            class="min-w-0 flex-1"
            titleSize="text-sm"
            artistSize="text-[11px]"
          />
          <span class="text-[11px] text-fg-faint font-mono shrink-0">{{
            formatDuration(track.duration || 0)
          }}</span>
          <button
            class="p-1 rounded opacity-0 group-hover:opacity-100 text-fg-faint hover:text-red-base transition-all"
            @click.stop="player.removeFromQueue(i)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
    </div>

    <!-- history -->
    <div
      v-if="player.history.length > 0"
      class="border-t border-border-default max-h-40 overflow-auto"
    >
      <div class="px-4 py-2 text-[10px] text-fg-faint font-medium uppercase tracking-wider">
        {{ $t('queue.history') }}
      </div>
      <div
        v-for="(track, i) in player.history.slice(0, 10)"
        :key="i"
        class="flex items-center gap-2 px-4 py-1.5 hover:bg-bg-hover transition-colors cursor-pointer opacity-60"
        @click="player.playFromHistory(i)"
      >
        <div
          class="w-6 h-6 rounded bg-bg-overlay flex items-center justify-center shrink-0 overflow-hidden"
        >
          <MediaCover :path="track.path" :size="10" fallback="music" />
        </div>
        <span class="text-xs truncate flex-1">{{ track.metadata?.title || track.name }}</span>
        <span class="text-[10px] text-fg-faint">{{ formatDuration(track.duration || 0) }}</span>
      </div>
    </div>
  </div>
</template>
