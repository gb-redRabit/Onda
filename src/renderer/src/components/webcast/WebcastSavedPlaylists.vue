<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useVirtualList } from '@renderer/composables/useVirtualList';
import { AlertCircle, ChevronDown, ChevronRight, ListMusic, Play, Trash2 } from '@lucide/vue';
import { useSavedStore } from '@renderer/stores/saved';
import { useOnlineStore } from '@renderer/stores/online';
import OnlineMediaCard from '@renderer/components/online/OnlineMediaCard.vue';
import { buildYouTubeWatchUrl } from '@shared/provider';
import Loader from '@renderer/components/layout/Loader.vue';
import { toResolvedItem } from '@renderer/utils/savedItem';
import type { IpcSavedPlaylist } from '@shared/types/ipc';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';

const saved = useSavedStore();
const yt = useOnlineStore();
const router = useRouter();
const { t } = useI18n();
const prompt = usePromptDialog();

const playingPlaylistId = ref<string | null>(null);
const expandedPlaylistId = ref<string | null>(null);
const playlistError = ref<Record<string, boolean>>({});
const playlistItemsRef = ref<HTMLElement | null>(null);
const playlistGrid = useVirtualGrid(playlistItemsRef, 220, 4);
const expandedItems = computed(
  () => saved.playlists.find((playlist) => playlist.id === expandedPlaylistId.value)?.items ?? []
);
const playlistItemRows = useVirtualList({
  count: () => Math.ceil(expandedItems.value.length / playlistGrid.cols.value),
  scrollEl: () => playlistItemsRef.value,
  estimateSize: () => 230,
  overscan: 3
});
const visiblePlaylistRows = computed(() => {
  const columns = playlistGrid.cols.value;
  return playlistItemRows.value.getVirtualItems().map((row) => ({
    index: row.index,
    top: row.start,
    items: expandedItems.value.slice(row.index * columns, (row.index + 1) * columns)
  }));
});

const playlistCount = computed(() => saved.playlists.length);

watch(expandedPlaylistId, async (id) => {
  if (!id) {
    playlistGrid.destroy();
    return;
  }
  await nextTick();
  playlistGrid.observe();
});

onBeforeUnmount(() => playlistGrid.destroy());

async function togglePlaylist(p: { id: string; url: string }) {
  if (expandedPlaylistId.value === p.id) {
    expandedPlaylistId.value = null;
    return;
  }
  expandedPlaylistId.value = p.id;
  if ((p as IpcSavedPlaylist).items && (p as IpcSavedPlaylist).items!.length > 0) return;
  playlistError.value = { ...playlistError.value, [p.id]: false };
  const result = await yt.syncSavedPlaylist(p as IpcSavedPlaylist);
  if (result === null) {
    const savedList = saved.playlists.find((pl) => pl.id === p.id);
    if (!savedList?.items?.length) {
      playlistError.value = { ...playlistError.value, [p.id]: true };
    }
  }
}

async function playPlaylist(p: { id: string; url: string }) {
  if (playingPlaylistId.value === p.id) return;
  playingPlaylistId.value = p.id;
  try {
    await yt.playSavedPlaylist(p as IpcSavedPlaylist);
  } finally {
    playingPlaylistId.value = null;
  }
}

async function removePlaylist(id: string) {
  const playlist = saved.playlists.find((p) => p.id === id);
  const ok = await prompt.showConfirm(
    t('saved.deletePlaylistConfirm', { name: playlist?.title ?? '' })
  );
  if (!ok) return;
  void saved.removePlaylist(id);
  if (expandedPlaylistId.value === id) expandedPlaylistId.value = null;
}

async function openChannelInApp(url: string): Promise<void> {
  await router.push('/online');
  await yt.openChannel(url);
}
</script>

<template>
  <section>
    <h2 class="flex items-center gap-2 text-sm font-semibold text-base-content/70 mb-3">
      <ListMusic :size="14" class="text-primary" />
      {{ t('saved.playlistsTitle') }}
      <span class="text-base-content/60 text-xs">({{ playlistCount }})</span>
    </h2>

    <EmptyState
      v-if="playlistCount === 0"
      :title="t('saved.emptyPlaylists')"
      :icon="ListMusic"
      compact
    />

    <div v-else class="space-y-2">
      <div
        v-for="p in saved.playlists"
        :key="p.id"
        class="group rounded-box bg-base-100 border border-base-300 transition-colors"
        :class="expandedPlaylistId === p.id ? 'border-primary/60' : 'hover:border-base-300'"
      >
        <div class="flex items-center gap-3 p-3">
          <button
            type="button"
            class="fx-noise shrink-0 p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            :title="t('saved.expandPlaylist')"
            :aria-label="t('saved.expandPlaylist')"
            :aria-expanded="expandedPlaylistId === p.id"
            @click="togglePlaylist(p)"
          >
            <ChevronDown v-if="expandedPlaylistId === p.id" :size="16" />
            <ChevronRight v-else :size="16" />
          </button>
          <div
            class="w-14 h-14 rounded-box bg-base-100 overflow-hidden shrink-0 flex items-center justify-center"
          >
            <img
              v-if="p.thumbnail"
              :src="p.thumbnail"
              :alt="p.title"
              loading="lazy"
              class="w-full h-full object-cover"
            />
            <ListMusic v-else :size="20" class="text-base-content/50" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold text-base-content truncate">{{ p.title }}</h3>
            <p class="text-xs text-base-content/70 truncate">
              {{ p.channelTitle || t('saved.kindPlaylist') }}
              <span v-if="p.totalItems != null"> · {{ p.totalItems }}</span>
            </p>
          </div>
          <button
            type="button"
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
            :title="t('youtube.playAll')"
            :aria-label="t('youtube.playAll')"
            :disabled="playingPlaylistId === p.id"
            @click.stop="playPlaylist(p)"
          >
            <span
              v-if="playingPlaylistId === p.id"
              class="block w-4 h-4 border border-primary border-t-transparent rounded-full animate-spin"
            />
            <Play v-else :size="18" />
          </button>
          <button
            type="button"
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:text-error hover:bg-base-content/10 transition-colors"
            :title="t('common.delete')"
            :aria-label="t('common.delete')"
            @click.stop="removePlaylist(p.id)"
          >
            <Trash2 :size="16" />
          </button>
        </div>

        <div v-if="expandedPlaylistId === p.id" class="border-t border-base-300 px-3 py-3">
          <div
            v-if="
              (!p.items || p.items.length === 0) &&
              (yt.syncingSavedPlaylistState.has(p.id) || !playlistError[p.id])
            "
            class="flex items-center justify-center py-8"
          >
            <Loader v-if="yt.syncingSavedPlaylistState.has(p.id)" :size="40" />
          </div>
          <p
            v-else-if="!p.items || p.items.length === 0"
            class="flex items-center gap-2 justify-center py-8 text-sm text-error"
          >
            <AlertCircle :size="16" />
            {{ t('saved.playlistLoadError') }}
          </p>
          <div v-else ref="playlistItemsRef" class="max-h-[60vh] overflow-auto">
            <div class="relative" :style="{ height: playlistItemRows.getTotalSize() + 'px' }">
              <div
                v-for="row in visiblePlaylistRows"
                :key="row.index"
                class="absolute top-0 left-0 grid w-full gap-3 pb-3"
                :style="{
                  transform: `translateY(${row.top}px)`,
                  gridTemplateColumns: `repeat(${playlistGrid.cols.value}, minmax(0, 1fr))`
                }"
              >
                <OnlineMediaCard
                  v-for="item in row.items"
                  :key="item.id"
                  :video="toResolvedItem(item)"
                  :cover-status="'none'"
                  :watch-url="buildYouTubeWatchUrl(item.id)"
                  :hide-quick-actions="true"
                  layout="grid"
                  @expand="expandedPlaylistId = null"
                  @queue="yt.queueVideo(toResolvedItem(item))"
                  @play="yt.playStream(toResolvedItem(item))"
                  @open-channel="openChannelInApp"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ExplorerPromptDialog
      :visible="prompt.promptVisible.value"
      :is-confirm="prompt.promptIsConfirm.value"
      :message="prompt.promptMessage.value"
      :value="prompt.promptValue.value"
      @update:value="prompt.promptValue.value = $event"
      @confirm="prompt.promptConfirm()"
      @cancel="prompt.promptCancel()"
    />
  </section>
</template>
