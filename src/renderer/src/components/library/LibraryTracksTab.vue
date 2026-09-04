<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Music2, LayoutList, LayoutGrid, X, ListMusic, Play } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import LibraryTrackRow from '@renderer/components/library/LibraryTrackRow.vue';
import LibraryTrackCard from '@renderer/components/library/LibraryTrackCard.vue';

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
const selected = ref<Set<string>>(new Set());
const lastIndex = ref<number | null>(null);
const selectedCount = computed(() => selected.value.size);
const selectedTracks = computed(() => props.tracks.filter((t) => selected.value.has(t.path)));
const showBulkPlaylist = ref(false);
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
  showBulkPlaylist.value = false;
  clearSelection();
}

function isSelected(path: string) {
  return selected.value.has(path);
}
function toggleSelect(index: number, e?: MouseEvent) {
  const track = props.tracks[index];
  if (!track) return;
  const isCtrl = e?.ctrlKey || e?.metaKey;
  const isShift = e?.shiftKey;
  if (isShift && lastIndex.value !== null) {
    const start = Math.min(lastIndex.value, index);
    const end = Math.max(lastIndex.value, index);
    const ns = new Set(selected.value);
    for (let i = start; i <= end; i++) ns.add(props.tracks[i].path);
    selected.value = ns;
  } else if (isCtrl) {
    const ns = new Set(selected.value);
    if (ns.has(track.path)) ns.delete(track.path);
    else ns.add(track.path);
    selected.value = ns;
    lastIndex.value = index;
  } else {
    if (selected.value.size === 1 && selected.value.has(track.path)) {
      selected.value = new Set();
      lastIndex.value = null;
      return;
    }
    selected.value = new Set([track.path]);
    lastIndex.value = index;
  }
}
function clearSelection() {
  selected.value = new Set();
  lastIndex.value = null;
}
function handleEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedCount.value > 0) {
    e.preventDefault();
    clearSelection();
  }
}
watch(() => props.tracks.length, clearSelection);

const trackListRef = ref<HTMLElement | null>(null);

const trackVirtualizer = useVirtualizer({
  get count() {
    return props.tracks.length;
  },
  getScrollElement: () => trackListRef.value,
  estimateSize: () => 48,
  overscan: 10
});

const trackGridRef = ref<HTMLElement | null>(null);
const grid = useVirtualGrid(trackGridRef, 220, 6);

const trackRowVirtualizer = useVirtualizer({
  get count() {
    return Math.ceil(props.tracks.length / grid.cols.value);
  },
  getScrollElement: () => trackGridRef.value,
  estimateSize: () => 280,
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
  <div
    v-if="tracks.length === 0"
    class="flex flex-col items-center justify-center h-full gap-4 text-base-content/50 p-8"
  >
    <div class="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center">
      <Music2 :size="28" class="opacity-40" />
    </div>
    <div class="text-center">
      <p class="text-sm font-medium">{{ chip === 'liked' ? $t('library.likedEmpty') : $t('library.noAudio') }}</p>
      <p class="text-xs mt-1 opacity-70">{{ $t('library.addFolderHint') }}</p>
    </div>
  </div>
  <template v-else>
    <div class="flex items-center justify-between px-4 py-2.5 bg-base-100/50 backdrop-blur border-b border-base-300 shrink-0 sticky top-0 z-[1]">
      <span class="text-xs font-medium text-base-content/60"
        >{{ tracks.length }} {{ $t('library.tracksCount') }}</span
      >
      <div class="flex items-center gap-1.5">
        <button
          class="p-2 rounded-full transition-colors"
          :class="
            viewMode === 'list'
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 border border-base-300 text-base-content/50 hover:text-base-content hover:border-primary/30'
          "
          :title="$t('library.viewModeList')"
          @click="emit('update:viewMode', 'list')"
        >
          <LayoutList :size="14" />
        </button>
        <button
          class="p-2 rounded-full transition-colors"
          :class="
            viewMode === 'grid'
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 border border-base-300 text-base-content/50 hover:text-base-content hover:border-primary/30'
          "
          :title="$t('library.viewModeGrid')"
          @click="emit('update:viewMode', 'grid')"
        >
          <LayoutGrid :size="14" />
        </button>
        <div class="w-px h-6 bg-base-300 mx-1"></div>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors fx-depth fx-noise"
          @click="emit('playAll')"
        >
          <Music2 :size="12" /> <span class="hidden sm:inline">{{ $t('library.playAll') }}</span><span class="sm:hidden">Play</span>
        </button>
        <button
          class="p-2 rounded-full bg-base-100 border border-base-300 text-base-content/60 hover:text-primary hover:border-primary/30 transition-colors"
          :title="$t('library.shuffle')"
          @click="emit('shuffleAll')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="9" y2="9"/><line x1="4" y1="4" x2="9" y2="9"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="20" x2="9" y2="15"/></svg>
        </button>
      </div>
    </div>
    <!-- Bulk bar -->
    <div v-if="selectedCount > 0" class="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20 text-xs shrink-0">
      <span class="font-medium text-primary">{{ selectedCount }} {{ $t('common.selected') }}</span>
      <div class="flex items-center gap-1 ml-auto">
        <button class="px-2.5 py-1 rounded-field bg-primary text-primary-content hover:bg-primary/90 flex items-center gap-1 fx-depth fx-noise" @click="playSelected"><Play :size="12" /> Play</button>
        <button class="px-2.5 py-1 rounded-field bg-base-100 border border-base-300 hover:bg-base-200" @click="queueSelected"><ListMusic :size="12" class="inline mr-1" />{{ $t('common.addToQueue') }}</button>
        <div class="relative">
          <button class="px-2.5 py-1 rounded-field bg-base-100 border border-base-300 hover:bg-base-200" @click="showBulkPlaylist = !showBulkPlaylist">{{ $t('common.addToPlaylist') }}</button>
          <div v-if="showBulkPlaylist" class="absolute right-0 top-full mt-1 w-48 bg-base-100 border border-base-300 rounded-box shadow-xl py-1 z-20 max-h-48 overflow-auto">
            <button v-for="p in library.playlists" :key="p.id" class="w-full text-left px-3 py-1.5 text-xs hover:bg-base-content/10 truncate" @click="addSelectedToPlaylist(p.id)">{{ p.name }}</button>
            <div v-if="library.playlists.length===0" class="px-3 py-1.5 text-xs text-base-content/50 italic">{{ $t('common.noPlaylists') }}</div>
          </div>
        </div>
        <button class="p-1 rounded-field hover:bg-base-300 text-base-content/60" @click="clearSelection"><X :size="12" /></button>
      </div>
    </div>

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
              @edit="emit('edit', $event)"
              @select="toggleSelect(v.index, $event)"
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
            :key="'tgr-' + row.top"
            :style="{
              position: 'absolute',
              top: row.top + 'px',
              left: 0,
              width: '100%',
              display: 'flex',
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
              @select="toggleSelect(row.index * grid.cols.value + cIdx, $event)"
            />
          </div>
        </div>
      </div>
    </template>
  </template>
</template>
