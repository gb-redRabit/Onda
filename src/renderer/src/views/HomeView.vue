<script setup lang="ts">
import { Disc3, Heart, ListMusic, Mic2, Music2, TrendingUp } from '@lucide/vue';
import { playTrackList } from '@renderer/utils/playTracks';
import HomeShelf from '@renderer/components/home/HomeShelf.vue';
import HomeMediaCard from '@renderer/components/home/HomeMediaCard.vue';
import HomeContinueCard from '@renderer/components/home/HomeContinueCard.vue';
import HomeWelcomeCard from '@renderer/components/home/HomeWelcomeCard.vue';
import HomeStatsPanel from '@renderer/components/home/HomeStatsPanel.vue';
import HomeQuickPicks from '@renderer/components/home/HomeQuickPicks.vue';
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
  openFile,
  openFolder,
  playRandom,
  quickPicks,
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
    <PageHeader :title="t('home.welcome')" :subtitle="t('home.subtitle')" class="mb-6">
      <template #actions>
        <button
          v-for="a in actions"
          :key="a.labelKey"
          :data-testid="'home-action-' + a.id"
          class="inline-flex items-center gap-1.5 rounded-full border border-base-300 bg-base-100/(--glass-alpha) px-3 py-1.5 text-xs font-medium text-base-content/75 backdrop-blur transition-colors hover:border-primary/40 hover:bg-base-content/10 hover:text-base-content"
          :title="$t(a.labelKey)"
          :aria-label="$t(a.labelKey)"
          @click="a.route()"
        >
          <component :is="a.icon" :size="15" class="shrink-0 text-primary-text" />
          <span class="hidden md:inline">{{ $t(a.labelKey) }}</span>
        </button>
      </template>
    </PageHeader>

    <!-- Bento: hero (2/3) + liczby biblioteki (1/3). -->
    <div class="grid grid-cols-1 gap-4 mb-8 xl:grid-cols-3">
      <HomeContinueCard
        v-if="has('continue') && continueTrack"
        class="xl:col-span-2"
        :track="continueTrack"
        :position="continuePosition"
        @play="playContinue"
        @play-from-start="onPlayFromStart"
      />
      <HomeWelcomeCard
        v-else
        class="xl:col-span-2"
        :can-shuffle="library.totalCount > 0"
        @shuffle="playRandom"
        @open-files="openFile"
        @open-folder="openFolder"
      />

      <HomeStatsPanel
        class="xl:col-span-1"
        :items="counters"
        :loading="library.isLoading || !library.isLoaded"
        @open="openLibrary"
      />
    </div>

    <!-- Szybki powrót: ostatnio grane jako mini-karty, bez szukania na półce. -->
    <HomeQuickPicks
      v-if="has('recent') && quickPicks.length"
      :items="quickPicks"
      :title="$t('home.quickPicks')"
      :see-all-label="$t('home.showAll')"
      @see-all="openLibrary('tracks')"
      @play="player.setTrack($event)"
      @contextmenu="homeContextMenu.showRecentMenu"
    />

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
        :subtitle="trackSubtitle(item)"
        :cover-path="item.path"
        :cover-size="132"
        :badge="`${item.playCount}×`"
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
        stacked
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
        stacked
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
