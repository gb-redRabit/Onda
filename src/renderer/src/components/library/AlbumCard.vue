<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { Music2 } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';

const { t } = useI18n();

const props = defineProps<{
  name: string;
  tracks: MediaFile[];
}>();

const emit = defineEmits<{
  play: [tracks: MediaFile[]];
}>();

const player = usePlayerStore();
const { showAlbumMenu } = useLibraryContextMenu();

// okładka albumu = pierwszy plik audio z którego da się wyciągnąć okładkę
const firstAudio = computed(() => props.tracks.find((t) => t.type === 'audio') ?? props.tracks[0]);
const cover = computed(() => player.getCover(firstAudio.value?.path || ''));
const artist = computed(() => firstAudio.value?.metadata?.artist || props.tracks[0]?.metadata?.artist || t('common.unknown'));
const year = computed(() => firstAudio.value?.metadata?.year ?? props.tracks[0]?.metadata?.year);
const count = computed(() => props.tracks.length);

function ensureCover() {
  // ładuj okładki dla pierwszych kilku utworów, wybierz pierwszą dostępną
  for (const tr of props.tracks.slice(0, 5)) {
    if (!player.getCover(tr.path).data) player.loadCover(tr.path);
  }
}
onMounted(ensureCover);
watch(() => props.tracks.map((t) => t.path).join('|'), ensureCover);

const displayPath = computed(() => {
  for (const tr of props.tracks) {
    const c = player.getCover(tr.path);
    if (c.data && c.type === 'image') return tr.path;
  }
  return firstAudio.value?.path || props.tracks[0]?.path;
});
const displayCover = computed(() => player.getCover(displayPath.value || ''));

function onContextMenu(e: MouseEvent) {
  showAlbumMenu(e, props.name, props.tracks);
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: props.tracks.map((t) => t.path) }));
  e.dataTransfer!.effectAllowed = 'move';
}
</script>

<template>
  <button
    class="flex-1 flex flex-col fx-depth rounded-box fx-noise bg-base-100 border border-base-300 hover:bg-base-content/10 transition-all overflow-hidden group text-left min-w-0"
    draggable="true"
    @click="emit('play', tracks)"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div
      class="w-full aspect-square bg-neutral flex items-center justify-center relative overflow-hidden"
    >
      <MediaCover
        :path="displayPath"
        :cover="displayCover.data ? displayCover : cover"
        :size="28"
        :render-as-video="false"
        fallback="disc"
      />
      <div
        class="absolute inset-0 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/20 transition-colors"
      >
        <div
          class="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Music2 :size="18" class="text-primary-content ml-0.5" />
        </div>
      </div>
    </div>
    <div class="p-2.5">
      <div class="text-sm font-medium truncate">{{ name }}</div>
      <div class="text-xs text-base-content/50 mt-0.5 truncate">
        {{ artist }} · {{ count }} {{ $t('common.tracks') }} <span v-if="year">· {{ year }}</span>
      </div>
    </div>
  </button>
</template>
