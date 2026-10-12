<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import {
  SMART_FOLDERS,
  filterSmartFolder,
  countSmartFolder,
  type SmartFolderId
} from '@renderer/utils/smartFolders';
import LibraryTracksTab from '@renderer/components/library/LibraryTracksTab.vue';

// Zakładka „Inteligentne": wirtualne foldery liczone na bieżąco z metadanych i
// statystyk odtwarzania (bez utrwalania listy). Po prawej reużywa listę utworów.

const emit = defineEmits<{ edit: [track: MediaFile] }>();

const library = useLibraryStore();
const player = usePlayerStore();

const selected = ref<SmartFolderId>('unplayed');
const viewMode = ref<'list' | 'grid'>('list');

const ctx = computed(() => ({ favorites: new Set(player.favorites), now: Date.now() }));

const folders = computed(() =>
  SMART_FOLDERS.map((f) => ({ ...f, count: countSmartFolder(f.id, library.tracks, ctx.value) }))
);

const currentTracks = computed(() => filterSmartFolder(selected.value, library.tracks, ctx.value));

function play(track: MediaFile): void {
  player.clearQueue();
  player.setTrack(track);
  player.play();
}

function playList(list: MediaFile[]): void {
  if (list.length === 0) return;
  player.clearQueue();
  if (list.length > 1) player.addToQueueMultiple(list.slice(1));
  player.setTrack(list[0]);
  player.play();
}

function playAll(): void {
  playList(currentTracks.value);
}

function shuffleAll(): void {
  const list = [...currentTracks.value];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  playList(list);
}
</script>

<template>
  <div class="flex-1 flex min-h-0" data-testid="library-smart-tab">
    <aside
      class="w-56 shrink-0 border-r border-base-300 overflow-auto p-2 space-y-0.5 bg-base-100"
      :aria-label="$t('library.smart')"
    >
      <button
        v-for="folder in folders"
        :key="folder.id"
        type="button"
        :data-testid="`smart-folder-${folder.id}`"
        :aria-pressed="selected === folder.id"
        class="w-full flex items-center gap-2 px-2.5 py-2 rounded-field text-xs text-left transition-colors"
        :class="
          selected === folder.id
            ? 'bg-primary text-primary-content'
            : 'hover:bg-base-content/10 text-base-content/80'
        "
        @click="selected = folder.id"
      >
        <component :is="folder.icon" :size="14" class="shrink-0 opacity-80" />
        <span class="truncate flex-1">{{ $t(folder.labelKey) }}</span>
        <span
          class="px-1.5 py-0.5 rounded-selector text-[10px] font-bold leading-none border shrink-0"
          :class="
            selected === folder.id
              ? 'bg-primary-content/20 border-primary-content/20'
              : 'bg-base-300 border-base-300 text-base-content/60'
          "
          >{{ folder.count }}</span
        >
      </button>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col">
      <LibraryTracksTab
        :tracks="currentTracks"
        :view-mode="viewMode"
        :query="''"
        @update:view-mode="viewMode = $event"
        @play="play"
        @play-all="playAll"
        @shuffle-all="shuffleAll"
        @edit="(t: MediaFile) => emit('edit', t)"
      />
    </div>
  </div>
</template>
