<script setup lang="ts">
import { Clock, Music2, TrendingUp, Heart, Disc3, ListMusic, Mic2, ArrowRight } from '@lucide/vue';
import { playTrackList } from '@renderer/utils/playTracks';
import HomeShelf from '@renderer/components/home/HomeShelf.vue';
import HomeMediaCard from '@renderer/components/home/HomeMediaCard.vue';
import HomeContinueCard from '@renderer/components/home/HomeContinueCard.vue';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import PageHeader from '@renderer/components/ui/PageHeader.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import { useHomeView } from '@renderer/composables/useHomeView';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';

const {
  t,
  player,
  library,
  homeContextMenu,
  has,
  actions,
  counters,
  openLibrary,
  recentTracks,
  mostPlayed,
  favoriteTracks,
  playlists,
  albums,
  artists,
  trackTitle,
  trackSubtitle,
  trackCountLabel,
  continueTrack,
  continuePosition,
  playContinue,
  playContinueFromStart
} = useHomeView();

// „Odtwórz od nowa” nadpisuje zapisaną pozycję nieodwracalnie, więc gdy jest co
// tracić (postęp > 5 s), pytamy o potwierdzenie. Sam odczyt pozycji i akcja
// odtwarzania zostają w `useHomeView`; tutaj tylko bramkujemy wywołanie.
const {
  promptVisible,
  promptIsConfirm,
  promptMessage,
  promptValue,
  showConfirm,
  promptConfirm,
  promptCancel
} = usePromptDialog();

async function onPlayFromStart(): Promise<void> {
  const track = continueTrack.value;
  if (!track) return;
  if (continuePosition.value > 5) {
    const title = track.metadata?.title || track.name;
    const ok = await showConfirm(t('home.playFromStartConfirm', { title }));
    if (!ok) return;
  }
  playContinueFromStart();
}
</script>

<template>
  <div
    data-testid="home-view"
    class="p-6 max-w-7xl mx-auto"
    @contextmenu="homeContextMenu.showHomeMenu($event)"
  >
    <PageHeader :title="t('home.welcome')" :subtitle="t('home.subtitle')" class="mb-6" />

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <button
        v-for="a in actions"
        :key="a.labelKey"
        :data-testid="'home-action-' + a.id"
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
          :data-testid="'home-counter-' + s.tab"
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
      @play-from-start="onPlayFromStart"
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

    <ExplorerPromptDialog
      v-if="promptVisible"
      :visible="promptVisible"
      :is-confirm="promptIsConfirm"
      :message="promptMessage"
      :value="promptValue"
      @confirm="promptConfirm"
      @cancel="promptCancel"
    />
  </div>
</template>
