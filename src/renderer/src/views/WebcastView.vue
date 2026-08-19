<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  RadioTower,
  Play,
  Pause,
  ListMusic,
  Radio,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Pencil,
  ArrowUpToLine
} from '@lucide/vue';
import { useSavedStore } from '@renderer/stores/saved';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { useRadioStore } from '@renderer/stores/radio';
import { usePlayerStore } from '@renderer/stores/player';
import YTMediaCard from '@renderer/components/youtube/YTMediaCard.vue';
import YTButton from '@renderer/components/youtube/YTButton.vue';
import RadioAddDialog from '@renderer/components/radio/RadioAddDialog.vue';
import type { YouTubeResolvedItem } from '@renderer/types/youtube';
import type { IpcSavedPlaylist, IpcRadioStation } from '@shared/types/ipc';

type WebcastTab = 'radio' | 'saved';

const saved = useSavedStore();
const yt = useYouTubeStore();
const radio = useRadioStore();
const player = usePlayerStore();

const activeTab = ref<WebcastTab>((localStorage.getItem('onda.webcastTab') as WebcastTab) || 'saved');

function selectTab(tab: WebcastTab) {
  activeTab.value = tab;
  localStorage.setItem('onda.webcastTab', tab);
}

const playingPlaylistId = ref<string | null>(null);
const expandedPlaylistId = ref<string | null>(null);
const playlistError = ref<Record<string, boolean>>({});
const radioDialogOpen = ref(false);
const editingRadioId = ref<string | null>(null);
const editingRadioName = ref('');

onMounted(() => {
  void saved.ensureLoaded();
  void radio.ensureLoaded();
});

function startRadioRename(s: IpcRadioStation) {
  editingRadioId.value = s.id;
  editingRadioName.value = s.name;
}

function commitRadioRename(id: string) {
  if (editingRadioId.value !== id) return;
  editingRadioId.value = null;
  void radio.renameStation(id, editingRadioName.value);
}

function toItem(s: {
  id: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
}): YouTubeResolvedItem {
  return {
    id: s.id,
    title: s.title,
    thumbnail: s.thumbnail ?? '',
    channelTitle: s.channelTitle ?? '',
    channelId: s.channelId ?? '',
    duration: s.duration,
    isPlayable: true
  };
}

function playTrack(s: { id: string; title: string; duration?: string; thumbnail?: string }) {
  void yt.playStream(toItem(s));
}

function queueTrack(s: { id: string; title: string; duration?: string; thumbnail?: string }) {
  void yt.queueSavedTrack(s);
}

function removeTrack(id: string) {
  void saved.removeTrack(id);
}

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

const trackCount = computed(() => saved.tracks.length);
const playlistCount = computed(() => saved.playlists.length);
</script>

<template>
  <div class="flex flex-col h-full">
    <header
      class="sticky top-0 z-10 bg-bg-surface/95 backdrop-blur border-b border-border-default px-6 py-5"
    >
      <div class="flex items-center gap-3">
        <RadioTower :size="24" class="text-accent-base" />
        <h1 class="text-xl font-bold">{{ $t('saved.title') }}</h1>
        <div class="flex-1" />
      </div>
      <div class="flex gap-1 mt-4">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="
            activeTab === 'radio'
              ? 'bg-accent-base/15 text-accent-base'
              : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'
          "
          @click="selectTab('radio')"
        >
          {{ $t('saved.radioTitle') }}
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="
            activeTab === 'saved'
              ? 'bg-accent-base/15 text-accent-base'
              : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'
          "
          @click="selectTab('saved')"
        >
          {{ $t('saved.tabSaved') }}
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto px-6 py-6 space-y-8">
      <!-- Radio tab -->
      <section v-if="activeTab === 'radio'">
        <div class="flex items-center gap-2 mb-3">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-fg-muted flex-1">
            <Radio :size="14" class="text-accent-base" />
            {{ $t('saved.radioTitle') }}
          </h2>
          <YTButton variant="secondary" size="sm" @click="radioDialogOpen = true">
            <Plus :size="12" />
            {{ $t('saved.addRadio') }}
          </YTButton>
        </div>
        <div v-if="radio.stations.length === 0" class="space-y-2">
          <div
            class="rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-fg-faint"
          >
            <Radio :size="24" class="mx-auto mb-2 opacity-40" />
            {{ $t('saved.radioSoon') }}
          </div>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="s in radio.stations"
            :key="s.id"
            class="group flex items-center gap-3 rounded-2xl bg-bg-surface border border-border-default p-3 hover:border-border-subtle transition-colors"
            :class="{ 'border-accent-base/60': radio.playingStationId === s.id }"
          >
            <button
              type="button"
              class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
              :class="
                radio.playingStationId === s.id
                  ? 'bg-accent-base text-white'
                  : 'bg-bg-elevated text-fg-muted hover:text-fg-base hover:bg-bg-hover'
              "
              :title="$t('saved.playRadio')"
              @click="
                radio.playingStationId === s.id
                  ? player.togglePlay()
                  : radio.playStation(s)
              "
            >
              <Pause v-if="radio.playingStationId === s.id && player.isPlaying" :size="16" fill="currentColor" />
              <Play v-else :size="16" fill="currentColor" />
            </button>
            <div class="min-w-0 flex-1">
              <template v-if="editingRadioId === s.id">
                <input
                  v-model="editingRadioName"
                  type="text"
                  class="w-full bg-bg-elevated border border-border-default rounded-lg px-2 py-1 text-sm text-fg-base focus:outline-none focus:border-accent-base"
                  @keyup.enter="commitRadioRename(s.id)"
                  @keyup.esc="editingRadioId = null"
                  @blur="commitRadioRename(s.id)"
                />
              </template>
              <template v-else>
                <h3 class="text-sm font-semibold text-fg-base truncate">{{ s.name }}</h3>
                <p class="text-xs text-fg-muted truncate">{{ s.url }}</p>
              </template>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                class="p-2 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('saved.renameRadio')"
                @click="startRadioRename(s)"
              >
                <Pencil :size="14" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('saved.moveRadioTop')"
                @click="radio.moveToTop(s.id)"
              >
                <ArrowUpToLine :size="14" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg text-fg-muted hover:text-red-base hover:bg-bg-hover transition-colors"
                :title="$t('common.delete')"
                @click="radio.removeStation(s.id)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Saved tab -->
      <template v-else>
        <!-- Saved tracks -->
        <section>
          <h2 class="flex items-center gap-2 text-sm font-semibold text-fg-muted mb-3">
            <Play :size="14" class="text-accent-base" />
            {{ $t('saved.tracksTitle') }}
            <span class="text-fg-faint/60 text-xs">({{ trackCount }})</span>
          </h2>

          <div
            v-if="trackCount === 0"
            class="rounded-2xl border border-dashed border-border-subtle p-8 text-center text-sm text-fg-faint"
          >
            {{ $t('saved.emptyTracks') }}
          </div>

          <div v-else class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div
              v-for="s in saved.tracks"
              :key="s.id"
              class="group rounded-2xl bg-bg-surface border border-border-default p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-border-subtle"
            >
              <div class="relative overflow-hidden rounded-xl bg-bg-elevated aspect-video">
                <img
                  v-if="s.thumbnail"
                  :src="s.thumbnail"
                  :alt="s.title"
                  loading="lazy"
                  class="absolute inset-0 w-full h-full object-cover"
                />
                <div
                  class="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity"
                >
                  <button
                    type="button"
                    class="p-2 rounded-full bg-white/20 text-white hover:bg-white/35 transition-colors"
                    :title="$t('youtube.playStream')"
                    @click="playTrack(s)"
                  >
                    <Play :size="20" fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    class="p-2 rounded-full bg-white/20 text-white hover:bg-white/35 transition-colors"
                    :title="$t('saved.addToQueue')"
                    @click="queueTrack(s)"
                  >
                    <Plus :size="20" />
                  </button>
                  <button
                    type="button"
                    class="p-2 rounded-full bg-red-base/60 text-white hover:bg-red-base transition-colors"
                    :title="$t('common.delete')"
                    @click="removeTrack(s.id)"
                  >
                    <Trash2 :size="18" />
                  </button>
                </div>
                <span
                  v-if="s.duration"
                  class="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded"
                >
                  {{ s.duration }}
                </span>
              </div>
              <div class="mt-2">
                <h3 class="text-sm font-semibold text-fg-base line-clamp-2">{{ s.title }}</h3>
                <p class="text-xs text-fg-muted mt-0.5 truncate">{{ s.channelTitle }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Saved playlists -->
        <section>
          <h2 class="flex items-center gap-2 text-sm font-semibold text-fg-muted mb-3">
            <ListMusic :size="14" class="text-accent-base" />
            {{ $t('saved.playlistsTitle') }}
            <span class="text-fg-faint/60 text-xs">({{ playlistCount }})</span>
          </h2>

          <div
            v-if="playlistCount === 0"
            class="rounded-2xl border border-dashed border-border-subtle p-8 text-center text-sm text-fg-faint"
          >
            {{ $t('saved.emptyPlaylists') }}
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="p in saved.playlists"
              :key="p.id"
              class="group rounded-2xl bg-bg-surface border border-border-default transition-colors"
              :class="expandedPlaylistId === p.id ? 'border-accent-base/60' : 'hover:border-border-subtle'"
            >
              <div class="flex items-center gap-3 p-3 cursor-pointer" @click="togglePlaylist(p)">
                <button
                  type="button"
                  class="shrink-0 p-1 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                  :title="$t('saved.expandPlaylist')"
                >
                  <ChevronDown v-if="expandedPlaylistId === p.id" :size="16" />
                  <ChevronRight v-else :size="16" />
                </button>
                <div class="w-14 h-14 rounded-xl bg-bg-elevated overflow-hidden shrink-0 flex items-center justify-center">
                  <img
                    v-if="p.thumbnail"
                    :src="p.thumbnail"
                    :alt="p.title"
                    loading="lazy"
                    class="w-full h-full object-cover"
                  />
                  <ListMusic v-else :size="20" class="text-fg-faint" />
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="text-sm font-semibold text-fg-base truncate">{{ p.title }}</h3>
                  <p class="text-xs text-fg-muted truncate">
                    {{ p.channelTitle || $t('saved.kindPlaylist') }}
                    <span v-if="p.totalItems != null"> · {{ p.totalItems }}</span>
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 p-2 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
                  :title="$t('youtube.playAll')"
                  :disabled="playingPlaylistId === p.id"
                  @click.stop="playPlaylist(p)"
                >
                  <span v-if="playingPlaylistId === p.id" class="block w-4 h-4 border-2 border-accent-base border-t-transparent rounded-full animate-spin" />
                  <Play v-else :size="18" />
                </button>
                <button
                  type="button"
                  class="shrink-0 p-2 rounded-lg text-fg-muted hover:text-red-base hover:bg-bg-hover transition-colors"
                  :title="$t('common.delete')"
                  @click.stop="removePlaylist(p.id)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>

              <div v-if="expandedPlaylistId === p.id" class="border-t border-border-default px-3 py-3">
                <div
                  v-if="
                    (!p.items || p.items.length === 0) &&
                    (yt.syncingSavedPlaylistState.has(p.id) || !playlistError[p.id])
                  "
                  class="flex items-center justify-center py-8"
                >
                  <div
                    v-if="yt.syncingSavedPlaylistState.has(p.id)"
                    class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
                  />
                </div>
                <p
                  v-else-if="!p.items || p.items.length === 0"
                  class="flex items-center gap-2 justify-center py-8 text-sm text-red-base"
                >
                  <AlertCircle :size="16" />
                  {{ $t('saved.playlistLoadError') }}
                </p>
                <div
                  v-else
                  class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                  <YTMediaCard
                    v-for="item in p.items"
                    :key="item.id"
                    :video="toItem(item)"
                    :cover-status="'none'"
                    :watch-url="'https://www.youtube.com/watch?v=' + item.id"
                    :hide-quick-actions="true"
                    layout="grid"
                    @expand="expandedPlaylistId = null"
                    @queue="yt.queueVideo(item)"
                    @play="yt.playStream(toItem(item))"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>

      <RadioAddDialog v-model="radioDialogOpen" />
    </div>
  </div>
</template>