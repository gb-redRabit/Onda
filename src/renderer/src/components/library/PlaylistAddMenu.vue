<script setup lang="ts">
import { computed, ref } from 'vue';
import { Plus, ListMusic } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import type { MediaFile } from '@renderer/types/media';

// Shared "add to playlist" trigger + popup — was duplicated 1:1 in
// LibraryTrackRow, LibraryTrackCard and AlbumCard (plan 2.2).
const props = withDefaults(
  defineProps<{
    tracks: MediaFile[];
    /** `toggle` shows ✓ and toggles membership; `add` just adds every track. */
    mode?: 'toggle' | 'add';
    iconSize?: number;
    buttonClass?: string;
  }>(),
  { mode: 'toggle', iconSize: 14, buttonClass: '' }
);

const library = useLibraryStore();
const btn = ref<HTMLElement | null>(null);
const open = ref(false);

const popupStyle = computed(() => {
  const el = btn.value;
  if (!el) return {};
  const r = el.getBoundingClientRect();
  const w = 192; // w-48 = 12rem = 192px
  const left = Math.min(r.right - w, window.innerWidth - w - 8);
  const top = r.bottom + 6;
  const maxTop = window.innerHeight - 200 - 8;
  return { left: Math.max(8, left) + 'px', top: Math.min(top, maxTop) + 'px' };
});

function isIn(playlistId: string): boolean {
  const p = library.playlists.find((pl) => pl.id === playlistId);
  if (!p || props.tracks.length === 0) return false;
  return props.tracks.every((tr) => p.tracks.some((t) => t.path === tr.path));
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!btn.value?.contains(target) && !target.closest('.playlist-popup')) open.value = false;
}

function toggleMenu(e: MouseEvent) {
  e.stopPropagation();
  open.value = !open.value;
  if (open.value) document.addEventListener('click', onClickOutside, { once: true });
}

function pick(playlistId: string) {
  if (props.mode === 'add') {
    for (const tr of props.tracks) library.addToPlaylist(playlistId, tr);
  } else {
    const p = library.playlists.find((pl) => pl.id === playlistId);
    if (!p) return;
    for (const tr of props.tracks) {
      if (p.tracks.some((t) => t.path === tr.path)) {
        library.removeFromPlaylist(playlistId, tr.path);
      } else {
        library.addToPlaylist(playlistId, tr);
      }
    }
  }
  open.value = false;
}
</script>

<template>
  <div ref="btn" class="relative">
    <button :class="buttonClass" @click="toggleMenu"><Plus :size="iconSize" /></button>
    <Teleport to="body">
      <div
        v-if="open"
        class="playlist-popup fixed w-48 bg-base-100 border border-base-300 rounded-box shadow-xl py-1 z-50"
        :style="popupStyle"
        @click.stop
      >
        <button
          v-for="p in library.playlists"
          :key="p.id"
          class="fx-noise w-full text-left px-3 py-1.5 text-xs fx-depth rounded-field hover:bg-base-content/10 transition-colors truncate flex items-center gap-2"
          :class="{ 'text-primary': mode === 'toggle' && isIn(p.id) }"
          @click="pick(p.id)"
        >
          <ListMusic :size="12" class="shrink-0" />
          <template v-if="mode === 'toggle'">{{ isIn(p.id) ? '✓ ' : '+ ' }}</template
          >{{ p.name }}
        </button>
        <div
          v-if="library.playlists.length === 0"
          class="px-3 py-1.5 text-xs text-base-content/50 italic"
        >
          {{ $t('common.noPlaylists') }}
        </div>
      </div>
    </Teleport>
  </div>
</template>
