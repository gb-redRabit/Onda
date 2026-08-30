<script setup lang="ts">
import { computed, watch } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '@renderer/stores/player';
import { Play } from '@lucide/vue';
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
const { request, getThumb } = useThumbnails(320);
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

function onContextMenu(e: MouseEvent) {
  showTrackMenu(e, props.track);
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: [props.track.path] }));
  e.dataTransfer!.effectAllowed = 'move';
}
</script>

<template>
  <button
    class="flex-1 flex flex-col fx-depth rounded-box fx-noise bg-base-100 border border-base-300 hover:bg-base-content/10 transition-all overflow-hidden group text-left min-w-0"
    draggable="true"
    @click="emit('play', track)"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div class="aspect-video bg-neutral flex items-center justify-center relative overflow-hidden">
      <MediaCover :cover="cover" :size="32" fallback="film" />
      <div
        class="absolute inset-0 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/30 transition-colors"
      >
        <div
          class="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Play :size="18" class="text-neutral-content ml-0.5" />
        </div>
      </div>
      <div
        v-if="track.duration"
        class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-field bg-neutral/60 text-neutral-content text-[10px] font-medium"
      >
        {{ formatDuration(track.duration, '—') }}
      </div>
    </div>
    <div class="p-2.5">
      <div class="text-xs font-medium truncate">{{ track.name }}</div>
      <div class="text-[11px] text-base-content/50 mt-0.5">
        {{ formatDuration(track.duration, '—') }}
      </div>
    </div>
  </button>
</template>
