<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { MediaFile } from '@renderer/types/media';
import { useUIStore } from '@renderer/stores/ui';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import {
  Search,
  Music2,
  Film,
  Disc3,
  Settings,
  Home,
  ArrowRight,
  Radio,
  Download,
  Globe,
  Wand2,
  ListMusic,
  X,
  FolderSearch
} from '@lucide/vue';

const { t } = useI18n();

const ui = useUIStore();
const library = useLibraryStore();
const player = usePlayerStore();
const router = useRouter();

const input = ref<HTMLInputElement | null>(null);
const activeIndex = ref(0);

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

type FlatItem =
  | { type: 'track'; track: MediaFile; label: string; sub: string }
  | { type: 'playlist'; label: string; sub: number; action: () => void }
  | { type: 'action'; label: string; icon: Component; action: () => void };

interface Group {
  key: string;
  label: string;
  items: FlatItem[];
}

function include(q: string, ...parts: string[]): boolean {
  return !q || parts.some((p) => p.toLowerCase().includes(q));
}

const groups = computed<Group[]>(() => {
  const q = ui.searchQuery.toLowerCase().trim();
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
  const matchedActions = actions.value.filter((a) => include(q, a.label));
  const result: Group[] = [];
  if (tracks.length)
    result.push({ key: 'tracks', label: t('cmdPalette.tracks'), items: tracks });
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
  return result;
});

const flatItems = computed(() => {
  const items: FlatItem[] = [];
  groups.value.forEach((g) => items.push(...g.items));
  return items;
});

function indexOf(item: FlatItem): number {
  return flatItems.value.indexOf(item);
}

function isActive(item: FlatItem): boolean {
  return indexOf(item) === activeIndex.value;
}

function setActive(item: FlatItem) {
  activeIndex.value = indexOf(item);
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
      item.action();
      ui.closeSearch();
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
            ui.searchMode === 'view'
              ? $t('menu.viewSearch')
              : $t('cmdPalette.placeholder')
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

      <div v-if="ui.searchMode === 'global'" class="max-h-80 overflow-y-auto py-1">
        <template v-for="group in groups" :key="group.key">
          <div
            class="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-base-content/40"
          >
            {{ group.label }}
          </div>
          <template v-for="item in group.items" :key="item.label">
            <div
              v-if="item.type === 'track'"
              class="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors"
              :class="isActive(item) ? 'bg-primary/10 text-primary' : 'hover:bg-base-content/10'"
              @click="
                player.setTrack(item.track);
                player.play();
                ui.closeSearch();
              "
              @mouseenter="setActive(item)"
            >
              <component
                :is="item.track.type === 'video' ? Film : Music2"
                :size="14"
                class="shrink-0 text-base-content/50"
              />
              <span class="truncate flex-1">{{ item.label }}</span>
              <span class="text-[11px] text-base-content/50 shrink-0 truncate max-w-30">{{
                item.sub
              }}</span>
            </div>
            <div
              v-else
              class="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors"
              :class="isActive(item) ? 'bg-primary/10 text-primary' : 'hover:bg-base-content/10'"
              @click="
                item.action();
                ui.closeSearch();
              "
              @mouseenter="setActive(item)"
            >
              <component
                :is="item.type === 'playlist' ? ListMusic : item.icon"
                :size="14"
                class="shrink-0 text-base-content/50"
              />
              <span>{{ item.label }}</span>
              <span
                v-if="item.type === 'playlist'"
                class="text-[11px] text-base-content/50 shrink-0"
                >{{ item.sub }}</span
              >
              <ArrowRight :size="12" class="ml-auto text-base-content/50" />
            </div>
          </template>
        </template>
        <div
          v-if="flatItems.length === 0"
          class="px-3 py-4 text-center text-xs text-base-content/50 italic"
        >
          {{ $t('cmdPalette.empty') }}
        </div>
      </div>
    </div>
  </div>
</template>