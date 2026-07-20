<script setup lang="ts">
import { ref } from 'vue';
import { Search, Play, Download, ExternalLink, Tv2 } from '@lucide/vue';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { formatNumber } from '@renderer/utils/formatters';
import type { YouTubeSearchResult } from '@renderer/types/youtube';

const yt = useYouTubeStore();

const query = ref('');

async function search() {
  if (!query.value.trim()) return;
  yt.isSearching = true;
  yt.searchQuery = query.value;
  try {
    const result = (await window.api.invoke('yt:search', query.value)) as YouTubeSearchResult | null;
    if (result) yt.setResults(result.items || [], result.nextPageToken, result.prevPageToken);
  } catch {}
  yt.isSearching = false;
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default">
      <div class="flex items-center gap-3 mb-3">
        <Tv2 :size="24" class="text-red-base" />
        <h1 class="text-xl font-bold">YouTube</h1>
      </div>
      <div class="flex gap-2">
        <div class="relative flex-1">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            v-model="query"
            placeholder="Szukaj na YouTube..."
            class="w-full pl-9 pr-3 py-2.5 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
            @keydown.enter="search"
          />
        </div>
        <button
          class="px-5 py-2.5 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          @click="search"
        >
          Szukaj
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <div v-if="yt.isSearching" class="flex justify-center py-16">
        <div
          class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
        />
      </div>
      <div
        v-else-if="yt.searchResults.length === 0"
        class="flex flex-col items-center justify-center py-16 text-fg-faint"
      >
        <Tv2 :size="64" class="mb-4 opacity-20" />
        <p class="text-lg font-medium mb-1">Szukaj na YouTube</p>
        <p class="text-sm">Znajdź muzykę, filmy i więcej</p>
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="v in yt.searchResults"
          :key="v.id"
          class="flex gap-3 p-3 rounded-xl hover:bg-bg-hover transition-colors group cursor-pointer"
        >
          <div
            class="w-40 aspect-video rounded-lg bg-bg-elevated overflow-hidden shrink-0 relative"
          >
            <img
              v-if="v.thumbnail"
              :src="v.thumbnail"
              :alt="v.title"
              class="w-full h-full object-cover"
            />
            <div
              class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"
            >
              <Play :size="32" class="text-white" fill="white" />
            </div>
            <div
              v-if="v.duration"
              class="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded"
            >
              {{ v.duration }}
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium line-clamp-2 mb-1">{{ v.title }}</h3>
            <div class="text-xs text-fg-faint">
              {{ v.channelTitle }}
              <span v-if="v.viewCount"> · {{ formatNumber(v.viewCount) }} wyświetleń</span>
            </div>
            <p class="text-xs text-fg-faint mt-1 line-clamp-2">{{ v.description }}</p>
          </div>
          <div
            class="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              class="p-2 rounded-lg bg-accent-base text-white hover:bg-accent-hover transition-colors"
            >
              <Download :size="14" />
            </button>
            <button
              class="p-2 rounded-lg bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover transition-colors"
            >
              <ExternalLink :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
