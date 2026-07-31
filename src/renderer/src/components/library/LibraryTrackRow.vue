<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { Plus, Play, Trash2, ListMusic, Edit3, Heart } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';

const { t } = useI18n();

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
const ui = useUIStore();
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
    class="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg-hover transition-colors cursor-pointer"
    draggable="true"
    @dblclick="playNow"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
  >
    <div class="relative shrink-0 w-9 h-9 rounded-lg overflow-hidden bg-bg-elevated">
      <MediaCover :path="props.track.path" :size="14" :autoplay="true" fallback="play" />
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
            ? `${track.metadata?.artist || $t('common.unknown')} · ${track.metadata?.album || ''}`
            : track.extension
        }}
      </div>
    </div>

    <div
      class="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <button
        class="p-1.5 rounded-lg transition-colors"
        :class="
          player.isFavorite(track.path)
            ? 'text-red-base hover:text-red-hover'
            : 'text-fg-faint hover:text-fg-base hover:bg-bg-elevated'
        "
        :title="player.isFavorite(track.path) ? $t('common.removeFav') : $t('common.addFav')"
        @click.stop="player.toggleFavorite(track.path)"
      >
        <Heart :size="14" :fill="player.isFavorite(track.path) ? 'currentColor' : 'none'" />
      </button>
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
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-elevated transition-colors"
        :title="$t('common.editTags')"
        @click="emit('edit', track)"
      >
        <Edit3 :size="14" />
      </button>

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
