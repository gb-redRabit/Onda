<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { Heart, Clock, Flame, Sparkles, Shuffle, Play } from '@lucide/vue';
import LibraryTrackCard from './LibraryTrackCard.vue';

const { t } = useI18n();
const library = useLibraryStore();
const player = usePlayerStore();

const props = defineProps<{
  query: string;
  filteredAll: MediaFile[];
}>();

const emit = defineEmits<{
  play: [track: MediaFile];
  playTracks: [tracks: MediaFile[]];
  edit: [track: MediaFile];
  showAll: [section: string];
}>();

const hasQuery = computed(() => props.query.trim().length > 0);

const likedTracks = computed(() => {
  const fav = new Set(player.favorites);
  return library.tracks.filter((tr) => fav.has(tr.path) && tr.type === 'audio').slice(0, 6);
});

const recentTracks = computed(() => library.recentTracks.slice(0, 6) as MediaFile[]);
const mostPlayed = computed(() => library.mostPlayed.slice(0, 6) as MediaFile[]);
const newest = computed(() =>
  [...library.audioTracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6)
);
const randomTracks = computed(() => {
  const arr = [...library.audioTracks];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 6);
});

function playAll(tracks: MediaFile[]) {
  if (tracks.length === 0) return;
  emit('playTracks', tracks);
}

function shuffleAll(tracks: MediaFile[]) {
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (shuffled.length) emit('playTracks', shuffled);
}

const sections = computed(() => [
  {
    id: 'liked',
    label: t('library.likedSongs'),
    icon: Heart,
    tracks: likedTracks.value,
    empty: t('library.likedEmpty'),
    color: 'text-error'
  },
  {
    id: 'recent',
    label: t('library.recentlyPlayed'),
    icon: Clock,
    tracks: recentTracks.value,
    empty: t('library.noAudio'),
    color: 'text-primary'
  },
  {
    id: 'most',
    label: t('library.mostPlayed'),
    icon: Flame,
    tracks: mostPlayed.value,
    empty: t('library.noAudio'),
    color: 'text-warning'
  },
  {
    id: 'newest',
    label: t('library.newest'),
    icon: Sparkles,
    tracks: newest.value,
    empty: t('library.noAudio'),
    color: 'text-info'
  },
  {
    id: 'random',
    label: t('library.random'),
    icon: Shuffle,
    tracks: randomTracks.value,
    empty: t('library.noAudio'),
    color: 'text-success'
  }
]);
</script>

<template>
  <!-- Search results mode -->
  <div v-if="hasQuery" class="flex-1 flex flex-col min-h-0">
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300 shrink-0">
      <span class="text-xs text-base-content/50">{{ filteredAll.length }} {{ $t('library.tracksCount') }}</span>
      <button
        v-if="filteredAll.length > 0"
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
        @click="playAll(filteredAll)"
      >
        <Play :size="12" /> {{ $t('library.playAll') }}
      </button>
    </div>
    <div v-if="filteredAll.length === 0" class="flex flex-col items-center justify-center h-64 gap-3 text-base-content/50">
      <Sparkles :size="32" class="opacity-30" />
      <p class="text-sm">{{ $t('common.noPlaylists') }} — {{ query }}</p>
    </div>
    <div v-else class="flex-1 overflow-auto p-4 grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); align-content: start">
      <LibraryTrackCard
        v-for="tr in filteredAll.slice(0, 48)"
        :key="tr.path"
        :track="tr"
        :show-playlist="true"
        @play="emit('play', $event)"
        @edit="emit('edit', $event)"
      />
    </div>
  </div>

  <!-- Overview dashboard -->
  <div v-else class="flex-1 overflow-auto">
    <div class="p-4 pb-2">
      <p class="text-xs text-base-content/50">{{ $t('library.overviewHint') }}</p>
    </div>

    <!-- Liked hero when has likes -->
    <div v-if="likedTracks.length > 0" class="mx-4 mb-4 p-4 rounded-box bg-base-100 border border-base-300 flex items-center gap-4">
      <div class="w-14 h-14 rounded-box bg-primary flex items-center justify-center shrink-0 fx-depth">
        <Heart :size="22" class="text-primary-content fill-primary-content" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold">{{ $t('library.likedSongs') }}</div>
        <div class="text-xs text-base-content/60">{{ likedTracks.length }} {{ $t('common.tracks') }}</div>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="w-10 h-10 rounded-full bg-primary text-primary-content flex items-center justify-center hover:bg-primary/90 transition-colors fx-depth fx-noise"
          @click="playAll(likedTracks)"
        >
          <Play :size="16" class="ml-0.5 fill-current" />
        </button>
        <button
          class="p-2 rounded-full hover:bg-base-content/10 text-base-content/60 hover:text-base-content transition-colors"
          @click="shuffleAll(likedTracks)"
        >
          <Shuffle :size="16" />
        </button>
      </div>
    </div>

    <div class="px-4 pb-6 space-y-7">
      <section v-for="sec in sections" :key="sec.id" class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="flex items-center gap-2 text-sm font-bold">
            <component :is="sec.icon" :size="14" :class="sec.color" />
            {{ sec.label }}
          </h3>
          <div class="flex items-center gap-1">
            <button
              v-if="sec.tracks.length > 1"
              class="p-1.5 rounded-full hover:bg-base-content/10 text-base-content/60 hover:text-base-content transition-colors"
              :title="$t('library.shuffle')"
              @click="shuffleAll(sec.tracks)"
            >
              <Shuffle :size="14" />
            </button>
            <button
              v-if="sec.tracks.length > 0"
              class="text-xs text-primary hover:underline px-2 py-1"
              @click="emit('showAll', sec.id)"
            >
              {{ $t('library.showAll') }}
            </button>
          </div>
        </div>

        <div v-if="sec.tracks.length === 0" class="py-8 flex flex-col items-center gap-2 text-base-content/40 border border-dashed border-base-300 rounded-box bg-base-100/50">
          <component :is="sec.icon" :size="20" class="opacity-30" />
          <p class="text-xs">{{ sec.empty }}</p>
        </div>

        <div v-else class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));">
          <LibraryTrackCard
            v-for="tr in sec.tracks"
            :key="sec.id + tr.path"
            :track="tr"
            :show-playlist="true"
            @play="emit('play', $event)"
            @edit="emit('edit', $event)"
          />
        </div>
      </section>

      <!-- Stats footer minimal -->
      <div class="flex items-center gap-2 text-[11px] text-base-content/40 pt-4 border-t border-base-300">
        <span>{{ library.totalCount }} {{ $t('common.files') }}</span>
        <span>·</span>
        <span>{{ library.audioCount }} audio</span>
        <span>·</span>
        <span>{{ library.playlists.length }} {{ $t('common.noPlaylists') === 'Brak playlist' ? 'playlist' : 'playlists' }}</span>
      </div>
    </div>
  </div>
</template>
