<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { MediaFile } from '@renderer/types/media';
import { useUIStore } from '@renderer/stores/ui';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { Search, Music2, Film, Disc3, Settings, Home, ArrowRight } from '@lucide/vue';

const { t } = useI18n();

const ui = useUIStore();
const library = useLibraryStore();
const player = usePlayerStore();
const router = useRouter();

const query = ref('');
const input = ref<HTMLInputElement | null>(null);
const activeIndex = ref(0);

const actions = computed(() => [
  { label: t('nav.home'), icon: Home, action: () => router.push('/') },
  { label: t('nav.library'), icon: Disc3, action: () => router.push('/library') },
  { label: t('nav.settings'), icon: Settings, action: () => router.push('/settings') }
]);

const results = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return { tracks: [] as MediaFile[], actions: actions.value };
  const tracks = library.tracks.filter(
    (t) =>
      (t.metadata?.title || t.name).toLowerCase().includes(q) ||
      (t.metadata?.artist || '').toLowerCase().includes(q) ||
      (t.metadata?.album || '').toLowerCase().includes(q)
  ).slice(0, 10);
  return { tracks, actions: actions.value.filter((a) => a.label.toLowerCase().includes(q)) };
});

const flatItems = computed(() => {
  const items: ({ type: 'track'; track: MediaFile } | { type: 'action'; label: string; icon: any; action: () => void })[] = [];
  results.value.tracks.forEach((t) => items.push({ type: 'track', track: t }));
  results.value.actions.forEach((a) => items.push({ type: 'action', ...a }));
  return items;
});

watch(() => ui.commandPaletteVisible, (v) => {
  if (v) {
    query.value = '';
    activeIndex.value = 0;
    setTimeout(() => input.value?.focus(), 50);
  }
});

function onKeydown(e: KeyboardEvent) {
  if (!ui.commandPaletteVisible) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, flatItems.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = flatItems.value[activeIndex.value];
    if (!item) return;
    if (item.type === 'action') {
      item.action();
      ui.toggleCommandPalette();
    } else {
      player.setTrack(item.track);
      player.play();
      ui.toggleCommandPalette();
    }
  } else if (e.key === 'Escape') {
    ui.toggleCommandPalette();
  }
}

document.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    v-if="ui.commandPaletteVisible"
    class="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] bg-gray-900/45 backdrop-blur-sm"
    @click.self="ui.toggleCommandPalette"
  >
    <div
      class="w-[480px] max-w-[90vw] bg-bg-elevated border border-border-default rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
    >
      <div class="flex items-center gap-2 px-3 py-2.5 border-b border-border-default">
        <Search :size="16" class="text-fg-faint shrink-0" />
        <input
          ref="input"
          v-model="query"
          :placeholder="$t('cmdPalette.placeholder')"
          class="flex-1 bg-transparent text-sm text-fg-base outline-none placeholder:text-fg-faint/50"
        />
      </div>
      <div class="max-h-80 overflow-y-auto py-1">
        <div v-if="results.tracks.length === 0 && !query" class="px-3 py-4 text-center text-xs text-fg-faint italic">
          {{ $t('cmdPalette.empty') }}
        </div>
        <template v-for="(item, i) in flatItems" :key="i">
          <div
            v-if="item.type === 'track'"
            class="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors"
            :class="i === activeIndex ? 'bg-accent-ghost text-accent-base' : 'hover:bg-bg-hover'"
            @click="player.setTrack(item.track); player.play(); ui.toggleCommandPalette()"
            @mouseenter="activeIndex = i"
          >
            <component :is="item.track.type === 'video' ? Film : Music2" :size="14" class="shrink-0 text-fg-faint" />
            <span class="truncate flex-1">{{ item.track.metadata?.title || item.track.name }}</span>
            <span class="text-[11px] text-fg-faint shrink-0 truncate max-w-[120px]">{{ item.track.metadata?.artist || item.track.extension }}</span>
          </div>
          <div
            v-else
            class="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors"
            :class="i === activeIndex ? 'bg-accent-ghost text-accent-base' : 'hover:bg-bg-hover'"
            @click="item.action(); ui.toggleCommandPalette()"
            @mouseenter="activeIndex = i"
          >
            <component :is="item.icon" :size="14" class="shrink-0 text-fg-faint" />
            <span>{{ item.label }}</span>
            <ArrowRight :size="12" class="ml-auto text-fg-faint" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
