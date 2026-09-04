<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { Music2, Plus, ListMusic } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import { useLibraryStore } from '@renderer/stores/library';

const { t } = useI18n();

const props = defineProps<{
  name: string;
  tracks: MediaFile[];
}>();

const emit = defineEmits<{
  play: [tracks: MediaFile[]];
}>();

const library = useLibraryStore();
const player = usePlayerStore();
const { showAlbumMenu } = useLibraryContextMenu();
const showPlaylistMenu = ref(false);
const playlistBtn = ref<HTMLElement | null>(null);
const playlistPopupStyle = computed(() => {
  const el = playlistBtn.value;
  if (!el) return {};
  const r = el.getBoundingClientRect();
  const w = 192;
  const left = Math.min(r.right - w, window.innerWidth - w - 8);
  const top = r.bottom + 6;
  const maxTop = window.innerHeight - 200 - 8;
  return { left: Math.max(8, left) + 'px', top: Math.min(top, maxTop) + 'px' };
});

function togglePlaylist(e: MouseEvent) {
  e.stopPropagation();
  showPlaylistMenu.value = !showPlaylistMenu.value;
  if (showPlaylistMenu.value) {
    const onClickOutside = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      if (!playlistBtn.value?.contains(t) && !t.closest('.playlist-popup')) showPlaylistMenu.value = false;
    };
    document.addEventListener('click', onClickOutside, { once: true });
  }
}
function addAlbumToPlaylist(pid: string) {
  for (const tr of props.tracks) library.addToPlaylist(pid, tr);
  showPlaylistMenu.value = false;
}

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
        <div class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
          <div ref="playlistBtn" class="relative">
            <button
              class="w-7 h-7 rounded-full bg-neutral/60 backdrop-blur-sm text-neutral-content hover:bg-neutral/80 flex items-center justify-center fx-depth"
              @click="togglePlaylist"
            >
              <Plus :size="14" />
            </button>
            <Teleport to="body">
              <div v-if="showPlaylistMenu" class="playlist-popup fixed w-48 bg-base-100 border border-base-300 rounded-box shadow-xl py-1 z-50" :style="playlistPopupStyle" @click.stop>
                <button
                  v-for="p in library.playlists"
                  :key="p.id"
                  class="w-full text-left px-3 py-1.5 text-xs hover:bg-base-content/10 truncate"
                  @click="addAlbumToPlaylist(p.id)"
                >
                  <ListMusic :size="12" class="inline mr-1" />{{ p.name }}
                </button>
                <div v-if="library.playlists.length === 0" class="px-3 py-1.5 text-xs text-base-content/50 italic">{{ $t('common.noPlaylists') }}</div>
              </div>
            </Teleport>
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
