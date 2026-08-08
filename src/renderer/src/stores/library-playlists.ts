import { ref } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';

const SAVE_DEBOUNCE_MS = 500;

export function useLibraryPlaylists() {
  const playlists = ref<Playlist[]>([]);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function savePlaylists() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      await window.api?.invoke('playlist:saveAll', JSON.parse(JSON.stringify(playlists.value)));
    } catch {
      // non-fatal
    }
  }

  // Rapid mutations (drag reorder, tag edits) collapse into a single write.
  function scheduleSave() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      savePlaylists();
    }, SAVE_DEBOUNCE_MS);
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
    scheduleSave();
    return playlist;
  }

  function addToPlaylist(playlistId: string, track: MediaFile) {
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (playlist) {
      if (!playlist.tracks.some((t) => t.path === track.path)) {
        playlist.tracks.push(track);
        playlist.updatedAt = Date.now();
        scheduleSave();
      }
    }
  }

  function removeFromPlaylist(playlistId: string, trackPath: string) {
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (playlist) {
      playlist.tracks = playlist.tracks.filter((t) => t.path !== trackPath);
      playlist.updatedAt = Date.now();
      scheduleSave();
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
    scheduleSave();
  }

  function deletePlaylist(playlistId: string) {
    playlists.value = playlists.value.filter((p) => p.id !== playlistId);
    scheduleSave();
  }

  return {
    playlists,
    savePlaylists,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylistTrack,
    deletePlaylist
  };
}
