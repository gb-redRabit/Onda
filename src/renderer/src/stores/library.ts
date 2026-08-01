import { defineStore } from 'pinia';
import { ref, shallowRef, computed, triggerRef } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';
import { errMsg } from '@shared/helpers';
import { useUIStore } from './ui';

export function isUnderPath(p: string, folder: string): boolean {
  return p === folder || p.startsWith(folder + '/') || p.startsWith(folder + '\\');
}

function topN<T>(items: T[], n: number, score: (t: T) => number): T[] {
  const out: T[] = [];
  for (const item of items) {
    const s = score(item);
    if (out.length < n) {
      let i = out.length;
      out.push(item);
      while (i > 0 && score(out[i - 1]) < s) {
        out[i] = out[i - 1];
        i--;
      }
      out[i] = item;
    } else if (s > score(out[out.length - 1])) {
      let i = out.length - 1;
      while (i > 0 && score(out[i - 1]) < s) {
        out[i] = out[i - 1];
        i--;
      }
      out[i] = item;
    }
  }
  return out;
}

export const useLibraryStore = defineStore('library', () => {
  const tracks = shallowRef<MediaFile[]>([]);
  const playlists = ref<Playlist[]>([]);
  const folders = ref<string[]>([]);
  const folderTypes = ref<Record<string, 'audio' | 'video' | 'mixed'>>({});
  const isScanning = ref(false);
  const scanProgress = ref({ current: 0, total: 0 });
  const isLoaded = ref(false);
  const isLoading = ref(false);

  const totalCount = computed(() => tracks.value.length);

  const trackStats = computed(() => {
    let audio = 0,
      video = 0,
      image = 0;
    const audioArr: MediaFile[] = [];
    const videoArr: MediaFile[] = [];
    const imageArr: MediaFile[] = [];
    const ts = tracks.value;
    for (let i = 0; i < ts.length; i++) {
      if (ts[i].type === 'audio') {
        audio++;
        audioArr.push(ts[i]);
      } else if (ts[i].type === 'video') {
        video++;
        videoArr.push(ts[i]);
      } else if (ts[i].type === 'image') {
        image++;
        imageArr.push(ts[i]);
      }
    }
    return { audio, video, image, audioArr, videoArr, imageArr };
  });

  const audioCount = computed(() => trackStats.value.audio);
  const videoCount = computed(() => trackStats.value.video);
  const imageCount = computed(() => trackStats.value.image);
  const audioTracks = computed(() => trackStats.value.audioArr);
  const videoTracks = computed(() => trackStats.value.videoArr);
  const imageTracks = computed(() => trackStats.value.imageArr);

  const recentTracks = computed(() => {
    const ts = tracks.value;
    const withPlayed = ts.filter((t) => t.lastPlayed);
    if (withPlayed.length === 0) return [];
    return topN(withPlayed, 20, (t) => t.lastPlayed || 0);
  });
  const mostPlayed = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    return topN(ts, 20, (t) => t.playCount);
  });

  let lastTracksHash = 0;
  let cachedArtists: Array<[string, MediaFile[]]> = [];
  let cachedAlbums: Array<[string, MediaFile[]]> = [];

  function invalidateDerivedCache() {
    lastTracksHash = 0;
    cachedArtists = [];
    cachedAlbums = [];
  }

  function hashTracks(tracks: MediaFile[]): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < tracks.length; i++) {
      const p = tracks[i].path;
      for (let j = 0; j < p.length; j++) {
        h ^= p.charCodeAt(j);
        h = (h * 0x01000193) >>> 0;
      }
    }
    return h;
  }

  const artists = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    const h = hashTracks(ts);
    if (h === lastTracksHash && cachedArtists.length) return cachedArtists;
    const map = new Map<string, MediaFile[]>();
    for (let i = 0; i < ts.length; i++) {
      const artist = ts[i].metadata?.artist || 'Unknown Artist';
      if (!map.has(artist)) map.set(artist, []);
      map.get(artist)!.push(ts[i]);
    }
    cachedArtists = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    lastTracksHash = h;
    return cachedArtists;
  });

  const albums = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    const h = hashTracks(ts);
    if (h === lastTracksHash && cachedAlbums.length) return cachedAlbums;
    const map = new Map<string, MediaFile[]>();
    for (let i = 0; i < ts.length; i++) {
      const album = ts[i].metadata?.album || 'Unknown Album';
      if (!map.has(album)) map.set(album, []);
      map.get(album)!.push(ts[i]);
    }
    cachedAlbums = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    lastTracksHash = h;
    return cachedAlbums;
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
    await scheduleLoadTracksAsync();
  }

  let loadTracksScheduled = false;
  let loadTracksResolve: (() => void)[] = [];

  function scheduleLoadTracks(): void {
    if (loadTracksScheduled) return;
    loadTracksScheduled = true;
    const doLoad = (): void => {
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
        })
        .finally(() => {
          loadTracksScheduled = false;
          const res = loadTracksResolve;
          loadTracksResolve = [];
          res.forEach((r) => r());
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
    tracks.value = tracks.value.filter((t) => !isUnderPath(t.path, folderPath));
    invalidateDerivedCache();
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
      id: `playlist-${crypto.randomUUID()}`,
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

  function reorderPlaylistTrack(playlistId: string, fromIdx: number, toIdx: number) {
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (!playlist) return;
    if (fromIdx < 0 || fromIdx >= playlist.tracks.length) return;
    if (toIdx < 0 || toIdx >= playlist.tracks.length) return;
    if (fromIdx === toIdx) return;
    const [track] = playlist.tracks.splice(fromIdx, 1);
    playlist.tracks.splice(toIdx, 0, track);
    playlist.updatedAt = Date.now();
    savePlaylists();
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

  function scheduleLoadTracksAsync(): Promise<void> {
    return new Promise((resolve) => {
      if (!loadTracksScheduled) scheduleLoadTracks();
      loadTracksResolve.push(resolve);
      setTimeout(resolve, 5000);
    });
  }

  function updateTrack(path: string, updater: (track: MediaFile) => void) {
    const idx = tracks.value.findIndex((t) => t.path === path);
    if (idx >= 0) {
      updater(tracks.value[idx]);
      triggerRef(tracks);
      invalidateDerivedCache();
    }
  }

  function refreshDerived() {
    triggerRef(tracks);
    invalidateDerivedCache();
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
