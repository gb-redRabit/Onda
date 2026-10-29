<script setup lang="ts">
import { Disc3, Heart, Home, ListMusic, Mic2, Music2, TrendingUp } from '@lucide/vue';
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
  playCountBadge,
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
    class="flex flex-col h-full"
    @contextmenu="homeContextMenu.showHomeMenu($event)"
  >
    <PageHeader :title="t('home.welcome')" :subtitle="t('home.subtitle')" :icon="Home" sticky>
      <template #actions>
        <div class="flex items-center gap-1">
          <button
            v-for="a in actions"
            :key="a.labelKey"
            :data-testid="'home-action-' + a.id"
            class="inline-flex h-8 items-center gap-1.5 rounded-field border border-transparent px-2.5 text-xs font-medium text-base-content/70 transition-colors hover:border-base-300/80 hover:bg-base-content/6 hover:text-base-content"
            :title="$t(a.labelKey)"
            :aria-label="$t(a.labelKey)"
            @click="a.route()"
          >
            <component :is="a.icon" :size="14" class="shrink-0 text-primary-text" />
            <span class="hidden md:inline">{{ $t(a.labelKey) }}</span>
          </button>
        </div>
      </template>
    </PageHeader>

    <div class="flex-1 overflow-y-auto">
      <div class="px-5 py-5 space-y-6">
        <!-- Bento: hero (8/12) + liczby biblioteki (4/12). -->
        <div class="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          <HomeContinueCard
            v-if="has('continue') && continueTrack"
            class="lg:col-span-7 xl:col-span-8"
            :track="continueTrack"
            :position="continuePosition"
            @play="playContinue"
            @play-from-start="onPlayFromStart"
          />
          <HomeWelcomeCard
            v-else
            class="lg:col-span-7 xl:col-span-8"
            :can-shuffle="library.totalCount > 0"
            @shuffle="playRandom"
            @open-files="openFile"
            @open-folder="openFolder"
          />

          <HomeStatsPanel
            class="lg:col-span-5 xl:col-span-4"
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
          v-else-if="has('recent') && library.isLoaded && !has('continue') && !continueTrack"
          :title="$t('home.noTracks')"
          :description="$t('home.openFileToStart')"
          :icon="Music2"
          compact
          class="bg-base-100/60"
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
            :badge="playCountBadge(item.playCount)"
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
      </div>
    </div>

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
