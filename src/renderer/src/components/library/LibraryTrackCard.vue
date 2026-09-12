<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import { Play, Plus, Heart, Edit3, ListMusic, Trash2 } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { formatDuration } from '@renderer/utils/formatters';

const { t } = useI18n();

const props = defineProps<{
  track: MediaFile;
  showPlaylist?: boolean;
  playlistId?: string;
  selected?: boolean;
}>();

const emit = defineEmits<{
  play: [track: MediaFile];
  edit: [track: MediaFile];
  select: [e: MouseEvent];
}>();

const library = useLibraryStore();
const player = usePlayerStore();
const { showTrackMenu } = useLibraryContextMenu();
const showPlaylistMenu = ref(false);
const playlistBtn = ref<HTMLElement | null>(null);
const hovered = ref(false);
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
  showTrackMenu(e, props.track, { onEdit: () => emit('edit', props.track) });
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: [props.track.path] }));
  e.dataTransfer!.effectAllowed = 'move';
}

function onHover() {
  hovered.value = true;
  player.loadCover(props.track.path);
}

function onHoverLeave() {
  hovered.value = false;
}
</script>

<template>
  <button
    class="flex-1 flex flex-col fx-depth rounded-box fx-noise border transition-all overflow-hidden group text-left min-w-0"
    :class="
      selected
        ? 'bg-primary/10 border-primary/50'
        : 'bg-base-100 border-base-300 hover:bg-base-content/10 hover:border-primary/30'
    "
    draggable="true"
    @click="emit('select', $event as unknown as MouseEvent)"
    @dblclick="playNow"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
    @mouseenter="onHover"
    @mouseleave="onHoverLeave"
  >
    <div
      class="w-full aspect-4/3 bg-neutral flex items-center justify-center relative overflow-hidden"
    >
      <MediaCover :path="props.track.path" :size="40" :autoplay="hovered" fallback="play" />
      <div
        class="absolute inset-0 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/20 transition-colors"
        @click.stop="playNow"
      >
        <div
          class="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        >
          <Play :size="22" class="text-primary-content ml-0.5" />
        </div>
      </div>

      <!-- Actions top-right -->
      <div
        class="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        @click.stop
      >
        <button
          class="fx-noise p-1.5 fx-depth rounded-field bg-neutral/40 backdrop-blur-sm transition-colors"
          :class="
            player.isFavorite(track.path)
              ? 'text-error hover:text-error/90'
              : 'text-neutral-content/80 hover:text-neutral-content hover:bg-neutral/60'
          "
          :title="player.isFavorite(track.path) ? $t('common.removeFav') : $t('common.addFav')"
          @click.stop="player.toggleFavorite(track.path)"
        >
          <Heart :size="15" :fill="player.isFavorite(track.path) ? 'currentColor' : 'none'" />
        </button>
        <div v-if="showPlaylist" ref="playlistBtn" class="relative">
          <button
            class="fx-noise p-1.5 fx-depth rounded-field bg-neutral/40 backdrop-blur-sm text-neutral-content/80 hover:text-neutral-content hover:bg-neutral/60 transition-colors"
            @click="togglePlaylist"
          >
            <Plus :size="15" />
          </button>
          <Teleport to="body">
            <div
              v-if="showPlaylistMenu"
              class="playlist-popup fixed w-48 bg-base-100 border border-base-300 rounded-box shadow-xl py-1 z-50"
              :style="playlistPopupStyle"
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
          </Teleport>
        </div>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field bg-neutral/40 backdrop-blur-sm text-neutral-content/80 hover:text-neutral-content hover:bg-neutral/60 transition-colors"
          :title="$t('common.editTags')"
          @click="emit('edit', track)"
        >
          <Edit3 :size="15" />
        </button>
        <button
          v-if="playlistId"
          class="fx-noise p-1.5 fx-depth rounded-field bg-neutral/40 backdrop-blur-sm text-error hover:text-error/80 hover:bg-neutral/60 transition-colors"
          @click="removeFromPlaylist"
        >
          <Trash2 :size="15" />
        </button>
      </div>

      <div
        v-if="track.duration"
        class="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-field bg-neutral/60 text-neutral-content text-[11px] font-medium"
      >
        {{ formatDuration(track.duration, '—') }}
      </div>
    </div>
    <div class="p-3">
      <div class="text-sm font-medium truncate leading-snug">
        {{ track.metadata?.title || track.name }}
      </div>
      <div class="text-xs text-base-content/50 mt-1 truncate">
        {{ track.metadata?.artist || t('common.unknown')
        }}{{ track.metadata?.album ? ` · ${track.metadata.album}` : '' }}
      </div>
    </div>
  </button>
</template>
