<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { Play, Plus, Heart, Edit3, ListMusic, Trash2 } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { formatDuration } from '@renderer/utils/formatters';

const { t } = useI18n();

const props = defineProps<{
  track: MediaFile;
  showPlaylist?: boolean;
  playlistId?: string;
}>();

const emit = defineEmits<{
  play: [track: MediaFile];
  edit: [track: MediaFile];
}>();

const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const showPlaylistMenu = ref(false);
const playlistBtn = ref<HTMLElement | null>(null);

function playNow() {
  emit('play', props.track);
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
  e.preventDefault();
  ui.showContextMenu(e.clientX, e.clientY, [
    { label: t('common.play'), action: () => playNow() },
    { label: t('common.addToQueue'), action: () => player.addToQueue(props.track) },
    { label: t('common.editTags'), action: () => emit('edit', props.track) },
    {
      label: t('common.showInFolder'),
      action: () => window.api?.invoke('shell:showItemInFolder', props.track.path)
    },
    ...(library.playlists.length > 0 ? [{ label: '—', separator: true } as const] : []),
    ...library.playlists.map((p) => {
      const inPlaylist = p.tracks.some((t) => t.path === props.track.path);
      return {
        label: `${inPlaylist ? '−' : '+'} ${p.name}`,
        action: () => {
          if (inPlaylist) {
            library.removeFromPlaylist(p.id, props.track.path);
          } else {
            library.addToPlaylist(p.id, props.track);
          }
        }
      };
    })
  ]);
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: [props.track.path] }));
  e.dataTransfer!.effectAllowed = 'move';
}
</script>

<template>
  <button
    class="flex-1 flex flex-col rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover hover:border-accent-base/30 transition-all overflow-hidden group text-left min-w-0"
    draggable="true"
    @click="playNow"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div
      class="w-full aspect-4/3 bg-bg-overlay flex items-center justify-center relative overflow-hidden"
    >
      <MediaCover :path="props.track.path" :size="40" fallback="play" />
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors"
      >
        <div
          class="w-12 h-12 rounded-full bg-accent-base/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        >
          <Play :size="22" class="text-white ml-0.5" />
        </div>
      </div>

      <!-- Actions top-right -->
      <div
        class="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        @click.stop
      >
        <button
          class="p-1.5 rounded-lg bg-black/40 backdrop-blur-sm transition-colors"
          :class="
            player.isFavorite(track.path)
              ? 'text-red-base hover:text-red-hover'
              : 'text-white/80 hover:text-white hover:bg-black/60'
          "
          :title="player.isFavorite(track.path) ? $t('common.removeFav') : $t('common.addFav')"
          @click.stop="player.toggleFavorite(track.path)"
        >
          <Heart :size="15" :fill="player.isFavorite(track.path) ? 'currentColor' : 'none'" />
        </button>
        <div v-if="showPlaylist" ref="playlistBtn" class="relative">
          <button
            class="p-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-colors"
            @click="togglePlaylist"
          >
            <Plus :size="15" />
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
              :class="{ 'text-accent-base': p.tracks.some((t) => t.path === props.track.path) }"
              @click="toggleTrackInPlaylist(p.id)"
            >
              <ListMusic :size="12" class="shrink-0" />{{
                p.tracks.some((t) => t.path === props.track.path) ? '✓ ' : '+ '
              }}{{ p.name }}
            </button>
            <div
              v-if="library.playlists.length === 0"
              class="px-3 py-1.5 text-xs text-fg-faint italic"
            >
              {{ $t('common.noPlaylists') }}
            </div>
          </div>
        </div>
        <button
          class="p-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-colors"
          :title="$t('common.editTags')"
          @click="emit('edit', track)"
        >
          <Edit3 :size="15" />
        </button>
        <button
          v-if="playlistId"
          class="p-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-red-300 hover:text-red-200 hover:bg-black/60 transition-colors"
          @click="removeFromPlaylist"
        >
          <Trash2 :size="15" />
        </button>
      </div>

      <div
        v-if="track.duration"
        class="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-medium"
      >
        {{ formatDuration(track.duration, '—') }}
      </div>
    </div>
    <div class="p-3">
      <div class="text-sm font-medium truncate leading-snug">
        {{ track.metadata?.title || track.name }}
      </div>
      <div class="text-xs text-fg-faint mt-1 truncate">
        {{ track.metadata?.artist || t('common.unknown')
        }}{{ track.metadata?.album ? ` · ${track.metadata.album}` : '' }}
      </div>
    </div>
  </button>
</template>
