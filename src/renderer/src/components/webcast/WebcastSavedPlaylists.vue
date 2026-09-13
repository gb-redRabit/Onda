<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertCircle, ChevronDown, ChevronRight, ListMusic, Play, Trash2 } from '@lucide/vue';
import { useSavedStore } from '@renderer/stores/saved';
import { useOnlineStore } from '@renderer/stores/online';
import OnlineMediaCard from '@renderer/components/online/OnlineMediaCard.vue';
import { toResolvedItem } from '@renderer/utils/savedItem';
import type { IpcSavedPlaylist } from '@shared/types/ipc';

const saved = useSavedStore();
const yt = useOnlineStore();
const { t } = useI18n();

const playingPlaylistId = ref<string | null>(null);
const expandedPlaylistId = ref<string | null>(null);
const playlistError = ref<Record<string, boolean>>({});

const playlistCount = computed(() => saved.playlists.length);

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

function removePlaylist(id: string) {
  void saved.removePlaylist(id);
  if (expandedPlaylistId.value === id) expandedPlaylistId.value = null;
}
</script>

<template>
  <section>
    <h2 class="flex items-center gap-2 text-sm font-semibold text-base-content/70 mb-3">
      <ListMusic :size="14" class="text-primary" />
      {{ t('saved.playlistsTitle') }}
      <span class="text-base-content/60 text-xs">({{ playlistCount }})</span>
    </h2>

    <div
      v-if="playlistCount === 0"
      class="rounded-box border border-dashed border-base-300 p-8 text-center text-sm text-base-content/50"
    >
      {{ t('saved.emptyPlaylists') }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="p in saved.playlists"
        :key="p.id"
        class="group rounded-box bg-base-100 border border-base-300 transition-colors"
        :class="expandedPlaylistId === p.id ? 'border-primary/60' : 'hover:border-base-300'"
      >
        <div class="flex items-center gap-3 p-3 cursor-pointer" @click="togglePlaylist(p)">
          <button
            type="button"
            class="fx-noise shrink-0 p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            :title="t('saved.expandPlaylist')"
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
            <div
              v-if="yt.syncingSavedPlaylistState.has(p.id)"
              class="w-6 h-6 border border-primary border-t-transparent rounded-full animate-spin"
            />
          </div>
          <p
            v-else-if="!p.items || p.items.length === 0"
            class="flex items-center gap-2 justify-center py-8 text-sm text-error"
          >
            <AlertCircle :size="16" />
            {{ t('saved.playlistLoadError') }}
          </p>
          <div v-else class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <OnlineMediaCard
              v-for="item in p.items"
              :key="item.id"
              :video="toResolvedItem(item)"
              :cover-status="'none'"
              :watch-url="'https://www.youtube.com/watch?v=' + item.id"
              :hide-quick-actions="true"
              layout="grid"
              @expand="expandedPlaylistId = null"
              @queue="yt.queueVideo(toResolvedItem(item))"
              @play="yt.playStream(toResolvedItem(item))"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
