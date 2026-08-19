<script setup lang="ts">
import {ref,onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useLibraryStore } from '@renderer/stores/library';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';
import type { AppInfo } from '@shared/types/ipc';
import { logger } from '@shared/logger';
const { t } = useI18n();

const info = ref<AppInfo | null>(null);
  const licenses = ref<Array<{ name: string; version?: string; license?: string }>>([]);

onMounted(async () => {
  try {
    const [i, l] = await Promise.all([window.api?.getAppInfo(), window.api?.getLicenses()]);
    if (i) info.value = i;
    if (l) licenses.value = l;
  } catch (e) {
    logger.warn('about', 'load failed', e);
  }
});

const route = useRoute();
const player = usePlayerStore();
const audio = useAudioPlayer();
const library = useLibraryStore();
const explorer = useExplorerStore();
const youtube = useYouTubeStore();
const { status, ensureLoaded } = useYoutubeAuth();
ensureLoaded();

const viewCounts = computed(() => {
  switch (route.name) {
    case 'audio':
      return [{ label: t('status.audioFiles'), count: library.audioCount }];
    case 'player':
      return [{ label: t('status.videoFiles'), count: library.videoCount }];
    case 'library':
      return [
        { label: t('status.audioFiles'), count: library.audioCount },
        { label: t('status.videoFiles'), count: library.videoCount },
        { label: t('status.images'), count: library.imageCount },
        { label: t('status.playlistsLabel'), count: library.playlists.length }
      ];
    case 'explorer': {
      const counts = { audio: 0, video: 0, image: 0, playlist: 0 };
      for (const f of explorer.files) {
        if (f.isDirectory || !f.extension) continue;
        const cat = getFileTypeInfo(f.extension).category;
        if (cat === 'audio' || cat === 'video' || cat === 'image' || cat === 'playlist') {
          counts[cat]++;
        }
      }
      return [
        { label: t('status.audioFiles'), count: counts.audio },
        { label: t('status.videoFiles'), count: counts.video },
        { label: t('status.images'), count: counts.image },
        { label: t('status.playlistsLabel'), count: counts.playlist }
      ].filter((s) => s.count > 0);
    }
    default:
      return [];
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
      <span v-if="player.streamPending" class="flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-accent-base animate-pulse" />
        {{ player.streamPending.name }} · {{ $t('status.connecting') }}
      </span>
      <template v-else-if="player.currentTrack">
        <span
          class="w-1.5 h-1.5 rounded-full"
          :class="player.isPlaying ? 'bg-green-base' : 'bg-border-subtle'"
        />
        <span v-if="player.currentTrack.type === 'stream' && audio.error.value === 'stream-failed'" class="text-red-base">
          {{ $t('status.streamError') }}
        </span>
        <span v-else-if="player.currentTrack.type === 'stream' && audio.isLoading.value" class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-accent-base animate-pulse" />
          {{ $t('status.buffering') }}
        </span>
        <span v-else>
          {{ player.currentTrack.type === 'stream' ? 'YT' : player.currentTrack.extension?.toUpperCase() }}
          <template v-if="player.currentTrack.metadata?.bitrate">
            · {{ player.currentTrack.metadata.bitrate }}kbps</template
          >
          <template v-if="player.currentTrack.metadata?.sampleRate">
            · {{ player.currentTrack.metadata.sampleRate / 1000 }}kHz</template
          >
        </span>
      </template>
      <span v-else>{{ $t('status.noMedia') }}</span>
    </div>
    <template v-if="viewCounts.length">
      <div class="h-3 w-px bg-border-default" />
      <span v-for="s in viewCounts" :key="s.label">{{ s.count }} {{ s.label }}</span>
    </template>
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
    <span class="text-fg-faint/60">Onda v{{ info?.appVersion }}</span>
  </div>
</template>
