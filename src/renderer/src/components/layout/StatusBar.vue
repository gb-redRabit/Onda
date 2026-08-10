<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';

const { t } = useI18n();

const route = useRoute();
const player = usePlayerStore();
const library = useLibraryStore();
const explorer = useExplorerStore();
const youtube = useYouTubeStore();
const { status, ensureLoaded } = useYoutubeAuth();
ensureLoaded();

const viewInfo = computed(() => {
  switch (route.name) {
    case 'library':
      return `${library.totalCount} ${t('status.tracks')}`;
    case 'explorer':
      return `${explorer.sortedFiles.length} ${t('status.items')}`;
    case 'youtube':
      return youtube.searchResults.length
        ? `${youtube.searchResults.length} ${t('status.results')}`
        : '';
    case 'downloads':
      return youtube.downloads.length ? `${youtube.downloads.length} ${t('status.downloads')}` : '';
    default:
      return '';
  }
});

const activeDownloads = computed(() =>
  youtube.downloads.filter((d) => d.status === 'downloading' || d.status === 'pending')
);
const activeDownload = computed(() => activeDownloads.value[0] || null);
</script>

<template>
  <div
    class="h-6 bg-bg-surface border-t border-border-default flex items-center px-3 text-[11px] text-fg-faint shrink-0 gap-4"
  >
    <div class="flex items-center gap-1.5">
      <div
        class="w-1.5 h-1.5 rounded-full"
        :class="player.isPlaying ? 'bg-green-base' : 'bg-border-subtle'"
      />
      <span v-if="player.currentTrack">
        {{ player.currentTrack.extension?.toUpperCase() }}
        <template v-if="player.currentTrack.metadata?.bitrate">
          · {{ player.currentTrack.metadata.bitrate }}kbps</template
        >
        <template v-if="player.currentTrack.metadata?.sampleRate">
          · {{ player.currentTrack.metadata.sampleRate / 1000 }}kHz</template
        >
      </span>
      <span v-else>{{ $t('status.noMedia') }}</span>
    </div>
    <div class="h-3 w-px bg-border-default" />
    <span v-if="viewInfo">{{ viewInfo }}</span>
    <span>{{ library.totalCount }} {{ $t('status.tracks') }}</span>
    <span>{{ library.playlists.length }} {{ $t('status.playlists') }}</span>
    <div class="flex-1" />
    <span v-if="activeDownload" class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full bg-accent-base animate-pulse" />
      {{ activeDownload.title }} {{ activeDownload.progress }}%
    </span>
    <span class="flex items-center gap-1.5">
      <span
        class="w-1.5 h-1.5 rounded-full"
        :class="status.loggedIn ? 'bg-green-base' : 'bg-border-subtle'"
      />
      {{ status.loggedIn ? $t('status.loggedIn') : $t('status.notLoggedIn') }}
    </span>
    <span class="text-fg-faint/60">Onda v1.0.0</span>
  </div>
</template>
