<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayerStore } from '@renderer/stores/player'
import { useLibraryStore } from '@renderer/stores/library'
import { useExplorerStore } from '@renderer/stores/explorer'
import { useYouTubeStore } from '@renderer/stores/youtube'

const route = useRoute()
const player = usePlayerStore()
const library = useLibraryStore()
const explorer = useExplorerStore()
const youtube = useYouTubeStore()

const viewInfo = computed(() => {
  switch (route.name) {
    case 'library':
      return `${library.totalCount} utworów`
    case 'explorer':
      return `${explorer.sortedFiles.length} elementów`
    case 'youtube':
      return youtube.searchResults.length ? `${youtube.searchResults.length} wyników` : ''
    case 'downloads':
      return youtube.downloads.length ? `${youtube.downloads.length} pobrań` : ''
    default:
      return ''
  }
})

const activeDownloads = computed(() =>
  youtube.downloads.filter((d) => d.status === 'downloading' || d.status === 'pending')
)
const activeDownload = computed(() => activeDownloads.value[0] || null)
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
      <span v-else>Nie załadowano mediów</span>
    </div>
    <div class="h-3 w-px bg-border-default" />
    <span v-if="viewInfo">{{ viewInfo }}</span>
    <span>{{ library.totalCount }} utworów</span>
    <span>{{ library.playlists.length }} playlist</span>
    <div class="flex-1" />
    <span v-if="activeDownload" class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full bg-accent-base animate-pulse" />
      {{ activeDownload.title }} {{ activeDownload.progress }}%
    </span>
    <span class="text-fg-faint/60">Onda v1.0.0</span>
  </div>
</template>
