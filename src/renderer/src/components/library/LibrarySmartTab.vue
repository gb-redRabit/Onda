<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import type { SmartPlaylist } from '@shared/types/smart-playlist';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useSmartPlaylists } from '@renderer/stores/smart-playlists';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import {
  SMART_FOLDERS,
  filterSmartFolder,
  countSmartFolder,
  type SmartFolderId
} from '@renderer/utils/smartFolders';
import { countSmartPlaylist, resolveSmartPlaylist } from '@renderer/utils/smartPlaylists';
import { shuffled } from '@renderer/utils/shuffle';
import { Pencil, Plus, Sparkles, Trash2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import LibraryTracksTab from '@renderer/components/library/LibraryTracksTab.vue';
import SmartPlaylistDialog from './SmartPlaylistDialog.vue';

// ZakĹ‚adka â€žInteligentne": wbudowane foldery + smart playlisty uĹĽytkownika.
// Wszystko liczone na bieĹĽÄ…co z metadanych, statystyk i ulubionych.

const emit = defineEmits<{ edit: [track: MediaFile] }>();

const { t } = useI18n();
const library = useLibraryStore();
const player = usePlayerStore();
const smart = useSmartPlaylists();
const prompt = usePromptDialog();

const selected = ref<string>('unplayed');
const viewMode = ref<'list' | 'grid'>('list');
const dialogOpen = ref(false);
const editing = ref<SmartPlaylist | null>(null);

onMounted(() => {
  void smart.ensureLoaded();
});

const ctx = computed(() => ({ favorites: new Set(player.favorites), now: Date.now() }));

const folders = computed(() =>
  SMART_FOLDERS.map((f) => ({ ...f, count: countSmartFolder(f.id, library.tracks, ctx.value) }))
);

const smartItems = computed(() =>
  smart.smartPlaylists.map((p) => ({
    ...p,
    count: countSmartPlaylist(p, library.tracks, ctx.value)
  }))
);

const selectedSmart = computed(() => smart.smartPlaylists.find((p) => p.id === selected.value));

const currentTracks = computed(() => {
  if (selectedSmart.value) {
    return resolveSmartPlaylist(selectedSmart.value, library.tracks, ctx.value);
  }
  return filterSmartFolder(selected.value as SmartFolderId, library.tracks, ctx.value);
});

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
  playList(shuffled(currentTracks.value));
}

function openCreate(): void {
  editing.value = null;
  dialogOpen.value = true;
}

function openEdit(playlist: SmartPlaylist): void {
  editing.value = playlist;
  dialogOpen.value = true;
}

function saveSmart(
  payload: Pick<SmartPlaylist, 'name' | 'match' | 'rules' | 'sort' | 'sortDir' | 'limit'>
): void {
  if (editing.value) {
    smart.update(editing.value.id, payload);
    selected.value = editing.value.id;
  } else {
    const created = smart.create(payload);
    selected.value = created.id;
  }
  dialogOpen.value = false;
  editing.value = null;
}

async function deleteSmart(playlist: SmartPlaylist): Promise<void> {
  const ok = await prompt.showConfirm(
    t('library.smartPlaylists.deleteConfirm', { name: playlist.name })
  );
  if (!ok) return;
  smart.remove(playlist.id);
  if (selected.value === playlist.id) selected.value = 'unplayed';
}
</script>

<template>
  <div class="flex-1 flex min-h-0" data-testid="library-smart-tab">
    <aside
      class="w-64 shrink-0 border-r border-base-300 overflow-auto p-2 space-y-0.5 bg-base-100"
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
          class="px-1.5 py-0.5 rounded-selector text-[11px] font-bold leading-none border shrink-0"
          :class="
            selected === folder.id
              ? 'bg-primary-content/20 border-primary-content/20'
              : 'bg-base-300 border-base-300 text-base-content/60'
          "
          >{{ folder.count }}</span
        >
      </button>

      <div class="mt-3 pt-3 border-t border-base-300/70">
        <div
          class="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-base-content/40"
        >
          {{ t('library.smartPlaylists.title') }}
        </div>

        <p
          v-if="smartItems.length === 0"
          class="px-2.5 py-1.5 text-[11px] leading-relaxed text-base-content/40"
        >
          {{ t('library.smartPlaylists.empty') }}
        </p>

        <div
          v-for="item in smartItems"
          :key="item.id"
          class="group flex items-center rounded-field transition-colors"
          :class="
            selected === item.id
              ? 'bg-primary text-primary-content'
              : 'hover:bg-base-content/10 text-base-content/80'
          "
        >
          <button
            type="button"
            :data-testid="`smart-playlist-${item.id}`"
            :aria-pressed="selected === item.id"
            class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs"
            @click="selected = item.id"
          >
            <Sparkles :size="14" class="shrink-0 opacity-80" />
            <span class="truncate flex-1">{{ item.name }}</span>
            <span
              class="px-1.5 py-0.5 rounded-selector text-[11px] font-bold leading-none border shrink-0"
              :class="
                selected === item.id
                  ? 'bg-primary-content/20 border-primary-content/20'
                  : 'bg-base-300 border-base-300 text-base-content/60'
              "
              >{{ item.count }}</span
            >
          </button>
          <button
            class="fx-noise mr-1 rounded-field p-1 opacity-0 transition-opacity hover:bg-base-content/10 group-hover:opacity-100 group-focus-within:opacity-100"
            :class="selected === item.id ? 'hover:bg-primary-content/20' : ''"
            :title="t('library.smartPlaylists.editTitle')"
            :aria-label="t('library.smartPlaylists.editTitle')"
            @click.stop="openEdit(item)"
          >
            <Pencil :size="11" />
          </button>
          <button
            class="fx-noise mr-1 rounded-field p-1 opacity-0 transition-opacity hover:bg-error/20 hover:text-error group-hover:opacity-100 group-focus-within:opacity-100"
            :class="selected === item.id ? 'text-primary-content/80' : ''"
            :title="t('common.delete')"
            :aria-label="t('common.delete')"
            @click.stop="deleteSmart(item)"
          >
            <Trash2 :size="11" />
          </button>
        </div>

        <button
          data-testid="smart-playlist-new"
          class="fx-noise mt-1 flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-xs text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content/70"
          @click="openCreate"
        >
          <Plus :size="13" class="shrink-0" />
          <span>{{ t('library.smartPlaylists.new') }}</span>
        </button>
      </div>
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

    <SmartPlaylistDialog
      v-if="dialogOpen"
      :playlist="editing"
      @save="saveSmart"
      @cancel="dialogOpen = false"
    />
  </div>
</template>
