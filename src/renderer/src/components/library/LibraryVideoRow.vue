<script setup lang="ts">
import { computed, watch } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '@renderer/stores/player';
import { Play, Plus } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { formatDuration } from '@renderer/utils/formatters';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import { useThumbnails } from '@renderer/composables/useThumbnails';

const props = defineProps<{
  track: MediaFile;
}>();

const emit = defineEmits<{
  play: [track: MediaFile];
}>();

const { t } = useI18n();
const player = usePlayerStore();
const { showTrackMenu } = useLibraryContextMenu();
void t;
const { request, getThumb } = useThumbnails(160);
watch(
  () => props.track.path,
  (p) => p && request([p]),
  { immediate: true }
);

const cover = computed(() => {
  const thumb = getThumb(props.track.path);
  if (thumb) return { type: 'image', data: thumb } as const;
  const cached = player.getCover(props.track.path);
  if (cached.data) return cached;
  return { type: 'video', data: props.track.path.replace(/\\/g, '/') };
});

function playNow() {
  emit('play', props.track);
}

function onContextMenu(e: MouseEvent) {
  showTrackMenu(e, props.track);
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: [props.track.path] }));
  e.dataTransfer!.effectAllowed = 'move';
}
</script>

<template>
  <div
    class="group flex items-center gap-3 px-3 py-2 rounded-box hover:bg-base-content/10 transition-colors cursor-pointer"
    draggable="true"
    @dblclick="playNow"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div class="relative shrink-0 w-16 h-9 rounded-field overflow-hidden bg-base-100">
      <MediaCover :cover="cover" :size="14" fallback="film" />
      <button
        class="absolute inset-0 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/40 transition-colors"
        @click="playNow"
      >
        <Play
          :size="14"
          class="text-neutral-content opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </button>
      <div
        v-if="track.duration"
        class="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded-field bg-neutral/60 text-neutral-content text-[9px] font-medium leading-none"
      >
        {{ formatDuration(track.duration, '—') }}
      </div>
    </div>

    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium truncate">{{ track.metadata?.title || track.name }}</div>
      <div class="text-xs text-base-content/50 truncate">
        {{ track.extension?.toUpperCase() || t('common.unknown') }} ·
        {{ formatDuration(track.duration, '—') }}
      </div>
    </div>

    <div
      class="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-100 transition-colors"
        :title="$t('common.addToQueue')"
        @click.stop="player.addToQueue(props.track)"
      >
        <Plus :size="14" />
      </button>
    </div>
  </div>
</template>
