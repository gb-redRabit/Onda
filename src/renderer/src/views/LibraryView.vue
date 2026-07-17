<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useLibraryStore } from '@renderer/stores/library'
import { usePlayerStore } from '@renderer/stores/player'
import { moduleManager } from '@renderer/modules/ModuleManager'
import { Music2, List, Grid3X3, Search } from '@lucide/vue'
import { formatDuration } from '@renderer/utils/formatters'

const library = useLibraryStore()
const player = usePlayerStore()

onMounted(() => {
  moduleManager.switchTo('library')
})
const viewMode = ref<'list' | 'grid'>('list')
const query = ref('')
const tab = ref<'tracks' | 'artists' | 'albums' | 'playlists'>('tracks')

const tabLabels: Record<string, string> = {
  tracks: 'Utwory',
  artists: 'Artyści',
  albums: 'Albumy',
  playlists: 'Playlisty'
}

const filtered = computed(() => (query.value ? library.search(query.value) : library.tracks))
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold">Biblioteka</h1>
        <div class="flex gap-1">
          <button
            class="p-1.5 rounded-lg transition-colors"
            :class="
              viewMode === 'list'
                ? 'bg-accent-ghost text-accent-base'
                : 'text-fg-faint hover:bg-bg-hover'
            "
            @click="viewMode = 'list'"
          >
            <List :size="16" />
          </button>
          <button
            class="p-1.5 rounded-lg transition-colors"
            :class="
              viewMode === 'grid'
                ? 'bg-accent-ghost text-accent-base'
                : 'text-fg-faint hover:bg-bg-hover'
            "
            @click="viewMode = 'grid'"
          >
            <Grid3X3 :size="16" />
          </button>
        </div>
      </div>
      <div class="flex gap-1 mb-3">
        <button
          v-for="t in ['tracks', 'artists', 'albums', 'playlists'] as const"
          :key="t"
          class="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors"
          :class="tab === t ? 'bg-accent-base text-white' : 'text-fg-muted hover:bg-bg-hover'"
          @click="tab = t"
        >
          {{ tabLabels[t] }}
        </button>
      </div>
      <div class="relative">
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
        <input
          v-model="query"
          placeholder="Szukaj w bibliotece..."
          class="w-full pl-9 pr-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
        />
      </div>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <!-- tracks list -->
      <template v-if="tab === 'tracks'">
        <div v-if="filtered.length === 0" class="text-center py-16">
          <Music2 :size="48" class="mx-auto mb-3 text-fg-faint/30" />
          <p class="text-sm text-fg-muted">Brak utworów w bibliotece</p>
        </div>
        <template v-else-if="viewMode === 'list'">
          <div
            class="grid grid-cols-[1fr_160px_120px_80px] gap-3 px-3 py-2 text-[11px] text-fg-faint font-medium uppercase tracking-wider border-b border-border-default mb-1"
          >
            <span>Tytuł</span><span>Artysta</span><span>Album</span
            ><span class="text-right">Czas</span>
          </div>
          <button
            v-for="t in filtered"
            :key="t.path"
            class="w-full grid grid-cols-[1fr_160px_120px_80px] gap-3 px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors text-left items-center group"
            @click="player.setTrack(t)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="w-8 h-8 rounded-md bg-bg-elevated flex items-center justify-center shrink-0 group-hover:bg-accent-base group-hover:text-white transition-colors text-fg-faint"
              >
                <Music2 :size="14" />
              </div>
              <span class="text-sm truncate">{{ t.metadata?.title || t.name }}</span>
            </div>
            <span class="text-sm text-fg-muted truncate">{{ t.metadata?.artist || '—' }}</span>
            <span class="text-sm text-fg-muted truncate">{{ t.metadata?.album || '—' }}</span>
            <span class="text-sm text-fg-faint text-right font-mono">{{
              formatDuration(t.duration || 0)
            }}</span>
          </button>
        </template>
        <div v-else class="grid grid-cols-3 lg:grid-cols-5 gap-3">
          <button
            v-for="t in filtered"
            :key="t.path"
            class="flex flex-col p-3 rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all text-left"
            @click="player.setTrack(t)"
          >
            <div
              class="w-full aspect-square rounded-lg bg-bg-overlay mb-2 flex items-center justify-center"
            >
              <Music2 :size="24" class="text-fg-faint" />
            </div>
            <div class="text-sm font-medium truncate">{{ t.metadata?.title || t.name }}</div>
            <div class="text-xs text-fg-faint truncate">{{ t.metadata?.artist || 'Nieznany' }}</div>
          </button>
        </div>
      </template>

      <!-- artists -->
      <div v-else-if="tab === 'artists'" class="grid grid-cols-3 lg:grid-cols-5 gap-3">
        <div
          v-if="library.artists.length === 0"
          class="col-span-full text-center py-16 text-fg-faint"
        >
          <p class="text-sm">Brak artystów</p>
        </div>
        <div
          v-for="[name, tracks] in library.artists"
          :key="name"
          class="flex flex-col items-center p-4 rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all text-center"
        >
          <div class="w-20 h-20 rounded-full bg-accent-ghost flex items-center justify-center mb-2">
            <Music2 :size="28" class="text-accent-base" />
          </div>
          <div class="text-sm font-medium">{{ name }}</div>
          <div class="text-xs text-fg-faint">{{ tracks.length }} utworów</div>
        </div>
      </div>

      <!-- albums -->
      <div v-else-if="tab === 'albums'" class="grid grid-cols-3 lg:grid-cols-5 gap-3">
        <div
          v-if="library.albums.length === 0"
          class="col-span-full text-center py-16 text-fg-faint"
        >
          <p class="text-sm">Brak albumów</p>
        </div>
        <div
          v-for="[name, tracks] in library.albums"
          :key="name"
          class="flex flex-col p-3 rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all"
        >
          <div
            class="w-full aspect-square rounded-lg bg-bg-overlay mb-2 flex items-center justify-center"
          >
            <Music2 :size="24" class="text-fg-faint" />
          </div>
          <div class="text-sm font-medium truncate">{{ name }}</div>
          <div class="text-xs text-fg-faint">{{ tracks.length }} utworów</div>
        </div>
      </div>

      <!-- playlists -->
      <div v-else-if="tab === 'playlists'" class="text-center py-16">
        <p class="text-sm text-fg-muted mb-3">Brak playlist</p>
        <button
          class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          Utwórz playlistę
        </button>
      </div>
    </div>
  </div>
</template>
