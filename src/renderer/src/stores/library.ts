import { defineStore } from 'pinia';
import { ref, shallowRef, computed, triggerRef } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';
import { isUnderPath } from '@renderer/utils/path';
import { useLibraryDerivations } from './library-derivations';
import { useLibraryPlaylists } from './library-playlists';
import { useLibraryLoad } from './library-load';

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

  let subscribedToLibraryUpdates = false;

  // Refresh the track list when the main process re-scanned a library folder
  // (e.g. after a finished download landed inside a library folder).
  function subscribeLibraryUpdates() {
    if (subscribedToLibraryUpdates) return;
    subscribedToLibraryUpdates = true;
    window.api?.on('library:updated', () => {
      if (isLoaded.value) void scheduleLoadTracksAsync();
      void reloadPlaylists();
    });
  }

  // Re-read playlists from disk (they can be changed by the auto channel
  // playlist feature in the main process after a download).
  async function reloadPlaylists() {
    try {
      const list = (await window.api?.invoke('playlist:loadAll')) as Playlist[] | undefined;
      if (list) playlists.value = list;
    } catch {
      /* playlists unavailable */
    }
  }

  async function addFolder(folderPath: string) {
    if (folders.value.includes(folderPath)) return;
    folders.value.push(folderPath);
    await window.api?.invoke('library:saveFolders', [...folders.value]);
  }

  async function removeFolder(folderPath: string) {
    folders.value = folders.value.filter((f) => f !== folderPath);
    await window.api?.invoke('library:saveFolders', [...folders.value]);
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
    deletePlaylist,
    search,
    refreshDerived
  };
});
