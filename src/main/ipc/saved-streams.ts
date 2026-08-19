import { app, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import type { IpcSavedData, IpcSavedPlaylist, IpcSavedStream } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';

const SCHEMA_VERSION = 1;
const MAX_TRACKS = 500;
const MAX_PLAYLISTS = 100;
const MAX_PLAYLIST_ITEMS = 500;

interface PersistedSaved {
  version: number;
  tracks: IpcSavedStream[];
  playlists: IpcSavedPlaylist[];
}

export function savedFilePath(): string {
  return join(app.getPath('userData'), 'saved-streams.json');
}

function isSavedStream(v: unknown): v is IpcSavedStream {
  return (
    !!v &&
    typeof (v as IpcSavedStream).id === 'string' &&
    (v as IpcSavedStream).id.length > 0 &&
    typeof (v as IpcSavedStream).title === 'string'
  );
}

// Sanitizes the stored item list of a playlist: drops malformed entries and
// caps the count so a huge playlist can never bloat the persisted file.
function sanitizePlaylistItems(items: unknown): IpcSavedStream[] {
  if (!Array.isArray(items)) return [];
  return items.filter(isSavedStream).slice(0, MAX_PLAYLIST_ITEMS);
}

// Best-effort load with sanitization: corrupt files or malformed entries are
// dropped so the view can never crash on bad persisted data.
export async function loadSavedData(filePath: string): Promise<IpcSavedData> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedSaved>;
    if (!parsed || parsed.version !== SCHEMA_VERSION) {
      return { tracks: [], playlists: [] };
    }
    const tracks = Array.isArray(parsed.tracks) ? parsed.tracks.filter(isSavedStream) : [];
    const playlists = Array.isArray(parsed.playlists)
      ? parsed.playlists.filter(
          (p): p is IpcSavedPlaylist =>
            !!p &&
            typeof p.id === 'string' &&
            p.id.length > 0 &&
            typeof p.url === 'string' &&
            p.url.length > 0 &&
            (p.kind === 'playlist' || p.kind === 'channel') &&
            typeof p.title === 'string'
        )
      : [];
    return {
      tracks: tracks.slice(0, MAX_TRACKS),
      playlists: playlists.slice(0, MAX_PLAYLISTS).map((p) => ({
        ...p,
        items: sanitizePlaylistItems(p.items)
      }))
    };
  } catch {
    return { tracks: [], playlists: [] };
  }
}

let writeChain: Promise<void> = Promise.resolve();

// Serializes writes and swaps the file in atomically (temp file + rename) so a
// crash mid-write never leaves a half-written store.
export function persistSaved(filePath: string, data: IpcSavedData): Promise<void> {
  const payload: PersistedSaved = { version: SCHEMA_VERSION, ...data };
  writeChain = writeChain.then(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(payload), 'utf-8');
    await rename(tmp, filePath);
  });
  writeChain = writeChain.catch((e) => {
    logger.warn('saved', 'failed to persist saved streams', e);
  });
  return writeChain;
}

export function registerSavedHandlers(): void {
  let data: IpcSavedData | null = null;
  const filePath = savedFilePath();

  ipcMain.handle('saved:load', async () => {
    if (!data) {
      data = await loadSavedData(filePath);
    }
    return data;
  });

  ipcMain.handle('saved:saveTrack', async (_event, track: IpcSavedStream) => {
    if (!data) data = { tracks: [], playlists: [] };
    if (!track || typeof track.id !== 'string' || !track.id || typeof track.title !== 'string') {
      return false;
    }
    if (!data.tracks.some((t) => t.id === track.id)) {
      data.tracks = [...data.tracks.filter((t) => t.id !== track.id), track].slice(-MAX_TRACKS);
      await persistSaved(filePath, data);
    }
    return true;
  });

  ipcMain.handle('saved:removeTrack', async (_event, id: string) => {
    if (!data) return false;
    const before = data.tracks.length;
    data.tracks = data.tracks.filter((t) => t.id !== id);
    if (data.tracks.length !== before) await persistSaved(filePath, data);
    return true;
  });

  ipcMain.handle('saved:savePlaylist', async (_event, playlist: IpcSavedPlaylist) => {
    if (!data) data = { tracks: [], playlists: [] };
    if (
      !playlist ||
      typeof playlist.id !== 'string' ||
      !playlist.id ||
      typeof playlist.url !== 'string' ||
      !playlist.url ||
      (playlist.kind !== 'playlist' && playlist.kind !== 'channel') ||
      typeof playlist.title !== 'string'
    ) {
      return false;
    }
    // Upsert: the renderer syncs a playlist in the background, so an existing
    // entry is replaced with the updated item list rather than kept stale.
    data.playlists = [
      ...data.playlists.filter((p) => p.id !== playlist.id),
      { ...playlist, items: sanitizePlaylistItems(playlist.items) }
    ].slice(-MAX_PLAYLISTS);
    await persistSaved(filePath, data);
    return true;
  });

  ipcMain.handle('saved:removePlaylist', async (_event, id: string) => {
    if (!data) return false;
    const before = data.playlists.length;
    data.playlists = data.playlists.filter((p) => p.id !== id);
    if (data.playlists.length !== before) await persistSaved(filePath, data);
    return true;
  });
}