<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Music2, Play, Clock, FolderOpen, Disc3, Tv2, ArrowRight, FolderUp } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';

const router = useRouter();
const player = usePlayerStore();
const library = useLibraryStore();

async function openFile() {
  const result = (await window.api?.invoke('dialog:openFile')) as
    | { filePaths: string[]; canceled: boolean }
    | undefined;
  if (!result || result.canceled || !result.filePaths.length) return;
  await openMediaFiles(result.filePaths, router);
}

async function openFolder() {
  const result = (await window.api?.invoke('dialog:openFolderFiles')) as
    | { filePaths: string[]; canceled: boolean }
    | undefined;
  if (!result || result.canceled || !result.filePaths.length) return;
  await openMediaFiles(result.filePaths, router);
}

const actions = [
  {
    labelKey: 'home.openFile',
    descKey: 'home.browseLocalMedia',
    icon: FolderOpen,
    route: openFile
  },
  {
    labelKey: 'home.openFolder',
    descKey: 'home.loadMediaFromFolder',
    icon: FolderUp,
    route: openFolder
  },
  {
    labelKey: 'library.title',
    descKey: 'home.yourMusicCollection',
    icon: Disc3,
    route: () => router.push('/library')
  },
  {
    labelKey: 'youtube.title',
    descKey: 'home.searchAndDownload',
    icon: Tv2,
    route: () => router.push('/youtube')
  }
];
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <div class="mb-8">
      <h1 class="text-3xl font-bold mb-1">{{ $t('home.welcome') }}</h1>
      <p class="text-fg-muted text-sm">{{ $t('home.subtitle') }}</p>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <button
        v-for="a in actions"
        :key="a.labelKey"
        class="flex items-center gap-4 p-5 rounded-2xl bg-bg-elevated border border-border-default hover:border-border-subtle hover:bg-bg-hover transition-all group text-left"
        @click="a.route()"
      >
        <div class="w-12 h-12 rounded-xl bg-accent-ghost flex items-center justify-center">
          <component :is="a.icon" :size="22" class="text-accent-base" />
        </div>
        <div class="flex-1">
          <div class="text-sm font-semibold">{{ $t(a.labelKey) }}</div>
          <div class="text-xs text-fg-faint mt-0.5">{{ $t(a.descKey) }}</div>
        </div>
        <ArrowRight
          :size="16"
          class="text-fg-faint group-hover:text-fg-base group-hover:translate-x-0.5 transition-all"
        />
      </button>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
      <template v-if="library.isLoading || !library.isLoaded">
        <div
          v-for="i in 5"
          :key="i"
          class="p-4 rounded-xl bg-bg-elevated border border-border-default animate-pulse"
        >
          <div class="h-8 w-16 rounded bg-bg-hover mb-2" />
          <div class="h-3 w-24 rounded bg-bg-hover" />
        </div>
      </template>
      <template v-else>
        <div
          v-for="s in [
            { v: library.totalCount, k: 'home.totalTracks', c: 'text-fg-base' },
            { v: library.audioCount, k: 'home.audioFiles', c: 'text-accent-base' },
            { v: library.videoCount, k: 'home.videoFiles', c: 'text-green-base' },
            { v: library.imageCount, k: 'home.imageFiles', c: 'text-purple-base' },
            { v: library.playlists.length, k: 'library.playlists', c: 'text-amber-base' }
          ]"
          :key="s.k"
          class="p-4 rounded-xl bg-bg-elevated border border-border-default"
        >
          <div :class="['text-3xl font-bold', s.c]">{{ s.v }}</div>
          <div class="text-xs text-fg-faint mt-1">{{ $t(s.k) }}</div>
        </div>
      </template>
    </div>

    <div class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold flex items-center gap-2">
          <Clock :size="16" class="text-accent-base" /> {{ $t('home.recentlyPlayed') }}
        </h2>
        <button
          class="text-xs text-accent-base hover:text-accent-hover font-medium transition-colors"
          @click="router.push('/library')"
        >
          {{ $t('home.showAll') }}
        </button>
      </div>
      <div
        v-if="!library.isLoaded || library.recentTracks.length === 0"
        class="text-center py-14 rounded-2xl bg-bg-elevated border border-border-default"
      >
        <Music2 :size="40" class="mx-auto mb-3 text-fg-faint/40" />
        <p class="text-sm text-fg-muted">{{ $t('home.noTracks') }}</p>
        <p class="text-xs text-fg-faint mt-1">{{ $t('home.openFileToStart') }}</p>
      </div>
      <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          v-for="t in library.recentTracks.slice(0, 8)"
          :key="t.path"
          class="flex items-center gap-3 p-3 rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all text-left group"
          @click="player.setTrack(t)"
        >
          <div
            class="w-10 h-10 rounded-lg bg-accent-ghost flex items-center justify-center shrink-0 group-hover:bg-accent-base transition-colors"
          >
            <Play
              :size="14"
              class="text-accent-base group-hover:text-white ml-0.5 transition-colors"
            />
          </div>
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">{{ t.metadata?.title || t.name }}</div>
            <div class="text-xs text-fg-faint truncate">
              {{ t.metadata?.artist || $t('home.unknown') }}
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
