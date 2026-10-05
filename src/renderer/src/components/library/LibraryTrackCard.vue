<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import { Play, Heart, Edit3, Trash2 } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import PlaylistAddMenu from './PlaylistAddMenu.vue';
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
  select: [e: MouseEvent, additive: boolean];
}>();

// Checkbox to wielokrotny wybór (przełączanie), sam klik karty zastępuje zaznaczenie.
function onCheckboxClick(e: MouseEvent) {
  emit('select', e, true);
}

// Klawiatura (Space/Enter na karcie = rola button) niesie te same modyfikatory;
// przekazujemy zdarzenie jako wspólny kształt, bo `select` czyta tylko ctrl/shift/meta.
function onKeySelect(e: KeyboardEvent) {
  emit('select', e as unknown as MouseEvent, false);
}

const library = useLibraryStore();
const player = usePlayerStore();
const { showTrackMenu } = useLibraryContextMenu();
const hovered = ref(false);

function playNow() {
  emit('play', props.track);
}

function removeFromPlaylist() {
  if (props.playlistId) {
    library.removeFromPlaylist(props.playlistId, props.track.path);
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
  <!-- Root to role=button, nie button: w karcie są przyciski akcji (ulubione/playlisty/tagi). -->
  <div
    data-testid="library-track-card"
    role="button"
    tabindex="0"
    :aria-pressed="selected"
    :aria-label="track.metadata?.title || track.name"
    class="flex-1 flex flex-col fx-depth rounded-box fx-noise border transition-all overflow-hidden group text-left min-w-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
    :class="
      selected
        ? 'bg-primary/10 border-primary/50'
        : 'bg-base-100 border-base-300 hover:bg-base-content/10 hover:border-primary/30'
    "
    draggable="true"
    @click="emit('select', $event, false)"
    @keydown.enter.prevent="playNow"
    @keydown.space.prevent="onKeySelect($event)"
    @dblclick="playNow"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
    @mouseenter="onHover"
    @mouseleave="onHoverLeave"
  >
    <div
      class="w-full aspect-4/3 bg-neutral flex items-center justify-center relative overflow-hidden"
    >
      <!-- Jawny checkbox: zaznaczanie pojedynczego utworu działa na kartach
           niezależnie od kliknięcia/odtwarzania (spójnie z widokiem listy). -->
      <input
        type="checkbox"
        class="checkbox checkbox-xs absolute top-1.5 left-1.5 z-10"
        :checked="selected"
        :aria-label="track.metadata?.title || track.name"
        data-testid="library-track-select"
        @click.stop="onCheckboxClick"
      />
      <MediaCover :path="props.track.path" :size="40" :autoplay="hovered" fallback="play" />
      <!-- Klik w okładkę tylko ZAZNACZA (spójnie z wierszem); odtwarzanie przez
           przycisk play lub dwuklik. -->
      <div
        class="absolute inset-0 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/20 transition-colors"
        role="presentation"
        aria-hidden="true"
        @click.stop="emit('select', $event, false)"
      >
        <button
          type="button"
          data-testid="library-track-play"
          class="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          :aria-label="$t('common.play')"
          @click.stop="playNow"
        >
          <Play :size="22" class="text-primary-content ml-0.5" />
        </button>
      </div>

      <!-- Akcje w prawym górnym rogu -->
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
        <PlaylistAddMenu
          v-if="showPlaylist"
          :tracks="[track]"
          :icon-size="15"
          button-class="fx-noise p-1.5 fx-depth rounded-field bg-neutral/40 backdrop-blur-sm text-neutral-content/80 hover:text-neutral-content hover:bg-neutral/60 transition-colors"
        />
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
          :aria-label="$t('library.removeFromPlaylist')"
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
  </div>
</template>
