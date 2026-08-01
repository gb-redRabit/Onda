<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { Play } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { formatDuration } from '@renderer/utils/formatters';

const { t } = useI18n();

const props = defineProps<{
  track: MediaFile;
}>();

const emit = defineEmits<{
  play: [track: MediaFile];
}>();

const player = usePlayerStore();
const ui = useUIStore();

const cover = computed(() => {
  const cached = player.getCover(props.track.path);
  if (cached.data) return cached;
  return { type: 'video', data: props.track.path.replace(/\\/g, '/') };
});

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  ui.showContextMenu(e.clientX, e.clientY, [
    { label: t('common.play'), action: () => emit('play', props.track) },
    { label: t('common.addToQueue'), action: () => player.addToQueue(props.track) },
    {
      label: t('common.showInFolder'),
      action: () => window.api?.invoke('shell:showItemInFolder', props.track.path)
    }
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
      <MediaCover :cover="cover" :size="32" fallback="film" />
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
      >
        <div
          class="w-10 h-10 rounded-full bg-accent-base/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Play :size="18" class="text-white ml-0.5" />
        </div>
      </div>
      <div
        v-if="track.duration"
        class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium"
      >
        {{ formatDuration(track.duration, '—') }}
      </div>
    </div>
    <div class="p-2.5">
      <div class="text-xs font-medium truncate">{{ track.name }}</div>
      <div class="text-[11px] text-fg-faint mt-0.5">
        {{ formatDuration(track.duration, '—') }}
      </div>
    </div>
  </button>
</template>
