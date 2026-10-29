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
  <!-- Karta to <article> z jednym „rozciągniętym” przyciskiem na całą powierzchnię:
       klik zaznacza, dwuklik/Enter odtwarza. Dzięki temu nie ma zagnieżdżonych
       kontrolek (role=button z przyciskami w środku), a czytnik widzi jedną nazwę
       karty i osobne akcje. -->
  <article
    data-testid="library-track-card"
    class="relative flex-1 flex flex-col fx-depth rounded-box border transition-all overflow-hidden group text-left min-w-0"
    :class="
      selected
        ? 'bg-primary/12 border-primary/50'
        : 'bg-base-100 border-base-300/80 hover:border-primary/35'
    "
    draggable="true"
    @contextmenu.prevent="onContextMenu"
    @dragstart="onDragStart"
    @mouseenter="onHover"
    @mouseleave="onHoverLeave"
  >
    <button
      type="button"
      class="absolute inset-0 z-0 rounded-box focus-visible:ring-2 focus-visible:ring-primary/40"
      :aria-label="track.metadata?.title || track.name"
      :aria-pressed="selected"
      @click="emit('select', $event, false)"
      @dblclick="playNow"
      @keydown.enter.prevent="playNow"
    />

    <div class="relative z-10 flex flex-col pointer-events-none">
      <div
        class="w-full aspect-square bg-base-200 flex items-center justify-center relative overflow-hidden"
      >
        <!-- Jawny checkbox: zaznaczanie pojedynczego utworu działa na kartach
             niezależnie od kliknięcia/odtwarzania (spójnie z widokiem listy). -->
        <input
          type="checkbox"
          class="checkbox checkbox-xs pointer-events-auto absolute top-2 left-2 z-20 transition-opacity"
          :class="
            selected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          "
          :checked="selected"
          :aria-label="track.metadata?.title || track.name"
          data-testid="library-track-select"
          @click.stop="onCheckboxClick"
        />
        <MediaCover
          :path="props.track.path"
          :size="160"
          :autoplay="hovered"
          fallback="play"
          class="w-full h-full transition-transform duration-300 ease-out group-hover:scale-105"
        />
        <!-- Klik w okładkę tylko ZAZNACZA (spójnie z wierszem); odtwarzanie przez
             przycisk play lub dwuklik. Gradient jest dekoracyjny i nie ukrywa
             przycisku przed czytnikiem ekranu. -->
        <div
          class="absolute inset-0 bg-gradient-to-t from-base-300/80 via-base-300/10 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        >
          <button
            type="button"
            data-testid="library-track-play"
            class="pointer-events-auto absolute bottom-2 right-2 w-10 h-10 rounded-full bg-primary text-primary-content flex items-center justify-center translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0 transition-all shadow-lg"
            :aria-label="$t('common.play')"
            @click.stop="playNow"
          >
            <Play :size="18" class="ml-0.5" />
          </button>
        </div>

        <!-- Akcje w prawym górnym rogu -->
        <div
          class="pointer-events-auto absolute top-1.5 right-1.5 z-20 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
          @click.stop
        >
          <button
            type="button"
            class="p-1.5 rounded-field bg-base-300/80 backdrop-blur-sm transition-colors"
            :class="
              player.isFavorite(track.path)
                ? 'text-error hover:text-error/90'
                : 'text-base-content/80 hover:text-base-content hover:bg-base-300'
            "
            :aria-label="
              player.isFavorite(track.path) ? $t('common.removeFav') : $t('common.addFav')
            "
            :title="player.isFavorite(track.path) ? $t('common.removeFav') : $t('common.addFav')"
            @click.stop="player.toggleFavorite(track.path)"
          >
            <Heart :size="14" :fill="player.isFavorite(track.path) ? 'currentColor' : 'none'" />
          </button>
          <PlaylistAddMenu
            v-if="showPlaylist"
            :tracks="[track]"
            :icon-size="14"
            button-class="p-1.5 rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/80 hover:text-base-content hover:bg-base-300 transition-colors"
          />
          <button
            type="button"
            class="p-1.5 rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/80 hover:text-base-content hover:bg-base-300 transition-colors"
            :aria-label="$t('common.editTags')"
            :title="$t('common.editTags')"
            @click="emit('edit', track)"
          >
            <Edit3 :size="14" />
          </button>
          <button
            v-if="playlistId"
            type="button"
            class="p-1.5 rounded-field bg-base-300/80 backdrop-blur-sm text-error hover:text-error/80 hover:bg-base-300 transition-colors"
            :aria-label="$t('library.removeFromPlaylist')"
            @click="removeFromPlaylist"
          >
            <Trash2 :size="14" />
          </button>
        </div>

        <div
          v-if="track.duration"
          class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-field bg-base-300/80 backdrop-blur-sm text-base-content text-[10px] font-mono tabular-nums"
        >
          {{ formatDuration(track.duration, '—') }}
        </div>
      </div>
      <div class="p-2.5">
        <div class="text-[13px] font-medium truncate leading-snug">
          {{ track.metadata?.title || track.name }}
        </div>
        <div class="text-xs text-base-content/50 mt-0.5 truncate">
          {{ track.metadata?.artist || t('common.unknown')
          }}{{ track.metadata?.album ? ` · ${track.metadata.album}` : '' }}
        </div>
      </div>
    </div>
  </article>
</template>
