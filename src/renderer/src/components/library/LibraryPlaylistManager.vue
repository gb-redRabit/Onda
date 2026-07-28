<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { Plus, Play, Trash2 } from '@lucide/vue';
import LibraryTrackRow from './LibraryTrackRow.vue';

const { t } = useI18n();

const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();

const selectedPlaylistId = ref<string | null>(null);
const newName = ref('');
const dragOverPlaylistId = ref<string | null>(null);

const selectedPlaylist = computed(() =>
  library.playlists.find((p) => p.id === selectedPlaylistId.value)
);

function selectPlaylist(id: string) {
  selectedPlaylistId.value = id;
}

function createPlaylist() {
  const name = newName.value.trim();
  if (!name) return;
  const p = library.createPlaylist(name);
  selectedPlaylistId.value = p.id;
  newName.value = '';
}

function deleteSelected() {
  if (selectedPlaylistId.value) {
    library.deletePlaylist(selectedPlaylistId.value);
    selectedPlaylistId.value = null;
  }
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
    ui.notify(
      'success',
      `Dodano ${paths.length} ${t('common.tracks')} do playlisty "${playlist.name}"`
    );
  } catch {
    // not our data format
  }
}

function playAll() {
  if (!selectedPlaylist.value) return;
  const tracks = selectedPlaylist.value.tracks;
  if (tracks.length === 0) return;
  if (tracks.length > 1) player.addToQueueMultiple(tracks.slice(1));
  player.setTrack(tracks[0]);
  player.play();
}
</script>

<template>
  <div class="flex h-full">
    <div class="w-56 border-r border-border-default p-3 shrink-0 flex flex-col">
      <h2 class="text-sm font-bold mb-3">{{ $t('library.playlists') }}</h2>

      <div class="flex gap-2 mb-3">
        <input
          v-model="newName"
          class="flex-1 px-2 py-1 text-xs rounded-lg bg-bg-elevated border border-border-default outline-none focus:border-accent-base"
          :placeholder="$t('library.playlistName')"
          @keyup.enter="createPlaylist"
        />
        <button
          class="p-1.5 rounded-lg bg-accent-base text-white hover:bg-accent-hover transition-colors"
          :disabled="!newName.trim()"
          @click="createPlaylist"
        >
          <Plus :size="14" />
        </button>
      </div>

      <div class="flex-1 overflow-auto space-y-0.5">
        <button
          v-for="p in library.playlists"
          :key="p.id"
          class="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors text-left"
          :class="
            selectedPlaylistId === p.id
              ? 'bg-accent-ghost text-accent-base'
              : dragOverPlaylistId === p.id
                ? 'ring-1 ring-accent-base/50 bg-accent-ghost'
                : 'hover:bg-bg-hover text-fg-muted'
          "
          @click="selectPlaylist(p.id)"
          @dragover.prevent="dragOverPlaylistId = p.id"
          @dragleave="dragOverPlaylistId = null"
          @drop.prevent="onPlaylistDrop($event, p.id)"
        >
          <span class="truncate flex-1">{{ p.name }}</span>
          <span class="text-fg-faint">{{ p.tracks.length }}</span>
        </button>
        <div v-if="library.playlists.length === 0" class="text-xs text-fg-faint italic px-2">
          {{ $t('common.noPlaylists') }}
        </div>
      </div>
    </div>

    <div v-if="selectedPlaylist" class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center justify-between p-3 border-b border-border-default">
        <div>
          <h2 class="text-sm font-bold">{{ selectedPlaylist.name }}</h2>
          <p class="text-xs text-fg-faint">
            {{ selectedPlaylist.tracks.length }} {{ $t('library.tracksCount') }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            :disabled="selectedPlaylist.tracks.length === 0"
            @click="playAll"
          >
            <Play :size="12" /> {{ $t('library.playAll') }}
          </button>
          <button
            class="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-bg-elevated transition-colors"
            @click="deleteSelected"
          >
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
      <div
        class="flex-1 overflow-auto p-2"
        @dragover.prevent
        @drop.prevent="selectedPlaylistId && onPlaylistDrop($event, selectedPlaylistId)"
      >
        <LibraryTrackRow
          v-for="track in selectedPlaylist.tracks"
          :key="track.path"
          :track="track"
          :playlist-id="selectedPlaylist.id"
        />
        <div
          v-if="selectedPlaylist.tracks.length === 0"
          class="text-xs text-fg-faint italic p-4 text-center"
        >
          Playlista jest pusta. Dodaj utwory z zakładki "Utwory" lub "Video".
        </div>
      </div>
    </div>

    <div v-else class="flex-1 flex items-center justify-center text-sm text-fg-faint italic">
      Wybierz playlistę, aby zobaczyć jej zawartość
    </div>
  </div>
</template>
