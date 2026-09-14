<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ChevronDown,
  ChevronRight as ChevronRightSmall,
  ListMusic,
  Plus,
  Trash2
} from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';

const { t } = useI18n();
const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();

const expanded = ref(true);
const newPlaylistName = ref('');
const isCreatingPlaylist = ref(false);
const dragOverPlaylistId = ref<string | null>(null);

function createPlaylist() {
  const name = newPlaylistName.value.trim();
  if (!name) return;
  library.createPlaylist(name);
  newPlaylistName.value = '';
  isCreatingPlaylist.value = false;
}

function onPlaylistDrop(e: DragEvent, playlistId: string) {
  const raw = e.dataTransfer?.getData('text/plain');
  if (!raw) return;
  try {
    const { paths } = JSON.parse(raw);
    if (!Array.isArray(paths)) return;
    const playlist = library.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    paths.forEach((path: string) => {
      const track = library.tracks.find((t) => t.path === path);
      if (track) library.addToPlaylist(playlistId, track);
    });
    dragOverPlaylistId.value = null;
    ui.notify('success', t('common.addToPlaylist'));
  } catch {
    // not our data format
  }
}

function playPlaylist(playlistId: string) {
  const playlist = library.playlists.find((p) => p.id === playlistId);
  if (playlist && playlist.tracks.length > 0) {
    player.clearQueue();
    if (playlist.tracks.length > 1) player.addToQueueMultiple(playlist.tracks.slice(1));
    player.setTrack(playlist.tracks[0]);
    player.play();
  }
}
</script>

<template>
  <div class="pt-3">
    <button
      class="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-base-content/50 uppercase tracking-wider hover:text-base-content/70 transition-colors"
      @click="expanded = !expanded"
    >
      <ChevronDown v-if="expanded" :size="12" />
      <ChevronRightSmall v-else :size="12" />
      <span>{{ $t('library.playlists') }}</span>
      <span class="ml-auto text-base-content/60">{{ library.playlists.length }}</span>
    </button>

    <div v-if="expanded" class="mt-1 space-y-0.5">
      <div
        v-for="playlist in library.playlists"
        :key="playlist.id"
        class="group flex items-center gap-2 px-3 py-2 rounded-field text-xs text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors cursor-pointer"
        :class="{ 'ring-1 ring-primary/50 bg-primary/10': dragOverPlaylistId === playlist.id }"
        @click="playPlaylist(playlist.id)"
        @dragover.prevent="dragOverPlaylistId = playlist.id"
        @dragleave="dragOverPlaylistId = null"
        @drop.prevent="onPlaylistDrop($event, playlist.id)"
      >
        <ListMusic :size="13" class="shrink-0 text-primary/70" />
        <span class="truncate flex-1">{{ playlist.name }}</span>
        <span class="text-[10px] text-base-content/50">{{ playlist.tracks.length }}</span>
        <button
          class="fx-noise p-0.5 fx-depth rounded-field opacity-0 group-hover:opacity-100 text-base-content/50 hover:text-error transition-all"
          :aria-label="$t('common.delete')"
          @click.stop="library.deletePlaylist(playlist.id)"
        >
          <Trash2 :size="10" />
        </button>
      </div>

      <!-- create playlist -->
      <div v-if="isCreatingPlaylist" class="px-2 py-1">
        <input
          v-model="newPlaylistName"
          :placeholder="$t('library.playlistName')"
          class="w-full px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content placeholder:text-base-content/50 focus:outline-none focus:ring-1 focus:ring-primary"
          autofocus
          @keydown.enter="createPlaylist"
          @keydown.escape="isCreatingPlaylist = false"
        />
      </div>
      <button
        v-else
        class="fx-noise w-full flex items-center gap-2 px-3 py-2 fx-depth rounded-field text-xs text-base-content/50 hover:bg-base-content/10 hover:text-base-content/70 transition-colors"
        @click="isCreatingPlaylist = true"
      >
        <Plus :size="13" class="shrink-0" />
        <span>{{ $t('library.newPlaylist') }}</span>
      </button>
    </div>
  </div>
</template>
