<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { Play, Plus } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';

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

function formatDur(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function playNow() {
  emit('play', props.track);
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  ui.showContextMenu(e.clientX, e.clientY, [
    { label: t('common.play'), action: () => playNow() },
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
  <div
    class="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover transition-colors cursor-pointer"
    draggable="true"
    @dblclick="playNow"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div class="relative shrink-0 w-16 h-9 rounded-lg overflow-hidden bg-bg-elevated">
      <MediaCover :cover="cover" :size="14" fallback="film" />
      <button
        class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors"
        @click="playNow"
      >
        <Play :size="14" class="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      <div
        v-if="track.duration"
        class="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded bg-black/60 text-white text-[9px] font-medium leading-none"
      >
        {{ formatDur(track.duration) }}
      </div>
    </div>

    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium truncate">{{ track.metadata?.title || track.name }}</div>
      <div class="text-xs text-fg-faint truncate">
        {{ track.extension?.toUpperCase() || t('common.unknown') }} · {{ formatDur(track.duration) }}
      </div>
    </div>

    <div
      class="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-elevated transition-colors"
        :title="$t('common.addToQueue')"
        @click.stop="player.addToQueue(props.track)"
      >
        <Plus :size="14" />
      </button>
    </div>
  </div>
</template>
