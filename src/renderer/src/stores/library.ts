import { defineStore } from 'pinia';
import { ref, shallowRef, computed, triggerRef } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { isUnderPath } from '@renderer/utils/path';
import { useLibraryDerivations } from './library-derivations';
import { useLibraryPlaylists } from './library-playlists';
import { useLibraryLoad } from './library-load';
import { createLibraryWatch } from './library-watch';

export const useLibraryStore = defineStore('library', () => {
  const tracks = shallowRef<MediaFile[]>([]);
  const folders = ref<string[]>([]);
  const folderTypes = ref<Record<string, 'audio' | 'video' | 'image' | 'mixed'>>({});
  const isScanning = ref(false);
  const scanProgress = ref({ current: 0, total: 0 });
  const isLoaded = ref(false);
  const isLoading = ref(false);

  const {
    playlists,
    savePlaylists,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylistTrack,
    renamePlaylist,
    deletePlaylist
  } = useLibraryPlaylists();
  const {
    audioCount,
    videoCount,
    imageCount,
    audioTracks,
    videoTracks,
    imageTracks,
    recentTracks,
    mostPlayed,
    artists,
    albums,
    invalidateDerivedCache
  } = useLibraryDerivations(tracks);
  const { loadFromDisk, scheduleLoadTracksAsync, scanFolders, cancelScan } = useLibraryLoad({
    tracks,
    folders,
    folderTypes,
    playlists,
    isLoaded,
    isLoading,
    isScanning,
    scanProgress
  });

  const totalCount = computed(() => tracks.value.length);
  // O(1) membership test for isLibraryFolder (was folders.some() + per-call
  // regex replace in every explorer row — plan 1.10).
  const normalizedFolders = computed(
    () => new Set(folders.value.map((f) => f.replace(/[\\/]$/, '')))
  );

  const { subscribeLibraryUpdates } = createLibraryWatch({
    isLoaded,
    tracks,
    folderTypes,
    playlists,
    scheduleLoadTracksAsync,
    invalidateDerivedCache
  });

  async function addFolder(folderPath: string) {
    if (folders.value.includes(folderPath)) return;
    folders.value.push(folderPath);
    try {
      await window.api?.invoke('library:saveFolders', [...folders.value]);
    } catch {
      // Revert local state if persist failed
      folders.value = folders.value.filter((f) => f !== folderPath);
    }
  }

  async function removeFolder(folderPath: string) {
    const prevFolders = [...folders.value];
    folders.value = folders.value.filter((f) => f !== folderPath);
    try {
      await window.api?.invoke('library:saveFolders', [...folders.value]);
    } catch {
      // Revert local state if persist failed
      folders.value = prevFolders;
      return;
    }
    const newTypes = { ...folderTypes.value };
    delete newTypes[folderPath];
    folderTypes.value = newTypes;
    tracks.value = tracks.value.filter((t) => !isUnderPath(t.path, folderPath));
    invalidateDerivedCache();
  }

  function getFolderType(folderPath: string): 'audio' | 'video' | 'image' | 'mixed' | 'unknown' {
    return folderTypes.value[folderPath] || 'unknown';
  }

  function addTrack(track: MediaFile) {
    const existing = tracks.value.findIndex((t) => t.path === track.path);
    if (existing >= 0) {
      tracks.value[existing] = track;
    } else {
      tracks.value.push(track);
    }
    triggerRef(tracks);
    invalidateDerivedCache();
  }

  function removeTrack(path: string) {
    tracks.value = tracks.value.filter((t) => t.path !== path);
  }

  function search(query: string): MediaFile[] {
    const q = query.toLowerCase();
    return tracks.value.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.metadata?.title?.toLowerCase().includes(q) ||
        t.metadata?.artist?.toLowerCase().includes(q) ||
        t.metadata?.album?.toLowerCase().includes(q)
    );
  }

  function updateTrack(path: string, updater: (track: MediaFile) => void, metadataChanged = false) {
    const idx = tracks.value.findIndex((t) => t.path === path);
    if (idx >= 0) {
      updater(tracks.value[idx]);
      triggerRef(tracks);
      if (metadataChanged) invalidateDerivedCache();
    }
  }

  function refreshDerived() {
    triggerRef(tracks);
    invalidateDerivedCache();
  }

  function clearRecent(path: string): void {
    updateTrack(path, (t) => {
      t.lastPlayed = undefined;
    });
    const t = tracks.value.find((x) => x.path === path);
    if (t) {
      window.api?.invoke('library:updateStats', [{ path, playCount: t.playCount, lastPlayed: 0 }]);
    }
  }

  subscribeLibraryUpdates();

  return {
    tracks,
    playlists,
    folders,
    folderTypes,
    isScanning,
    scanProgress,
    isLoaded,
    isLoading,
    totalCount,
    normalizedFolders,
    audioCount,
    videoCount,
    imageCount,
    audioTracks,
    videoTracks,
    imageTracks,
    recentTracks,
    mostPlayed,
    artists,
    albums,
    loadFromDisk,
    scheduleLoadTracksAsync,
    scanFolders,
    cancelScan,
    savePlaylists,
    addFolder,
    removeFolder,
    getFolderType,
    addTrack,
    removeTrack,
    updateTrack,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylistTrack,
    renamePlaylist,
    deletePlaylist,
    search,
    refreshDerived,
    clearRecent
  };
});
