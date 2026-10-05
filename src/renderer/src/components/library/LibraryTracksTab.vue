<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useVirtualList } from '@renderer/composables/useVirtualList';
import { Music2, LayoutList, LayoutGrid } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import { useLibraryStore } from '@renderer/stores/library';
import { useLibrarySelectionStore } from '@renderer/stores/library-selection';
import { usePlayerStore } from '@renderer/stores/player';
import LibraryTrackRow from '@renderer/components/library/LibraryTrackRow.vue';
import LibraryTrackCard from '@renderer/components/library/LibraryTrackCard.vue';
import LibraryTracksBulkBar from '@renderer/components/library/LibraryTracksBulkBar.vue';
import LibraryTracksEmpty from '@renderer/components/library/LibraryTracksEmpty.vue';

const props = withDefaults(
  defineProps<{
    tracks: MediaFile[];
    viewMode: 'list' | 'grid';
    chip?: string;
    query?: string;
  }>(),
  { chip: 'all', query: '' }
);
const emit = defineEmits<{
  'update:viewMode': [mode: 'list' | 'grid'];
  play: [track: MediaFile];
  playAll: [];
  shuffleAll: [];
  edit: [track: MediaFile];
  navigateFolder: [path: string];
}>();

const library = useLibraryStore();
const player = usePlayerStore();
// Zaznaczenie w store (współdzielone z menu kontekstowym).
const selection = useLibrarySelectionStore();
const selectedCount = computed(() => selection.count);
const selectedTracks = computed(() => props.tracks.filter((t) => selection.has(t.path)));
function playSelected() {
  if (selectedTracks.value.length === 0) return;
  const t = selectedTracks.value;
  player.clearQueue();
  if (t.length > 1) player.addToQueueMultiple(t.slice(1));
  player.setTrack(t[0]);
  player.play();
  clearSelection();
}
function queueSelected() {
  selectedTracks.value.forEach((tr) => player.addToQueue(tr));
  clearSelection();
}
function addSelectedToPlaylist(pid: string) {
  for (const tr of selectedTracks.value) library.addToPlaylist(pid, tr);
  clearSelection();
}

function isSelected(path: string) {
  return selection.has(path);
}
function toggleSelect(index: number, e?: MouseEvent | KeyboardEvent, additive = false) {
  const track = props.tracks[index];
  if (!track) return;
  const isShift = e?.shiftKey;
  if (isShift) {
    // Shift rozszerza zakres od ostatniego punktu (wielokrotny wybór zakresu).
    selection.selectRange(props.tracks, track.path);
  } else {
    // Zwykły klik (i checkbox) PRZEŁĄCZA utwór w zbiorze, więc wiele utworów
    // zaznacza się bez Ctrl — dokładnie tak, jak oczekuje użytkownik.
    // `additive` pozostaje w sygnaturze dla zgodności wywołań z karty/wiersza.
    void additive;
    selection.toggle(track.path);
  }
}
function clearSelection() {
  selection.clear();
}
function handleEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedCount.value > 0) {
    e.preventDefault();
    clearSelection();
  }
}
// Zmiana listy (filtr/skan) unieważnia zaznaczenie — nie pokazuj zaznaczonych
// pozycji, których już nie ma na widocznej liście.
watch(() => props.tracks, clearSelection);

const trackListRef = ref<HTMLElement | null>(null);

const trackVirtualizer = useVirtualList({
  count: () => props.tracks.length,
  scrollEl: () => trackListRef.value,
  estimateSize: () => 48,
  overscan: 10
});

const trackGridRef = ref<HTMLElement | null>(null);
const grid = useVirtualGrid(trackGridRef, 220, 6);

// Wysokość wiersza MUSI być mierzona, a nie szacowana na sztywno: karta ma
// wysokość zależną od zawartości (okładka 4:3 + tytuł/artysta), a pasek
// zaznaczenia nad siatką zmienia offset. Stały `estimateSize` (dawniej 280 px
// przy ~165 px karty) rozjeżdżał wiersze i po zaznaczeniu nakładał je na siebie.
// `measureElement` mierzy realny wiersz; `estimateSize` to tylko pierwsza wartość.
const trackRowVirtualizer = useVirtualList({
  count: () => Math.ceil(props.tracks.length / grid.cols.value),
  scrollEl: () => trackGridRef.value,
  estimateSize: () => 200,
  measureElement: (el: Element) => el.getBoundingClientRect().height,
  overscan: 3
});

const visibleTracksGrid = computed(() => {
  const items = trackRowVirtualizer.value.getVirtualItems();
  const cols = grid.cols.value;
  const result: Array<{ top: number; index: number; tracks: MediaFile[] }> = [];
  for (const row of items) {
    const start = row.index * cols;
    const end = Math.min(start + cols, props.tracks.length);
    result.push({
      top: row.start,
      index: row.index,
      tracks: props.tracks.slice(start, end)
    });
  }
  return result;
});

onMounted(() => {
  grid.observe();
  window.addEventListener('keydown', handleEsc);
});
onUnmounted(() => {
  grid.destroy();
  window.removeEventListener('keydown', handleEsc);
});
</script>

<template>
  <LibraryTracksEmpty v-if="tracks.length === 0" :liked="chip === 'liked'" />
  <template v-else>
    <div
      class="flex items-center justify-between px-4 py-2.5 bg-base-100/50 backdrop-blur border-b border-base-300 shrink-0 sticky top-0 z-[1]"
    >
      <span class="text-xs font-medium text-base-content/60"
        >{{ tracks.length }} {{ $t('library.tracksCount') }}</span
      >
      <div class="flex items-center gap-1.5">
        <button
          data-testid="library-view-list"
          class="p-2 rounded-full transition-colors"
          :class="
            viewMode === 'list'
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 border border-base-300 text-base-content/50 hover:text-base-content hover:border-primary/30'
          "
          :title="$t('library.viewModeList')"
          :aria-label="$t('library.viewModeList')"
          @click="emit('update:viewMode', 'list')"
        >
          <LayoutList :size="14" />
        </button>
        <button
          data-testid="library-view-grid"
          class="p-2 rounded-full transition-colors"
          :class="
            viewMode === 'grid'
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 border border-base-300 text-base-content/50 hover:text-base-content hover:border-primary/30'
          "
          :title="$t('library.viewModeGrid')"
          :aria-label="$t('library.viewModeGrid')"
          @click="emit('update:viewMode', 'grid')"
        >
          <LayoutGrid :size="14" />
        </button>
        <div class="w-px h-6 bg-base-300 mx-1"></div>
        <button
          data-testid="library-play-all"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors fx-depth fx-noise"
          @click="emit('playAll')"
        >
          <Music2 :size="12" /> <span class="hidden sm:inline">{{ $t('library.playAll') }}</span
          ><span class="sm:hidden">{{ $t('common.play') }}</span>
        </button>
        <button
          class="p-2 rounded-full bg-base-100 border border-base-300 text-base-content/60 hover:text-primary hover:border-primary/30 transition-colors"
          :title="$t('library.shuffle')"
          @click="emit('shuffleAll')"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
            <polyline points="21 16 21 21 16 21" />
            <line x1="15" y1="15" x2="9" y2="9" />
            <line x1="4" y1="4" x2="9" y2="9" />
            <line x1="15" y1="15" x2="21" y2="21" />
            <line x1="4" y1="20" x2="9" y2="15" />
          </svg>
        </button>
      </div>
    </div>
    <!-- Pasek zbiorczy -->
    <LibraryTracksBulkBar
      v-if="selectedCount > 0"
      :count="selectedCount"
      :playlists="library.playlists"
      @play="playSelected"
      @queue="queueSelected"
      @add-to-playlist="addSelectedToPlaylist"
      @clear="clearSelection"
    />

    <template v-if="viewMode === 'list'">
      <div ref="trackListRef" class="flex-1 overflow-auto">
        <div
          :style="{
            height: trackVirtualizer.getTotalSize() + 'px',
            width: '100%',
            position: 'relative'
          }"
        >
          <div
            v-for="v in trackVirtualizer.getVirtualItems()"
            :key="'track-' + v.key"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: v.size + 'px',
              transform: 'translateY(' + v.start + 'px)'
            }"
          >
            <LibraryTrackRow
              :track="tracks[v.index]"
              :show-playlist="true"
              :selected="isSelected(tracks[v.index].path)"
              :query="query"
              @play="emit('play', $event)"
              @edit="emit('edit', $event)"
              @select="(e, additive) => toggleSelect(v.index, e, additive)"
            />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div ref="trackGridRef" class="flex-1 overflow-auto p-4">
        <div :style="{ height: trackRowVirtualizer.getTotalSize() + 'px', position: 'relative' }">
          <div
            v-for="row in visibleTracksGrid"
            :key="'tgr-' + row.index"
            :ref="(el) => trackRowVirtualizer.measureElement(el as Element | null)"
            :data-index="row.index"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: 'translateY(' + row.top + 'px)',
              display: 'flex',
              alignItems: 'stretch',
              gap: '12px',
              padding: '6px'
            }"
          >
            <LibraryTrackCard
              v-for="(card, cIdx) in row.tracks"
              :key="card.path"
              :track="card"
              :show-playlist="true"
              :selected="isSelected(card.path)"
              @play="emit('play', $event)"
              @edit="emit('edit', $event)"
              @select="
                (e, additive) => toggleSelect(row.index * grid.cols.value + cIdx, e, additive)
              "
            />
          </div>
        </div>
      </div>
    </template>
  </template>
</template>
