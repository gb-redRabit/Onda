<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { MediaFile } from '@renderer/types/media';
import { useUIStore } from '@renderer/stores/ui';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { usePluginsStore } from '@renderer/stores/plugins';
import { include, type FlatItem, type SearchGroup } from '@renderer/utils/appSearch';
import AppSearchResults from './AppSearchResults.vue';
import {
  Search,
  Film,
  Disc3,
  Settings,
  Home,
  Radio,
  Download,
  Globe,
  Wand2,
  X,
  FolderSearch,
  Puzzle
} from '@lucide/vue';

const { t } = useI18n();

const ui = useUIStore();
const library = useLibraryStore();
const player = usePlayerStore();
const pluginsStore = usePluginsStore();
const router = useRouter();

const input = ref<HTMLInputElement | null>(null);
const activeIndex = ref(0);

// Debounce the (potentially huge) library filter so typing in the command
// palette doesn't re-scan every track on each keystroke (plan 1.8).
const debouncedQuery = ref(ui.searchQuery);
let queryTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => ui.searchQuery,
  (q) => {
    if (debouncedQuery.value === q) return;
    if (queryTimer) clearTimeout(queryTimer);
    queryTimer = setTimeout(() => {
      queryTimer = null;
      debouncedQuery.value = q;
    }, 150);
  }
);
onBeforeUnmount(() => {
  if (queryTimer) clearTimeout(queryTimer);
});

const actions = computed(() => [
  { label: t('nav.home'), icon: Home, action: () => router.push('/') },
  { label: t('nav.library'), icon: Disc3, action: () => router.push('/library') },
  { label: t('nav.online'), icon: Radio, action: () => router.push('/online') },
  { label: t('nav.downloads'), icon: Download, action: () => router.push('/downloads') },
  { label: t('sources.title'), icon: Globe, action: () => router.push('/sources') },
  { label: t('nav.explorer'), icon: Film, action: () => router.push('/explorer') },
  { label: t('nav.settings'), icon: Settings, action: () => router.push('/settings') },
  {
    label: t('wizard.title'),
    icon: Wand2,
    action: () => ui.openSetupWizard()
  }
]);

function playPlaylist(p: MediaFile[]) {
  if (!p.length) return;
  player.clearQueue();
  if (p.length > 1) player.addToQueueMultiple(p.slice(1));
  player.setTrack(p[0]);
  player.play();
  ui.closeSearch();
}

const groups = computed<SearchGroup[]>(() => {
  const q = debouncedQuery.value.toLowerCase().trim();
  const tracks = library.tracks
    .filter((t) =>
      include(q, t.metadata?.title || t.name, t.metadata?.artist || '', t.metadata?.album || '')
    )
    .slice(0, 10)
    .map((t) => ({
      type: 'track' as const,
      track: t,
      label: t.metadata?.title || t.name,
      sub: t.metadata?.artist || t.extension
    }));
  const playlists = library.playlists
    .filter((p) => include(q, p.name))
    .slice(0, 5)
    .map((p) => ({
      type: 'playlist' as const,
      label: p.name,
      sub: p.tracks.length,
      action: () => playPlaylist(p.tracks)
    }));
  const matchedActions = actions.value
    .filter((a) => include(q, a.label))
    .map((a) => ({ type: 'action' as const, label: a.label, icon: a.icon, action: a.action }));
  const result: SearchGroup[] = [];
  if (tracks.length) result.push({ key: 'tracks', label: t('cmdPalette.tracks'), items: tracks });
  if (playlists.length)
    result.push({
      key: 'playlists',
      label: t('cmdPalette.playlists'),
      items: playlists
    });
  if (matchedActions.length)
    result.push({
      key: 'views',
      label: q ? t('cmdPalette.viewsCommands') : t('cmdPalette.views'),
      items: matchedActions
    });
  const pluginCmds = pluginsStore.commands
    .filter((c) => include(q, c.label))
    .slice(0, 10)
    .map((c) => ({
      type: 'action' as const,
      label: c.label,
      icon: Puzzle,
      action: () => {
        pluginsStore.dispatchCommand(c.id);
        ui.closeSearch();
      }
    }));
  if (pluginCmds.length)
    result.push({
      key: 'plugins',
      label: t('cmdPalette.plugins'),
      items: pluginCmds
    });
  return result;
});

const flatItems = computed(() => {
  const items: FlatItem[] = [];
  groups.value.forEach((g) => items.push(...g.items));
  return items;
});

function runItem(item: FlatItem) {
  if (item.type === 'track') {
    player.setTrack(item.track);
    player.play();
  } else {
    item.action();
  }
  ui.closeSearch();
}

watch(
  () => ui.searchMode,
  (mode) => {
    if (mode !== 'closed') {
      activeIndex.value = 0;
      setTimeout(() => input.value?.focus(), 40);
    }
  }
);

function close() {
  ui.closeSearch();
}

function clearQuery() {
  ui.setSearchQuery('');
  activeIndex.value = 0;
  setTimeout(() => input.value?.focus(), 0);
}

function onKeydown(e: KeyboardEvent) {
  if (ui.searchMode === 'closed') return;
  if (e.key === 'ArrowDown') {
    if (ui.searchMode === 'global') {
      e.preventDefault();
      activeIndex.value = Math.min(activeIndex.value + 1, flatItems.value.length - 1);
    }
  } else if (e.key === 'ArrowUp') {
    if (ui.searchMode === 'global') {
      e.preventDefault();
      activeIndex.value = Math.max(activeIndex.value - 1, 0);
    }
  } else if (e.key === 'Enter') {
    if (ui.searchMode === 'global') {
      e.preventDefault();
      const item = flatItems.value[activeIndex.value];
      if (!item) return;
      if ('action' in item) {
        item.action();
        ui.closeSearch();
      }
    }
  } else if (['Escape'].includes(e.key)) {
    if (e.key === 'Escape') close();
  }
}

document.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    v-if="ui.searchMode !== 'closed'"
    class="fixed inset-0 z-70 flex items-start justify-center pt-[12vh]"
    :class="ui.searchMode === 'global' ? 'bg-gray-900/45 backdrop-blur-sm' : ''"
    @click.self="close"
  >
    <div
      :class="ui.searchMode === 'global' ? 'w-120' : 'w-72'"
      class="max-w-[90vw] bg-neutral border border-neutral-content/20 rounded-box shadow-2xl shadow-black/50 overflow-hidden"
    >
      <div class="flex items-center gap-2 px-3 py-2.5 border border-b border-base-300">
        <FolderSearch
          v-if="ui.searchMode === 'view'"
          :size="15"
          class="text-base-content/50 shrink-0"
        />
        <Search v-else :size="15" class="text-base-content/50 shrink-0" />
        <input
          ref="input"
          v-model="ui.searchQuery"
          data-app-search
          class="flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/50"
          :placeholder="
            ui.searchMode === 'view' ? $t('menu.viewSearch') : $t('cmdPalette.placeholder')
          "
        />
        <button
          v-if="ui.searchQuery"
          class="shrink-0 text-base-content/50 hover:text-base-content"
          @click="clearQuery"
        >
          <X :size="14" />
        </button>
      </div>

      <AppSearchResults
        v-if="ui.searchMode === 'global'"
        :groups="groups"
        :flat-items="flatItems"
        :active-index="activeIndex"
        @activate="activeIndex = $event"
        @run="runItem"
      />
    </div>
  </div>
</template>
