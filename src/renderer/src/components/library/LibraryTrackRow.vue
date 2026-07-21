<script setup lang="ts">
import { ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { Plus, Play, Trash2, ListMusic } from '@lucide/vue';

const props = defineProps<{
  track: MediaFile;
  showPlaylist?: boolean;
  playlistId?: string;
}>();

const library = useLibraryStore();
const player = usePlayerStore();
const showPlaylistMenu = ref(false);
const playlistBtn = ref<HTMLElement | null>(null);

function playNow() {
  player.setTrack(props.track);
  player.play();
}

function addToPlaylist(id: string) {
  library.addToPlaylist(id, props.track);
  showPlaylistMenu.value = false;
}

function removeFromPlaylist() {
  if (props.playlistId) {
    library.removeFromPlaylist(props.playlistId, props.track.path);
  }
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!playlistBtn.value?.contains(target) && !target.closest('.playlist-popup')) {
    showPlaylistMenu.value = false;
  }
}

function togglePlaylist(e: MouseEvent) {
  e.stopPropagation();
  showPlaylistMenu.value = !showPlaylistMenu.value;
  if (showPlaylistMenu.value) {
    document.addEventListener('click', onClickOutside, { once: true });
  }
}
</script>

<template>
  <div
    class="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover transition-colors cursor-pointer"
    @dblclick="playNow"
  >
    <div class="relative shrink-0 w-9 h-9 rounded-lg overflow-hidden bg-bg-elevated">
      <video
        v-if="player.getCover(props.track.path).type === 'video'"
        :src="'file:///' + player.getCover(props.track.path).data"
        class="w-full h-full object-cover"
        muted
        loop
        playsinline
        autoplay
      />
      <img
        v-else-if="player.getCover(props.track.path).type === 'image'"
        :src="player.getCover(props.track.path).data || ''"
        class="w-full h-full object-cover"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center text-fg-faint/40 group-hover:hidden"
      >
        <Play :size="14" />
      </div>
      <button
        class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors"
        @click="playNow"
      >
        <Play :size="16" class="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>

    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium truncate">{{ track.metadata?.title || track.name }}</div>
      <div class="text-xs text-fg-faint truncate">
        {{
          track.metadata?.artist || track.metadata?.album
            ? `${track.metadata?.artist || 'Nieznany'} · ${track.metadata?.album || ''}`
            : track.extension
        }}
      </div>
    </div>

    <div
      class="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <div v-if="showPlaylist" ref="playlistBtn" class="relative">
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-elevated transition-colors"
          @click="togglePlaylist"
        >
          <Plus :size="14" />
        </button>
        <div
          v-if="showPlaylistMenu"
          class="playlist-popup absolute right-0 top-full mt-1.5 w-48 bg-bg-elevated border border-border-default rounded-xl shadow-xl py-1 z-50"
          @click.stop
        >
          <button
            v-for="p in library.playlists"
            :key="p.id"
            class="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-bg-hover transition-colors truncate flex items-center gap-2"
            @click="addToPlaylist(p.id)"
          >
            <ListMusic :size="12" class="shrink-0" />{{ p.name }}
          </button>
          <div
            v-if="library.playlists.length === 0"
            class="px-3 py-1.5 text-xs text-fg-faint italic"
          >
            Brak playlist
          </div>
        </div>
      </div>

      <button
        v-if="playlistId"
        class="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-bg-elevated transition-colors"
        @click="removeFromPlaylist"
      >
        <Trash2 :size="14" />
      </button>
    </div>
  </div>
</template>
