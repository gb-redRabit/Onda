<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { Music2 } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';

const { t } = useI18n();

const props = defineProps<{
  name: string;
  tracks: MediaFile[];
}>();

const emit = defineEmits<{
  play: [tracks: MediaFile[]];
}>();

const player = usePlayerStore();
const ui = useUIStore();

const first = computed(() => props.tracks[0]);
const cover = computed(() => player.getCover(first.value?.path || ''));
const artist = computed(() => first.value?.metadata?.artist || t('common.unknown'));
const year = computed(() => first.value?.metadata?.year);
const count = computed(() => props.tracks.length);

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  ui.showContextMenu(e.clientX, e.clientY, [
    {
      label: t('common.playAlbum') + ' (' + count.value + ' ' + t('common.tracks') + ')',
      action: () => emit('play', props.tracks)
    },
    {
      label: t('common.addAllToQueue'),
      action: () => {
        props.tracks.forEach((t) => player.addToQueue(t));
      }
    }
  ]);
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: props.tracks.map((t) => t.path) }));
  e.dataTransfer!.effectAllowed = 'move';
}
</script>

<template>
  <button
    class="flex-1 flex flex-col rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all overflow-hidden group text-left min-w-0"
    draggable="true"
    @click="emit('play', tracks)"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div
      class="w-full aspect-square bg-bg-overlay flex items-center justify-center relative overflow-hidden"
    >
      <MediaCover :cover="cover" :size="28" :render-as-video="false" fallback="disc" />
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors"
      >
        <div
          class="w-10 h-10 rounded-full bg-accent-base/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Music2 :size="18" class="text-white ml-0.5" />
        </div>
      </div>
    </div>
    <div class="p-2.5">
      <div class="text-sm font-medium truncate">{{ name }}</div>
      <div class="text-xs text-fg-faint mt-0.5 truncate">
        {{ artist }} · {{ count }} {{ $t('common.tracks') }} <span v-if="year">· {{ year }}</span>
      </div>
    </div>
  </button>
</template>
