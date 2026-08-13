import { randomUUID } from 'crypto';
import type { MediaFile, Playlist } from '../../renderer/src/types/media';
import { getStore } from '../ipc/cover-cache';
import { broadcastToAllWindows } from '../utils/broadcast';
import { logger } from '../../shared/logger';

function validPlaylists(raw: unknown): Playlist[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is Playlist =>
      !!p &&
      typeof (p as Playlist).id === 'string' &&
      typeof (p as Playlist).name === 'string' &&
      Array.isArray((p as Playlist).tracks)
  );
}

// After a channel download lands in the library, add (or create) an Onda playlist
// named after the YouTube channel so the channel's downloads are browsable as a
// playlist. Deduplicates by file path.
export async function addToChannelPlaylist(channelTitle: string, file: MediaFile): Promise<void> {
  try {
    const store = await getStore();
    const playlists = validPlaylists(store.get('playlists', []));
    let playlist = playlists.find((p) => p.name === channelTitle);
    if (!playlist) {
      playlist = {
        id: `playlist-${randomUUID()}`,
        name: channelTitle,
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      playlists.push(playlist);
    }
    if (!playlist.tracks.some((t) => t.path === file.path)) {
      playlist.tracks.push(file);
      playlist.updatedAt = Date.now();
      store.set('playlists', playlists);
      broadcastToAllWindows('library:updated', { folder: null, added: 1 });
    }
  } catch (e) {
    logger.warn('library', 'addToChannelPlaylist failed', e);
  }
}
