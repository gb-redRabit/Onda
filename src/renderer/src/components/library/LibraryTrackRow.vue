<script setup lang="ts">
import { ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { Plus, Play, Trash2, ListMusic, Edit3, Heart } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { formatDuration } from '@renderer/utils/formatters';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';

const { showTrackMenu } = useLibraryContextMenu();

const props = defineProps<{
  track: MediaFile;
  showPlaylist?: boolean;
  playlistId?: string;
  dragIndex?: number;
}>();
const emit = defineEmits<{
  edit: [track: MediaFile];
}>();

const library = useLibraryStore();
const player = usePlayerStore();
const showPlaylistMenu = ref(false);
const playlistBtn = ref<HTMLElement | null>(null);

function playNow() {
  player.setTrack(props.track);
  player.play();
}

function removeFromPlaylist() {
  if (props.playlistId) {
    library.removeFromPlaylist(props.playlistId, props.track.path);
  }
}

function toggleTrackInPlaylist(playlistId: string) {
  const p = library.playlists.find((pl) => pl.id === playlistId);
  if (!p) return;
  if (p.tracks.some((t) => t.path === props.track.path)) {
    library.removeFromPlaylist(playlistId, props.track.path);
  } else {
    library.addToPlaylist(playlistId, props.track);
  }
  showPlaylistMenu.value = false;
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

function onContextMenu(e: MouseEvent) {
  showTrackMenu(e, props.track, { onEdit: () => emit('edit', props.track) });
}

function onDragStart(e: DragEvent) {
  const payload: { paths: string[]; playlistId?: string; dragIndex?: number } = {
    paths: [props.track.path]
  };
  if (props.playlistId) {
    payload.playlistId = props.playlistId;
    payload.dragIndex = props.dragIndex;
  }
  e.dataTransfer?.setData('text/plain', JSON.stringify(payload));
  e.dataTransfer!.effectAllowed = 'move';
}
</script>

<template>
  <div
    class="group flex items-center gap-3 px-3 py-2.5 rounded-field hover:bg-base-100 border border-transparent hover:border-base-300 hover:shadow-sm transition-all duration-150 cursor-pointer"
    draggable="true"
    @dblclick="playNow"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div class="relative shrink-0 w-10 h-10 rounded-field overflow-hidden bg-base-200 border border-base-300">
      <MediaCover :path="props.track.path" :size="14" :autoplay="true" fallback="play" />
      <button
        class="absolute inset-0 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/50 transition-colors"
        @click="playNow"
      >
        <Play :size="15" class="text-neutral-content opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 fill-neutral-content" />
      </button>
    </div>

    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium truncate leading-none">{{ track.metadata?.title || track.name }}</div>
      <div class="text-xs text-base-content/50 truncate mt-1 flex items-center gap-1">
        <span class="truncate">{{ track.metadata?.artist || $t('common.unknown') }}</span>
        <span v-if="track.metadata?.album" class="opacity-40">·</span>
        <span v-if="track.metadata?.album" class="truncate opacity-80">{{ track.metadata.album }}</span>
        <span v-if="!track.metadata?.artist && !track.metadata?.album" class="opacity-60">{{ track.extension }}</span>
      </div>
    </div>

    <div class="hidden sm:block text-xs font-mono text-base-content/40 tabular-nums shrink-0 w-12 text-right">
      {{ formatDuration(track.duration, '—') }}
    </div>

    <div class="shrink-0 flex items-center gap-1">

      <button
        class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
        :class="
          player.isFavorite(track.path)
            ? 'text-error opacity-100 hover:text-error/90'
            : 'text-base-content/50 opacity-0 group-hover:opacity-100 hover:text-base-content hover:bg-base-100'
        "
        :title="player.isFavorite(track.path) ? $t('common.removeFav') : $t('common.addFav')"
        @click.stop="player.toggleFavorite(track.path)"
      >
        <Heart :size="14" :fill="player.isFavorite(track.path) ? 'currentColor' : 'none'" />
      </button>
      <div v-if="showPlaylist" ref="playlistBtn" class="relative opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-100 transition-colors"
          @click="togglePlaylist"
        >
          <Plus :size="14" />
        </button>
        <div
          v-if="showPlaylistMenu"
          class="playlist-popup absolute right-0 top-full mt-1.5 w-48 bg-base-100 border border-base-300 rounded-box shadow-xl py-1 z-50"
          @click.stop
        >
          <button
            v-for="p in library.playlists"
            :key="p.id"
            class="fx-noise w-full text-left px-3 py-1.5 text-xs fx-depth rounded-field hover:bg-base-content/10 transition-colors truncate flex items-center gap-2"
            :class="{ 'text-primary': p.tracks.some((t) => t.path === props.track.path) }"
            @click="toggleTrackInPlaylist(p.id)"
          >
            <ListMusic :size="12" class="shrink-0" />{{
              p.tracks.some((t) => t.path === props.track.path) ? '✓ ' : '+ '
            }}{{ p.name }}
          </button>
          <div
            v-if="library.playlists.length === 0"
            class="px-3 py-1.5 text-xs text-base-content/50 italic"
          >
            {{ $t('common.noPlaylists') }}
          </div>
        </div>
      </div>

      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-100 transition-colors opacity-0 group-hover:opacity-100"
        :title="$t('common.editTags')"
        @click="emit('edit', track)"
      >
        <Edit3 :size="14" />
      </button>

      <button
        v-if="playlistId"
        class="fx-noise p-1.5 fx-depth rounded-field text-error hover:text-error/80 hover:bg-base-100 transition-colors"
        @click="removeFromPlaylist"
      >
        <Trash2 :size="14" />
      </button>
    </div>
  </div>
</template>
