<script setup lang="ts">
import { ref, watch } from 'vue';
import { useVirtualList } from '@renderer/composables/useVirtualList';
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
  // Rozgrzewaj tylko najbliższy fragment — okładki dla reszty są pobierane leniwie
  // przez własny obserwator widoczności każdego MediaCover, gdy wiersz wjedzie na ekran.
  for (const track of tracks.slice(0, 24)) {
    player.loadCover(track.path);
  }
}

// Wirtualizuj listę kolejki — "play all" na folderze może wstawić tu tysiące
// wierszy (plan 1.6).
const queueListRef = ref<HTMLElement | null>(null);
const queueVirtualizer = useVirtualList({
  count: () => player.displayQueue.length,
  scrollEl: () => queueListRef.value,
  estimateSize: () => 52,
  overscan: 8
});

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
    data-testid="queue-panel"
    class="h-full flex flex-col bg-base-100 border-l border-base-300"
    @dragover.prevent
    @drop="onFileDrop"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
      <h3 class="text-sm font-semibold flex items-center gap-2">
        <span>{{ $t('queue.title') }}</span>
        <span class="text-[11px] text-base-content/50 font-normal">({{ player.queueLength }})</span>
      </h3>
      <div class="flex items-center gap-1">
        <button
          v-if="player.displayQueue.length"
          data-testid="queue-clear"
          class="text-[11px] text-base-content/50 hover:text-error transition-colors px-2 py-1"
          @click="player.clearQueue"
        >
          {{ $t('queue.clear') }}
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :aria-label="$t('common.close')"
          :title="$t('common.close')"
          @click="player.toggleQueue"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- teraz odtwarzane -->
    <div v-if="player.currentTrack" class="px-4 py-3 border-b border-base-300 bg-base-100">
      <div class="text-[10px] text-primary font-medium uppercase tracking-wider mb-2">
        {{ $t('queue.nowPlaying') }}
      </div>
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-field bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden"
        >
          <MediaCover
            :path="player.currentTrack.path"
            :size="16"
            :autoplay="true"
            fallback="music"
          />
        </div>
        <TrackInfo :track="player.currentTrack" class="min-w-0 flex-1" titleSize="text-sm" />
        <span class="text-xs text-base-content/50 font-mono shrink-0">{{
          formatDuration(player.currentTrack.duration || 0)
        }}</span>
      </div>
    </div>

    <!-- podpowiedź upuszczenia gdy pusta -->
    <div
      v-if="player.displayQueue.length === 0"
      data-testid="queue-empty"
      class="flex-1 flex flex-col items-center justify-center py-12 text-base-content/50"
    >
      <Music2 :size="32" class="mb-2 opacity-30" />
      <p class="text-xs">{{ $t('queue.empty') }}</p>
      <p class="text-[10px] text-base-content/50 mt-1">{{ $t('queue.dropHint') }}</p>
    </div>

    <!-- lista kolejki z drag & drop (zwirtualizowana) -->
    <div v-else ref="queueListRef" class="flex-1 overflow-auto">
      <div
        class="py-1"
        :style="{ height: queueVirtualizer.getTotalSize() + 'px', position: 'relative' }"
      >
        <div
          v-for="v in queueVirtualizer.getVirtualItems()"
          :key="'q-' + v.key"
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
            v-activate
            :data-testid="'queue-row-' + v.index"
            class="flex items-center gap-2 px-4 py-2 hover:bg-base-content/10 transition-colors group cursor-pointer"
            :class="{ 'border-t-2 border-primary': dragOverIndex === v.index }"
            draggable="true"
            @dragstart="onDragStart($event, v.index)"
            @dragover="onDragOver($event, v.index)"
            @dragleave="onDragLeave"
            @drop="onDrop($event, v.index)"
            @click="player.setTrack(player.displayQueue[v.index])"
          >
            <GripVertical
              :size="12"
              class="text-base-content/60 shrink-0 opacity-0 group-hover:opacity-100 cursor-grab"
            />
            <div
              class="w-8 h-8 rounded-field bg-neutral flex items-center justify-center shrink-0 overflow-hidden"
            >
              <MediaCover :path="player.displayQueue[v.index].path" :size="12" fallback="music" />
            </div>
            <TrackInfo
              :track="player.displayQueue[v.index]"
              class="min-w-0 flex-1"
              titleSize="text-sm"
              artistSize="text-[11px]"
            />
            <span class="text-[11px] text-base-content/50 font-mono shrink-0">{{
              formatDuration(player.displayQueue[v.index].duration || 0)
            }}</span>
            <button
              class="fx-noise p-1 fx-depth rounded-field opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-base-content/50 hover:text-error transition-all"
              :aria-label="$t('queue.removeFromQueue')"
              :title="$t('queue.removeFromQueue')"
              @click.stop="player.removeFromQueue(v.index)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- historia -->
    <div v-if="player.history.length > 0" class="border-t border-base-300 max-h-40 overflow-auto">
      <div class="px-4 py-2 text-[10px] text-base-content/50 font-medium uppercase tracking-wider">
        {{ $t('queue.history') }}
      </div>
      <div
        v-for="(track, i) in player.history.slice(0, 10)"
        :key="i"
        v-activate
        class="flex items-center gap-2 px-4 py-1.5 hover:bg-base-content/10 transition-colors cursor-pointer opacity-60"
        @click="player.playFromHistory(i)"
      >
        <div
          class="w-6 h-6 rounded-field bg-neutral flex items-center justify-center shrink-0 overflow-hidden"
        >
          <MediaCover :path="track.path" :size="10" fallback="music" />
        </div>
        <span class="text-xs truncate flex-1">{{ track.metadata?.title || track.name }}</span>
        <span class="text-[10px] text-base-content/50">{{
          formatDuration(track.duration || 0)
        }}</span>
      </div>
    </div>
  </div>
</template>
