<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { Play, Trash2, Edit3, Heart } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
import HighlightText from '@renderer/components/ui/HighlightText.vue';
import PlaylistAddMenu from './PlaylistAddMenu.vue';
import { formatDuration } from '@renderer/utils/formatters';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';

const { showTrackMenu } = useLibraryContextMenu();

const props = defineProps<{
  track: MediaFile;
  showPlaylist?: boolean;
  playlistId?: string;
  dragIndex?: number;
  selected?: boolean;
  query?: string;
}>();
const emit = defineEmits<{
  play: [track: MediaFile];
  edit: [track: MediaFile];
  select: [e: MouseEvent | KeyboardEvent, additive: boolean];
}>();

// Checkbox to wielokrotny wybór (przełączanie), sam klik wiersza zastępuje zaznaczenie.
function onCheckboxClick(e: MouseEvent) {
  emit('select', e, true);
}

const library = useLibraryStore();
const player = usePlayerStore();
const hovered = ref(false);
const attrs = useAttrs();

// Policz raz na render zamiast czterech wywołań w szablonie (`isFavorite` 4×).
const favorite = computed(() => player.isFavorite(props.track.path));

function playNow() {
  emit('play', props.track);
  if (!attrs.onPlay) {
    player.setTrack(props.track);
    player.play();
  }
}

function removeFromPlaylist() {
  if (props.playlistId) {
    library.removeFromPlaylist(props.playlistId, props.track.path);
  }
}

function onFavoriteClick(e: MouseEvent) {
  // Nie zaznaczaj wiersza przy kliknięciu serca.
  e.stopPropagation();
  player.toggleFavorite(props.track.path);
}

function onContextMenu(e: MouseEvent) {
  showTrackMenu(e, props.track, { onEdit: () => emit('edit', props.track) });
}

function onHoverCover() {
  hovered.value = true;
}

function onHoverLeave() {
  hovered.value = false;
}

function onDragStart(e: DragEvent) {
  const payload: { paths: string[]; playlistId?: string; dragIndex?: number } = {
    paths: [props.track.path]
  };
  if (props.playlistId) {
    payload.playlistId = props.playlistId;
    payload.dragIndex = props.dragIndex;
  }
  if (!e.dataTransfer) return;
  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
}
</script>

<template>
  <div
    data-testid="library-track"
    role="listitem"
    tabindex="0"
    class="group flex items-center gap-3 px-3 py-2.5 rounded-field hover:bg-base-100 border transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
    :class="
      selected
        ? 'bg-primary/10 border-primary/30'
        : 'border-transparent hover:border-base-300 hover:shadow-sm'
    "
    draggable="true"
    @click="emit('select', $event, false)"
    @dblclick="playNow"
    @keydown.enter.self="playNow"
    @keydown.space.self.prevent="emit('select', $event, false)"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
    @mouseenter="onHoverCover"
    @mouseleave="onHoverLeave"
  >
    <input
      type="checkbox"
      :checked="selected"
      class="checkbox checkbox-xs shrink-0"
      :aria-label="track.metadata?.title || track.name"
      data-testid="library-track-select"
      @click.stop="onCheckboxClick"
    />
    <div
      class="relative shrink-0 w-10 h-10 rounded-field overflow-hidden bg-base-200 border border-base-300"
    >
      <MediaCover :path="props.track.path" :size="14" :autoplay="hovered" fallback="play" />
      <button
        data-testid="library-track-play"
        class="absolute inset-0 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/50 transition-colors"
        :aria-label="$t('common.play')"
        @click.stop="playNow"
      >
        <Play
          :size="15"
          class="text-neutral-content opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-0.5 fill-neutral-content"
        />
      </button>
    </div>

    <div class="flex-1 min-w-0">
      <HighlightText
        class="text-sm font-medium truncate leading-none block"
        :text="track.metadata?.title || track.name"
        :query="query"
      />
      <div class="text-xs text-base-content/50 truncate mt-1 flex items-center gap-1">
        <HighlightText
          class="truncate"
          :text="track.metadata?.artist || $t('common.unknown')"
          :query="query"
        />
        <span v-if="track.metadata?.album" class="opacity-40">·</span>
        <HighlightText
          v-if="track.metadata?.album"
          class="truncate opacity-80"
          :text="track.metadata.album"
          :query="query"
        />
        <span v-if="!track.metadata?.artist && !track.metadata?.album" class="opacity-60">{{
          track.extension
        }}</span>
      </div>
    </div>

    <div
      class="hidden sm:block text-xs font-mono text-base-content/60 tabular-nums shrink-0 w-12 text-right"
    >
      {{ formatDuration(track.duration, '—') }}
    </div>

    <div
      class="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150"
    >
      <IconButton
        :label="favorite ? $t('common.removeFav') : $t('common.addFav')"
        :pressed="favorite"
        :variant="favorite ? 'danger' : 'default'"
        @click="onFavoriteClick"
      >
        <Heart :size="14" :fill="favorite ? 'currentColor' : 'none'" />
      </IconButton>
      <PlaylistAddMenu
        v-if="showPlaylist"
        :tracks="[track]"
        button-class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-100 transition-colors duration-150"
      />

      <IconButton :icon="Edit3" :label="$t('common.editTags')" @click="emit('edit', track)" />

      <IconButton
        v-if="playlistId"
        :icon="Trash2"
        :label="$t('common.delete')"
        variant="danger"
        @click="removeFromPlaylist"
      />
    </div>
  </div>
</template>
