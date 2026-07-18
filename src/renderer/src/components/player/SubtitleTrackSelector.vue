<script setup lang="ts">
import { ref } from 'vue';
import { Subtitles, Check } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';

const player = usePlayerStore();
const isOpen = ref(false);

function selectTrack(id: string | null) {
  player.setActiveSubtitle(id);
  isOpen.value = false;
}
</script>

<template>
  <div class="relative inline-flex items-center">
    <button
      class="text-white/50 hover:text-white transition-colors"
      :class="{ '!text-accent-base': player.activeSubtitleId }"
      @click="isOpen = !isOpen"
    >
      <Subtitles :size="16" />
    </button>

    <Transition name="menu-fade">
      <div
        v-if="isOpen && player.subtitleTracks.length > 0"
        class="absolute bottom-full right-0 mb-2 w-55 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl shadow-black/50 py-1.5 z-50"
      >
        <div class="px-3 py-1.5 text-[10px] text-fg-faint font-medium uppercase tracking-wider">
          Napisy
        </div>

        <button
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          :class="{ 'text-accent-base': !player.activeSubtitleId }"
          @click="selectTrack(null)"
        >
          <Check v-if="!player.activeSubtitleId" :size="14" class="shrink-0" />
          <span v-else class="w-3.5 shrink-0" />
          Wyłącz napisy
        </button>

        <div
          v-if="player.subtitleTracks.some((t) => t.source === 'embedded')"
          class="border-t border-border-default my-1 mx-2"
        />
        <div class="px-3 py-1 text-[10px] text-fg-faint/60">Wbudowane</div>
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
        <div class="px-3 py-1 text-[10px] text-fg-faint/60">Z folderu</div>
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
