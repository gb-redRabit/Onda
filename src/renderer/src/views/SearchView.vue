<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Search, Music2 } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { moduleManager } from '@renderer/modules/ModuleManager';

const library = useLibraryStore();
const player = usePlayerStore();

onMounted(() => {
  moduleManager.switchTo('home');
});
const query = ref('');
const scope = ref<'all' | 'library' | 'files'>('all');

const results = computed(() => {
  if (!query.value.trim()) return [];
  const q = query.value.toLowerCase();
  return library.tracks
    .filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.metadata?.title?.toLowerCase().includes(q) ||
        t.metadata?.artist?.toLowerCase().includes(q) ||
        t.metadata?.album?.toLowerCase().includes(q)
    )
    .slice(0, 50);
});
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default">
      <div class="relative">
        <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
        <input
          v-model="query"
          placeholder="Szukaj wszystkiego..."
          class="w-full pl-10 pr-4 py-3 rounded-xl bg-bg-elevated border border-border-default text-base focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
          autofocus
        />
      </div>
      <div class="flex gap-2 mt-3">
        <button
          v-for="s in ['all', 'library', 'files'] as const"
          :key="s"
          class="px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors"
          :class="
            scope === s ? 'bg-accent-ghost text-accent-base' : 'text-fg-faint hover:bg-bg-hover'
          "
          @click="scope = s"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <div
        v-if="!query.trim()"
        class="flex flex-col items-center justify-center py-16 text-fg-faint"
      >
        <Search :size="48" class="mb-3 opacity-30" />
        <p class="text-sm">Zacznij pisać aby przeszukać bibliotekę</p>
        <p class="text-xs mt-1">Ctrl+K aby otworzyć z dowolnego miejsca</p>
      </div>
      <div v-else-if="results.length === 0" class="text-center py-16 text-fg-faint">
        <p class="text-sm">Brak wyników dla "{{ query }}"</p>
      </div>
      <div v-else class="space-y-1">
        <div
          v-for="track in results"
          :key="track.path"
          class="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer group"
          @click="player.setTrack(track)"
        >
          <div
            class="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center shrink-0 group-hover:bg-accent-base transition-colors"
          >
            <Music2 :size="14" class="text-fg-faint group-hover:text-white" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium truncate">
              {{ track.metadata?.title || track.name }}
            </div>
            <div class="text-xs text-fg-faint truncate">
              {{ track.metadata?.artist || 'Nieznany' }} · {{ track.metadata?.album || '' }}
            </div>
          </div>
          <span class="text-xs text-fg-faint">{{ track.extension?.toUpperCase() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
