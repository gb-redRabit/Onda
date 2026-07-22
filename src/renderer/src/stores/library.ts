import { defineStore } from 'pinia';
import { ref, computed, triggerRef } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';
import { useUIStore } from './ui';

function errMsg(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
}
export const useLibraryStore = defineStore('library', () => {
  const tracks = ref<MediaFile[]>([]);
  const playlists = ref<Playlist[]>([]);
  const folders = ref<string[]>([]);
  const folderTypes = ref<Record<string, 'audio' | 'video' | 'mixed'>>({});
  const isScanning = ref(false);
  const scanProgress = ref({ current: 0, total: 0 });
  const isLoaded = ref(false);
  const isLoading = ref(false);

  const totalCount = computed(() => tracks.value.length);
  const audioCount = computed(() => tracks.value.filter((t) => t.type === 'audio').length);
  const videoCount = computed(() => tracks.value.filter((t) => t.type === 'video').length);
  const audioTracks = computed(() => tracks.value.filter((t) => t.type === 'audio'));
  const videoTracks = computed(() => tracks.value.filter((t) => t.type === 'video'));

  const recentTracks = computed(() => {
    const ts = tracks.value;
    const withPlayed = ts.filter((t) => t.lastPlayed);
    if (withPlayed.length === 0) return [];
    return withPlayed.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)).slice(0, 20);
  });
  const mostPlayed = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    return [...ts].sort((a, b) => b.playCount - a.playCount).slice(0, 20);
  });

  const artists = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    const map = new Map<string, MediaFile[]>();
    for (let i = 0; i < ts.length; i++) {
      const artist = ts[i].metadata?.artist || 'Unknown Artist';
      if (!map.has(artist)) map.set(artist, []);
      map.get(artist)!.push(ts[i]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  const albums = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    const map = new Map<string, MediaFile[]>();
    for (let i = 0; i < ts.length; i++) {
      const album = ts[i].metadata?.album || 'Unknown Album';
      if (!map.has(album)) map.set(album, []);
      map.get(album)!.push(ts[i]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  async function loadFromDisk() {
    isLoading.value = true;
    try {
      const [loadedPlaylists, loadedFolders] = await Promise.all([
        (window.api?.invoke('playlist:loadAll') as Promise<Playlist[] | undefined>).catch(
          () => undefined
        ),
        (window.api?.invoke('library:loadFolders') as Promise<string[] | undefined>).catch(
          () => undefined
        )
      ]);
      if (loadedPlaylists) playlists.value = loadedPlaylists;
      if (loadedFolders) folders.value = loadedFolders;
    } catch {
      // individual catches handle errors
    }
    scheduleLoadTracks();
  }

  let loadTracksScheduled = false;

  function scheduleLoadTracks(): void {
    if (loadTracksScheduled) return;
    loadTracksScheduled = true;
    const doLoad = (): void => {
      loadTracksScheduled = false;
      isLoading.value = false;
      window.api
        ?.invoke('library:loadScanned')
        .then((result: any) => {
          if (result?.files) {
            tracks.value = result.files;
            folderTypes.value = result.folderTypes || {};
          }
          isLoaded.value = true;
        })
        .catch(() => {
          isLoaded.value = true;
        });
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(doLoad, { timeout: 3000 });
    } else {
      setTimeout(doLoad, 100);
    }
  }

  async function scanFolders() {
    if (folders.value.length === 0) return;
    isScanning.value = true;
    scanProgress.value = { current: 0, total: folders.value.length };
    try {
      const result = (await window.api?.invoke('library:scan', [...folders.value])) as {
        count: number;
        folderTypes: Record<string, 'audio' | 'video' | 'mixed'>;
      };
      if (result) {
        folderTypes.value = result.folderTypes;
        scheduleLoadTracks();
      }
    } catch (err) {
      try {
        useUIStore().notify('error', 'Błąd skanowania biblioteki', errMsg(err));
      } catch {
        // store not available
      }
    } finally {
      isScanning.value = false;
    }
  }

  async function savePlaylists() {
    try {
      await window.api?.invoke('playlist:saveAll', JSON.parse(JSON.stringify(playlists.value)));
    } catch {
      // non-fatal
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
    tracks.value = tracks.value.filter((t) => !t.path.startsWith(folderPath));
  }

  function getFolderType(folderPath: string): 'audio' | 'video' | 'mixed' | 'unknown' {
    return folderTypes.value[folderPath] || 'unknown';
  }

  function addTrack(track: MediaFile) {
    const existing = tracks.value.findIndex((t) => t.path === track.path);
    if (existing >= 0) {
      tracks.value[existing] = track;
    } else {
      tracks.value.push(track);
    }
  }

  function removeTrack(path: string) {
    tracks.value = tracks.value.filter((t) => t.path !== path);
  }

  function createPlaylist(name: string, description?: string): Playlist {
    const playlist: Playlist = {
      id: `playlist-${Date.now()}`,
      name,
      description,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    playlists.value.push(playlist);
    savePlaylists();
    return playlist;
  }

  function addToPlaylist(playlistId: string, track: MediaFile) {
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (playlist) {
      if (!playlist.tracks.some((t) => t.path === track.path)) {
        playlist.tracks.push(track);
        playlist.updatedAt = Date.now();
        savePlaylists();
      }
    }
  }

  function removeFromPlaylist(playlistId: string, trackPath: string) {
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (playlist) {
      playlist.tracks = playlist.tracks.filter((t) => t.path !== trackPath);
      playlist.updatedAt = Date.now();
      savePlaylists();
    }
  }

  function deletePlaylist(playlistId: string) {
    playlists.value = playlists.value.filter((p) => p.id !== playlistId);
    savePlaylists();
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

  function refreshDerived() {
    triggerRef(tracks);
  }

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
    audioTracks,
    videoTracks,
    recentTracks,
    mostPlayed,
    artists,
    albums,
    loadFromDisk,
    scanFolders,
    savePlaylists,
    addFolder,
    removeFolder,
    getFolderType,
    addTrack,
    removeTrack,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    search,
    refreshDerived
  };
});
