<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Home,
  Disc3,
  FolderOpen,
  Tv2,
  Download,
  Settings,
  ChevronLeft,
  ChevronRight,
  ListMusic,
  Music2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight as ChevronRightSmall
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const player = usePlayerStore();
const library = useLibraryStore();
const ui = useUIStore();
const settings = useSettingsStore();
const collapsed = ref(settings.appearance.sidebarCollapsed);
const width = ref(220);
const isResizing = ref(false);
const playlistsExpanded = ref(true);
const albumsExpanded = ref(true);
const newPlaylistName = ref('');
const isCreatingPlaylist = ref(false);
const dragOverPlaylistId = ref<string | null>(null);

watch(collapsed, (val) => {
  settings.updateAppearance({ sidebarCollapsed: val });
});
watch(
  () => settings.appearance.sidebarCollapsed,
  (val) => {
    collapsed.value = val;
  }
);

const navItems = computed(() => [
  { label: t('nav.home'), icon: Home, route: '/' },
  { label: t('nav.library'), icon: Disc3, route: '/library' },
  { label: t('nav.explorer'), icon: FolderOpen, route: '/explorer' },
  { label: t('nav.youtube'), icon: Tv2, route: '/youtube' },
  { label: t('nav.downloads'), icon: Download, route: '/downloads' }
]);

function onResizeStart(e: MouseEvent) {
  isResizing.value = true;
  const startX = e.clientX;
  const startW = width.value;

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - startX;
    width.value = Math.max(160, Math.min(400, startW + delta));
  }
  function onUp() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function createPlaylist() {
  const name = newPlaylistName.value.trim();
  if (!name) return;
  library.createPlaylist(name);
  newPlaylistName.value = '';
  isCreatingPlaylist.value = false;
}

function onPlaylistDrop(e: DragEvent, playlistId: string) {
  const raw = e.dataTransfer?.getData('text/plain');
  if (!raw) return;
  try {
    const { paths } = JSON.parse(raw);
    if (!Array.isArray(paths)) return;
    const playlist = library.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    paths.forEach((path: string) => {
      const track = library.tracks.find((t) => t.path === path);
      if (track) library.addToPlaylist(playlistId, track);
    });
    dragOverPlaylistId.value = null;
    ui.notify('success', t('common.addToPlaylist'));
  } catch {
    // not our data format
  }
}

function playPlaylist(playlistId: string) {
  const playlist = library.playlists.find((p) => p.id === playlistId);
  if (playlist && playlist.tracks.length > 0) {
    player.clearQueue();
    if (playlist.tracks.length > 1) player.addToQueueMultiple(playlist.tracks.slice(1));
    player.setTrack(playlist.tracks[0]);
    player.play();
  }
}
</script>

<template>
  <div class="relative shrink-0 h-full self-stretch">
    <aside
      class="bg-bg-surface border-r border-border-default flex flex-col overflow-hidden transition-[width] duration-150 h-full"
      :style="{ width: (collapsed ? 56 : width) + 'px' }"
    >
      <nav class="flex-1 p-2 space-y-1 overflow-y-auto">
        <button
          v-for="item in navItems"
          :key="item.label"
          class="w-full flex items-center justify-center gap-3 p-3 rounded-xl text-sm font-medium transition-all"
          :class="
            route.path === item.route
              ? 'bg-accent-base text-white shadow-lg shadow-accent-base/25'
              : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'
          "
          @click="router.push(item.route)"
        >
          <component :is="item.icon" :size="18" class="shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </button>

        <!-- playlists section -->
        <template v-if="!collapsed">
          <div v-if="settings.appearance.showPlaylists" class="pt-3">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-fg-faint uppercase tracking-wider hover:text-fg-muted transition-colors"
              @click="playlistsExpanded = !playlistsExpanded"
            >
              <ChevronDown v-if="playlistsExpanded" :size="12" />
              <ChevronRightSmall v-else :size="12" />
              <span>{{ $t('library.playlists') }}</span>
              <span class="ml-auto text-fg-faint/60">{{ library.playlists.length }}</span>
            </button>

            <div v-if="playlistsExpanded" class="mt-1 space-y-0.5">
              <div
                v-for="playlist in library.playlists"
                :key="playlist.id"
                class="group flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors cursor-pointer"
                :class="{
                  'ring-1 ring-accent-base/50 bg-accent-ghost': dragOverPlaylistId === playlist.id
                }"
                @click="playPlaylist(playlist.id)"
                @dragover.prevent="dragOverPlaylistId = playlist.id"
                @dragleave="dragOverPlaylistId = null"
                @drop.prevent="onPlaylistDrop($event, playlist.id)"
              >
                <ListMusic :size="13" class="shrink-0 text-accent-base/70" />
                <span class="truncate flex-1">{{ playlist.name }}</span>
                <span class="text-[10px] text-fg-faint/50">{{ playlist.tracks.length }}</span>
                <button
                  class="p-0.5 rounded opacity-0 group-hover:opacity-100 text-fg-faint hover:text-red-base transition-all"
                  @click.stop="library.deletePlaylist(playlist.id)"
                >
                  <Trash2 :size="10" />
                </button>
              </div>

              <!-- create playlist -->
              <div v-if="isCreatingPlaylist" class="px-2 py-1">
                <input
                  v-model="newPlaylistName"
                  :placeholder="$t('library.playlistName')"
                  class="w-full px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-base placeholder:text-fg-faint/50 focus:outline-none focus:ring-1 focus:ring-accent-base"
                  autofocus
                  @keydown.enter="createPlaylist"
                  @keydown.escape="isCreatingPlaylist = false"
                />
              </div>
              <button
                v-else
                class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-fg-faint hover:bg-bg-hover hover:text-fg-muted transition-colors"
                @click="isCreatingPlaylist = true"
              >
                <Plus :size="13" class="shrink-0" />
                <span>{{ $t('library.newPlaylist') }}</span>
              </button>
            </div>
          </div>

          <!-- albums section -->
          <div v-if="settings.appearance.showAlbums" class="pt-1">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-fg-faint uppercase tracking-wider hover:text-fg-muted transition-colors"
              @click="albumsExpanded = !albumsExpanded"
            >
              <ChevronDown v-if="albumsExpanded" :size="12" />
              <ChevronRightSmall v-else :size="12" />
              <span>{{ $t('library.albums') }}</span>
              <span class="ml-auto text-fg-faint/60">{{ library.albums.length }}</span>
            </button>
            <div v-if="albumsExpanded" class="mt-1 space-y-0.5">
              <div
                v-for="[album, tracks] in library.albums"
                :key="album"
                class="group flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors cursor-pointer"
                @click="router.push('/library?album=' + encodeURIComponent(album))"
              >
                <Disc3 :size="13" class="shrink-0 text-accent-base/70" />
                <span class="truncate flex-1">{{ album }}</span>
                <span class="text-[10px] text-fg-faint/50">{{ tracks.length }}</span>
              </div>
            </div>
          </div>
        </template>
      </nav>

      <div
        v-if="!collapsed && player.queueLength > 0"
        class="mx-2 mb-1 p-3 rounded-xl bg-bg-overlay border border-border-default"
      >
        <div
          class="flex items-center gap-2 text-[11px] text-fg-faint mb-2 font-medium uppercase tracking-wider"
        >
          <ListMusic :size="12" />
          <span>{{ $t('nav.queue') }}</span>
          <span class="ml-auto text-fg-muted">{{ player.queueLength }}</span>
        </div>
        <div class="space-y-0.5 max-h-28 overflow-auto">
          <div
            v-for="(track, i) in player.displayQueue.slice(0, 5)"
            :key="i"
            class="flex items-center gap-2 text-xs text-fg-muted truncate px-2 py-1.5 rounded-lg hover:bg-bg-hover hover:text-fg-base transition-colors"
          >
            <Music2 :size="11" class="shrink-0 text-accent-base" />
            <span class="truncate">{{ track.metadata?.title || track.name }}</span>
          </div>
        </div>
      </div>

      <div class="p-2 border-t border-border-default space-y-1">
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
          :class="
            route.path === '/settings'
              ? 'bg-accent-base text-white shadow-lg shadow-accent-base/25'
              : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'
          "
          @click="router.push('/settings')"
        >
          <Settings :size="18" class="shrink-0" />
          <span v-if="!collapsed">{{ $t('nav.settings') }}</span>
        </button>
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-fg-faint hover:bg-bg-hover hover:text-fg-muted transition-colors"
          @click="collapsed = !collapsed"
        >
          <ChevronRight v-if="collapsed" :size="18" class="shrink-0" />
          <ChevronLeft v-else :size="18" class="shrink-0" />
          <span v-if="!collapsed">{{ $t('nav.collapse') }}</span>
        </button>
      </div>
    </aside>

    <!-- resize handle -->
    <div
      v-if="!collapsed"
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent-base/40 transition-colors z-10"
      :class="{ 'bg-accent-base/40': isResizing }"
      @mousedown.prevent="onResizeStart"
    />
  </div>
</template>
