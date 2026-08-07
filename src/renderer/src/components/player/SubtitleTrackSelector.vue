<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Subtitles, Check, Upload } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { logger } from '@shared/logger';

const player = usePlayerStore();
const isOpen = ref(false);
const container = ref<HTMLElement | null>(null);

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (isOpen.value && container.value && !container.value.contains(target)) {
    isOpen.value = false;
  }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));

function selectTrack(id: string | null) {
  player.setActiveSubtitle(id);
  isOpen.value = false;
}

async function uploadSubtitles() {
  const result = await window.api?.openSubtitleDialog();
  if (!result || result.canceled || !result.filePaths.length) return;
  const added = await player.loadCustomSubtitles(result.filePaths);
  if (added > 0) {
    isOpen.value = false;
  } else {
    logger.error('Subtitles', 'no subtitle files could be read');
  }
}
</script>

<template>
  <div ref="container" class="relative inline-flex items-center">
    <button
      class="text-white/50 hover:text-white transition-colors"
      :class="{ 'text-accent-base!': player.activeSubtitleId }"
      @click="isOpen = !isOpen"
    >
      <Subtitles :size="16" />
    </button>

    <Transition name="menu-fade">
      <div
        v-if="isOpen"
        class="absolute bottom-full right-0 mb-2 w-60 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl shadow-black/50 py-1.5 z-50"
      >
        <div class="px-3 py-1.5 text-[10px] text-fg-faint font-medium uppercase tracking-wider">
          {{ $t('subtitles.title') }}
        </div>

        <button
          v-if="player.subtitleTracks.length > 0"
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          :class="{ 'text-accent-base': !player.activeSubtitleId }"
          @click="selectTrack(null)"
        >
          <Check v-if="!player.activeSubtitleId" :size="14" class="shrink-0" />
          <span v-else class="w-3.5 shrink-0" />
          {{ $t('subtitles.disable') }}
        </button>

        <div
          v-if="player.subtitleTracks.some((t) => t.source === 'embedded')"
          class="border-t border-border-default my-1 mx-2"
        />
        <div v-if="player.subtitleTracks.some((t) => t.source === 'embedded')" class="px-3 py-1 text-[10px] text-fg-faint/60">{{ $t('subtitles.embedded') }}</div>
        <button
          v-for="track in player.subtitleTracks.filter((t) => t.source === 'embedded')"
          :key="track.id"
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          :class="{ 'text-accent-base': player.activeSubtitleId === track.id }"
          @click="selectTrack(track.id)"
        >
          <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
          <span v-else class="w-3.5 shrink-0" />
          <span class="truncate">{{ track.label }}</span>
        </button>

        <div
          v-if="player.subtitleTracks.some((t) => t.source === 'external')"
          class="border-t border-border-default my-1 mx-2"
        />
        <div v-if="player.subtitleTracks.some((t) => t.source === 'external')" class="px-3 py-1 text-[10px] text-fg-faint/60">{{ $t('subtitles.fromFolder') }}</div>
        <button
          v-for="track in player.subtitleTracks.filter((t) => t.source === 'external')"
          :key="track.id"
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          :class="{ 'text-accent-base': player.activeSubtitleId === track.id }"
          @click="selectTrack(track.id)"
        >
          <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
          <span v-else class="w-3.5 shrink-0" />
          <span class="truncate">{{ track.label }}</span>
        </button>

        <div
          v-if="player.subtitleTracks.some((t) => t.source === 'custom')"
          class="border-t border-border-default my-1 mx-2"
        />
        <div v-if="player.subtitleTracks.some((t) => t.source === 'custom')" class="px-3 py-1 text-[10px] text-fg-faint/60">{{ $t('subtitles.custom') }}</div>
        <button
          v-for="track in player.subtitleTracks.filter((t) => t.source === 'custom')"
          :key="track.id"
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          :class="{ 'text-accent-base': player.activeSubtitleId === track.id }"
          @click="selectTrack(track.id)"
        >
          <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
          <span v-else class="w-3.5 shrink-0" />
          <span class="truncate">{{ track.label }}</span>
        </button>

        <div class="border-t border-border-default my-1 mx-2" />
        <button
          class="w-full px-3 py-1.5 text-left text-sm text-accent-base hover:bg-accent-ghost transition-colors flex items-center gap-2"
          @click="uploadSubtitles"
        >
          <Upload :size="14" class="shrink-0" />
          {{ $t('subtitles.upload') }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
