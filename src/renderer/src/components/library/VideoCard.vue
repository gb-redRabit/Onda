<script setup lang="ts">
import { computed } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { Film, Music2 } from '@lucide/vue';

const props = defineProps<{
  track: MediaFile;
}>();

const emit = defineEmits<{
  play: [track: MediaFile];
}>();

const player = usePlayerStore();
const ui = useUIStore();

const cover = computed(() => player.getCover(props.track.path));

function formatDur(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  ui.showContextMenu(e.clientX, e.clientY, [
    { label: 'Odtwórz', action: () => emit('play', props.track) },
    { label: 'Dodaj do kolejki', action: () => player.addToQueue(props.track) },
    { label: 'Pokaż w folderze', action: () => window.api?.invoke('shell:showItemInFolder', props.track.path) }
  ]);
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: [props.track.path] }));
  e.dataTransfer!.effectAllowed = 'move';
}
</script>

<template>
  <button
    class="flex-1 flex flex-col rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all overflow-hidden group text-left min-w-0"
    draggable="true"
    @click="emit('play', track)"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div
      class="aspect-video bg-bg-overlay flex items-center justify-center relative overflow-hidden"
    >
      <img
        v-if="cover.type === 'image'"
        :src="cover.data || ''"
        class="w-full h-full object-cover"
      />
      <img
        v-else-if="cover.type === 'video'"
        :src="'file:///' + cover.data"
        class="w-full h-full object-cover"
      />
      <Film v-else :size="32" class="text-fg-faint/40" />
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
      >
        <div
          class="w-10 h-10 rounded-full bg-accent-base/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Music2 :size="18" class="text-white ml-0.5" />
        </div>
      </div>
      <div
        v-if="track.duration"
        class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium"
      >
        {{ formatDur(track.duration) }}
      </div>
    </div>
    <div class="p-2.5">
      <div class="text-xs font-medium truncate">{{ track.name }}</div>
      <div class="text-[11px] text-fg-faint mt-0.5">
        {{ formatDur(track.duration) }}
      </div>
    </div>
  </button>
</template>
