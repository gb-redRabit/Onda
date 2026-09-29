<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Music2,
  Clock,
  FolderOpen,
  Disc3,
  Radio,
  ArrowRight,
  FolderUp,
  TrendingUp,
  Heart,
  ListMusic,
  Mic2
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';
import { useHomeContextMenu } from '@renderer/composables/useHomeContextMenu';
import { orderedHomeSections } from '@renderer/utils/homeSections';
import { pluralCategory } from '@renderer/utils/plural';
import { playTrackList } from '@renderer/utils/playTracks';
import { formatDuration } from '@renderer/utils/formatters';
import HomeShelf from '@renderer/components/home/HomeShelf.vue';
import HomeMediaCard from '@renderer/components/home/HomeMediaCard.vue';
import HomeContinueCard from '@renderer/components/home/HomeContinueCard.vue';
import PageHeader from '@renderer/components/ui/PageHeader.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import type { MediaFile } from '@renderer/types/media';
import type { HomeSectionId } from '@renderer/types/settings';
import type { TabId } from '@renderer/utils/libraryTabs';

const router = useRouter();
const { t, locale } = useI18n();
const player = usePlayerStore();
const library = useLibraryStore();
const settings = useSettingsStore();
const homeContextMenu = useHomeContextMenu();

const sections = computed(() => orderedHomeSections(settings.home.sections));
function has(id: HomeSectionId): boolean {
  return sections.value.includes(id);
}

async function openFile() {
  const result = (await window.api?.invoke('dialog:openFile')) as
    { filePaths: string[]; canceled: boolean } | undefined;
  if (!result || result.canceled || !result.filePaths.length) return;
  await openMediaFiles(result.filePaths, router);
}

async function openFolder() {
  const result = (await window.api?.invoke('dialog:openFolderFiles')) as
    { filePaths: string[]; canceled: boolean } | undefined;
  if (!result || result.canceled || !result.filePaths.length) return;
  await openMediaFiles(result.filePaths, router);
}

const actions = [
  {
    labelKey: 'home.openFile',
    descKey: 'home.browseLocalMedia',
    icon: FolderOpen,
    route: openFile
  },
  {
    labelKey: 'home.openFolder',
    descKey: 'home.loadMediaFromFolder',
    icon: FolderUp,
    route: openFolder
  },
  {
    labelKey: 'library.title',
    descKey: 'home.yourMusicCollection',
    icon: Disc3,
    route: () => router.push('/library')
  },
  {
    labelKey: 'nav.online',
    descKey: 'home.searchAndDownload',
    icon: Radio,
    route: () => router.push('/online')
  }
];

interface HomeCounter {
  value: number;
  key: string;
  color: string;
  tab: TabId;
}

const counters = computed<HomeCounter[]>(() => [
  {
    value: library.totalCount,
    key: 'home.totalTracks',
    color: 'text-base-content',
    tab: 'overview'
  },
  { value: library.audioCount, key: 'home.audioFiles', color: 'text-primary', tab: 'tracks' },
  { value: library.videoCount, key: 'home.videoFiles', color: 'text-success', tab: 'video' },
  { value: library.imageCount, key: 'home.imageFiles', color: 'text-secondary', tab: 'images' },
  {
    value: library.playlists.length,
    key: 'library.playlists',
    color: 'text-warning',
    tab: 'playlists'
  }
]);

function openLibrary(tab: TabId): void {
  router.push({ path: '/library', query: { tab } });
}

// ---- Shelves -----------------------------------------------------------------

const recentTracks = computed(() => library.recentTracks.slice(0, 12));
const mostPlayed = computed(() =>
  library.mostPlayed.filter((t) => (t.playCount || 0) > 0).slice(0, 12)
);
const favoriteTracks = computed(() => {
  const favorites = new Set(player.favorites);
  if (!favorites.size) return [];
  return library.tracks.filter((t) => favorites.has(t.path)).slice(0, 12);
});
const playlists = computed(() => library.playlists.slice(0, 12));
const albums = computed(() => library.albums.slice(0, 12));
const artists = computed(() => library.artists.slice(0, 12));

function trackTitle(track: MediaFile): string {
  return track.metadata?.title || track.name;
}

function trackSubtitle(track: MediaFile): string {
  const artist = track.metadata?.artist;
  if (artist) return artist;
  const duration = track.duration || track.metadata?.duration || 0;
  return duration > 0 ? formatDuration(duration) : track.extension;
}

// vue-i18n's built-in plural rules get Polish one/few/many wrong on a 3-form
// message, so the form is chosen explicitly (see utils/plural.ts).
function trackCountLabel(count: number): string {
  const category = pluralCategory(locale.value, count);
  const key =
    category === 'one'
      ? 'home.trackCountOne'
      : category === 'few'
        ? 'home.trackCountFew'
        : 'home.trackCountMany';
  return t(key, { count });
}

// ---- Continue card -----------------------------------------------------------

const continueTrack = computed<MediaFile | null>(() => library.recentTracks[0] ?? null);
const continuePosition = ref(0);

async function loadContinuePosition(track: MediaFile | null): Promise<void> {
  if (!track) {
    continuePosition.value = 0;
    return;
  }
  try {
    continuePosition.value = (await window.api?.getPlaybackPosition(track.path)) || 0;
  } catch {
    continuePosition.value = 0;
  }
}

watch(continueTrack, (track) => void loadContinuePosition(track), { immediate: true });

function playContinue(): void {
  const track = continueTrack.value;
  if (!track) return;
  player.setTrack(track);
  player.play();
  if (track.type === 'video') router.push('/player');
}

onMounted(() => {
  // Favourites live in settings; load them so the shelf renders on first paint.
  void player.ensureFavorites();
});
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto" @contextmenu="homeContextMenu.showHomeMenu($event)">
    <PageHeader :title="t('home.welcome')" :subtitle="t('home.subtitle')" class="mb-6" />

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <button
        v-for="a in actions"
        :key="a.labelKey"
        class="flex items-center gap-4 p-5 fx-depth rounded-box fx-noise bg-base-100 border border-base-300 hover:border-base-300 hover:bg-base-content/10 transition-all group text-left"
        @click="a.route()"
      >
        <div class="w-12 h-12 rounded-box bg-primary/10 flex items-center justify-center">
          <component :is="a.icon" :size="22" class="text-primary" />
        </div>
        <div class="flex-1">
          <div class="text-sm font-semibold">{{ $t(a.labelKey) }}</div>
          <div class="text-xs text-base-content/50 mt-0.5">{{ $t(a.descKey) }}</div>
        </div>
        <ArrowRight
          :size="16"
          class="text-base-content/50 group-hover:text-base-content group-hover:translate-x-0.5 transition-all"
        />
      </button>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
      <template v-if="library.isLoading || !library.isLoaded">
        <div
          v-for="i in 5"
          :key="i"
          class="p-4 rounded-box bg-base-100 border border-base-300 animate-pulse"
        >
          <div class="h-8 w-16 rounded-field bg-base-content/10 mb-2" />
          <div class="h-3 w-24 rounded-field bg-base-content/10" />
        </div>
      </template>
      <template v-else>
        <button
          v-for="s in counters"
          :key="s.key"
          class="p-4 rounded-box bg-base-100 border border-base-300 text-left hover:bg-base-content/5 transition-colors"
          :title="$t('home.openInLibrary')"
          @click="openLibrary(s.tab)"
        >
          <div :class="['text-3xl font-bold', s.color]">{{ s.value }}</div>
          <div class="text-xs text-base-content/50 mt-1">{{ $t(s.key) }}</div>
        </button>
      </template>
    </div>

    <HomeContinueCard
      v-if="has('continue') && continueTrack"
      :track="continueTrack"
      :position="continuePosition"
      @play="playContinue"
    />

    <HomeShelf
      v-if="has('recent') && recentTracks.length"
      :title="$t('home.recentlyPlayed')"
      :icon="Clock"
      :item-count="recentTracks.length"
      :see-all-label="$t('home.showAll')"
      @see-all="openLibrary('tracks')"
    >
      <HomeMediaCard
        v-for="item in recentTracks"
        :key="item.path"
        :title="trackTitle(item)"
        :subtitle="trackSubtitle(item)"
        :cover-path="item.path"
        :cover-size="132"
        :fallback="item.type === 'video' ? 'film' : 'music'"
        @play="player.setTrack(item)"
        @contextmenu="homeContextMenu.showRecentMenu($event, item)"
      />
    </HomeShelf>

    <EmptyState
      v-else-if="has('recent') && library.isLoaded"
      :title="$t('home.noTracks')"
      :description="$t('home.openFileToStart')"
      :icon="Music2"
      class="mb-8 bg-base-100"
    />

    <HomeShelf
      v-if="has('mostPlayed') && mostPlayed.length"
      :title="$t('home.mostPlayed')"
      :icon="TrendingUp"
      :item-count="mostPlayed.length"
      :see-all-label="$t('home.showAll')"
      @see-all="openLibrary('tracks')"
    >
      <HomeMediaCard
        v-for="item in mostPlayed"
        :key="item.path"
        :title="trackTitle(item)"
        :subtitle="$t('home.playCount', { count: item.playCount })"
        :cover-path="item.path"
        :cover-size="132"
        @play="player.setTrack(item)"
        @contextmenu="homeContextMenu.showRecentMenu($event, item)"
      />
    </HomeShelf>

    <HomeShelf
      v-if="has('favorites') && favoriteTracks.length"
      :title="$t('home.favorites')"
      :icon="Heart"
      :item-count="favoriteTracks.length"
      :see-all-label="$t('home.showAll')"
      @see-all="openLibrary('tracks')"
    >
      <HomeMediaCard
        v-for="item in favoriteTracks"
        :key="item.path"
        :title="trackTitle(item)"
        :subtitle="trackSubtitle(item)"
        :cover-path="item.path"
        :cover-size="132"
        @play="player.setTrack(item)"
        @contextmenu="homeContextMenu.showRecentMenu($event, item)"
      />
    </HomeShelf>

    <HomeShelf
      v-if="has('playlists') && playlists.length"
      :title="$t('library.playlists')"
      :icon="ListMusic"
      :item-count="playlists.length"
      :see-all-label="$t('home.showAll')"
      @see-all="openLibrary('playlists')"
    >
      <HomeMediaCard
        v-for="pl in playlists"
        :key="pl.id"
        :title="pl.name"
        :subtitle="trackCountLabel(pl.tracks.length)"
        :cover-path="pl.coverUrl || pl.tracks[0]?.path"
        :cover-size="132"
        fallback="play"
        :open-label="$t('home.openInLibrary')"
        @play="playTrackList(pl.tracks)"
        @open="openLibrary('playlists')"
      />
    </HomeShelf>

    <HomeShelf
      v-if="has('albums') && albums.length"
      :title="$t('library.albums')"
      :icon="Disc3"
      :item-count="albums.length"
      :see-all-label="$t('home.showAll')"
      @see-all="openLibrary('albums')"
    >
      <HomeMediaCard
        v-for="[name, tracks] in albums"
        :key="name"
        :title="name"
        :subtitle="trackCountLabel(tracks.length)"
        :cover-path="tracks[0]?.path"
        :cover-size="132"
        fallback="disc"
        :open-label="$t('home.openInLibrary')"
        @play="playTrackList(tracks)"
        @open="openLibrary('albums')"
      />
    </HomeShelf>

    <HomeShelf
      v-if="has('artists') && artists.length"
      :title="$t('library.artists')"
      :icon="Mic2"
      :item-count="artists.length"
      :see-all-label="$t('home.showAll')"
      @see-all="openLibrary('artists')"
    >
      <HomeMediaCard
        v-for="[name, tracks] in artists"
        :key="name"
        :title="name"
        :subtitle="trackCountLabel(tracks.length)"
        :cover-path="tracks[0]?.path"
        :cover-size="132"
        fallback="disc"
        round
        :open-label="$t('home.openInLibrary')"
        @play="playTrackList(tracks)"
        @open="openLibrary('artists')"
      />
    </HomeShelf>
  </div>
</template>
