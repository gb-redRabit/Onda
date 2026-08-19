import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { IpcSavedData, IpcSavedPlaylist, IpcSavedStream } from '@shared/types/ipc';
import type { YouTubeResolveKind, YouTubeVideo, YouTubeResolvedItem } from '@renderer/types/youtube';

interface SavedTrackInput {
  id: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
}

export const useSavedStore = defineStore('saved', () => {
  const tracks = ref<IpcSavedStream[]>([]);
  const playlists = ref<IpcSavedPlaylist[]>([]);
  let loaded = false;
  let loading: Promise<void> | null = null;

  function ensureLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const data = (await window.api?.savedLoad()) as IpcSavedData | undefined;
        if (data) {
          tracks.value = data.tracks ?? [];
          playlists.value = data.playlists ?? [];
        }
      } finally {
        loaded = true;
      }
    })();
    return loading;
  }

  function toSavedTrack(video: SavedTrackInput | YouTubeVideo | YouTubeResolvedItem): IpcSavedStream {
    return {
      id: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      channelTitle: video.channelTitle,
      channelId: video.channelId,
      duration: video.duration,
      savedAt: Date.now()
    };
  }

  async function toggleTrack(video: SavedTrackInput | YouTubeVideo | YouTubeResolvedItem) {
    await ensureLoaded();
    if (tracks.value.some((t) => t.id === video.id)) {
      await removeTrack(video.id);
      return false;
    }
    const entry = toSavedTrack(video);
    const ok = (await window.api?.savedSaveTrack(entry)) ?? false;
    if (ok) tracks.value = [...tracks.value.filter((t) => t.id !== video.id), entry];
    return ok;
  }

  async function removeTrack(id: string) {
    await ensureLoaded();
    const before = tracks.value.length;
    tracks.value = tracks.value.filter((t) => t.id !== id);
    if (tracks.value.length !== before) await window.api?.savedRemoveTrack(id);
  }

  function isTrackSaved(id: string): boolean {
    return tracks.value.some((t) => t.id === id);
  }

  function playlistIdFor(kind: YouTubeResolveKind, url: string): string {
    if (kind === 'channel') return url;
    const match = url.match(/[?&]list=([\w-]+)/);
    return match ? match[1]! : url;
  }

  async function savePlaylist(input: {
    kind: YouTubeResolveKind;
    url: string;
    title: string;
    thumbnail?: string;
    channelTitle?: string;
    totalItems?: number;
    items?: SavedTrackInput[];
  }) {
    await ensureLoaded();
    const id = playlistIdFor(input.kind, input.url);
    const entry: IpcSavedPlaylist = {
      id,
      kind: input.kind === 'channel' ? 'channel' : 'playlist',
      url: input.url,
      title: input.title,
      thumbnail: input.thumbnail,
      channelTitle: input.channelTitle,
      totalItems: input.totalItems,
      items: input.items?.map(toSavedTrack),
      savedAt: Date.now()
    };
    const ok = (await window.api?.savedSavePlaylist(entry)) ?? false;
    if (ok) playlists.value = [...playlists.value.filter((p) => p.id !== id), entry];
    return ok;
  }

  // Replaces the stored item list of a saved playlist (background sync result).
  async function updatePlaylistItems(
    id: string,
    items: IpcSavedStream[],
    totalItems?: number | null
  ) {
    await ensureLoaded();
    const existing = playlists.value.find((p) => p.id === id);
    if (!existing) return;
    const entry: IpcSavedPlaylist = {
      ...existing,
      items,
      totalItems: totalItems != null ? totalItems : existing.totalItems,
      savedAt: Date.now()
    };
    const ok = (await window.api?.savedSavePlaylist(entry)) ?? false;
    if (ok) playlists.value = playlists.value.map((p) => (p.id === id ? entry : p));
  }

  async function removePlaylist(id: string) {
    await ensureLoaded();
    const before = playlists.value.length;
    playlists.value = playlists.value.filter((p) => p.id !== id);
    if (playlists.value.length !== before) await window.api?.savedRemovePlaylist(id);
  }

  function isPlaylistSaved(id: string): boolean {
    return playlists.value.some((p) => p.id === id);
  }

  return {
    tracks,
    playlists,
    ensureLoaded,
    toggleTrack,
    removeTrack,
    isTrackSaved,
    savePlaylist,
    updatePlaylistItems,
    removePlaylist,
    isPlaylistSaved
  };
});