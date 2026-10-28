import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile } from 'fs/promises';
import { basename } from 'path';
import type { Playlist } from '../../../shared/types/media';
import type { SmartPlaylist } from '../../../shared/types/smart-playlist';
import { logger } from '../../../shared/logger';
import { getStore } from '../cover/cover-cache';

function isValidPlaylistArray(v: unknown): v is Playlist[] {
  return (
    Array.isArray(v) &&
    v.every(
      (item) =>
        item && typeof item === 'object' && 'id' in item && 'name' in item && 'tracks' in item
    )
  );
}

function isValidSmartPlaylistArray(v: unknown): v is SmartPlaylist[] {
  return (
    Array.isArray(v) &&
    v.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as SmartPlaylist).id === 'string' &&
        typeof (item as SmartPlaylist).name === 'string' &&
        ((item as SmartPlaylist).match === 'all' || (item as SmartPlaylist).match === 'any') &&
        Array.isArray((item as SmartPlaylist).rules)
    )
  );
}

export function registerPlaylistHandlers(): void {
  ipcMain.handle('playlist:loadAll', async (): Promise<Playlist[]> => {
    try {
      const store = await getStore();
      const raw = store.get('playlists', []);
      if (isValidPlaylistArray(raw)) return raw;
      return [];
    } catch (err) {
      logger.error('library', 'loadPlaylists failed', err);
      return [];
    }
  });

  ipcMain.handle('playlist:saveAll', async (_event, playlists: Playlist[]): Promise<void> => {
    try {
      const store = await getStore();
      store.set('playlists', playlists);
    } catch (err) {
      logger.error('library', 'savePlaylists failed', err);
    }
  });

  ipcMain.handle('smartPlaylists:loadAll', async (): Promise<SmartPlaylist[]> => {
    try {
      const store = await getStore();
      const raw = store.get('smartPlaylists', []);
      return isValidSmartPlaylistArray(raw) ? raw : [];
    } catch (err) {
      logger.error('library', 'loadSmartPlaylists failed', err);
      return [];
    }
  });

  ipcMain.handle(
    'smartPlaylists:saveAll',
    async (_event, playlists: SmartPlaylist[]): Promise<void> => {
      if (!isValidSmartPlaylistArray(playlists)) return;
      try {
        const store = await getStore();
        store.set('smartPlaylists', playlists);
      } catch (err) {
        logger.error('library', 'saveSmartPlaylists failed', err);
      }
    }
  );

  // Eksportuje playlistę biblioteki jako plik M3U. Przez IPC nie przechodzą żadne sekrety —
  // wpisy utworów to zwykłe ścieżki plików rozwiązywane przez proces main.
  ipcMain.handle(
    'playlist:export',
    async (
      event,
      input: { id: string; name: string; tracks: string[] }
    ): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false, error: 'No window' };
        if (!input || typeof input.name !== 'string' || !Array.isArray(input.tracks)) {
          return { success: false, error: 'Invalid playlist payload' };
        }
        const sanitizedTracks = input.tracks
          .filter((t): t is string => typeof t === 'string' && t.length > 0)
          .slice(0, 10000);
        const safeName =
          (input.name || 'playlist').replace(/[<>:"/\\|?*]/g, '_').trim() || 'playlist';
        const result = await dialog.showSaveDialog(win, {
          title: 'Export playlist',
          defaultPath: `${safeName}.m3u`,
          filters: [
            { name: 'M3U Playlist', extensions: ['m3u'] },
            { name: 'M3U8 Playlist', extensions: ['m3u8'] }
          ]
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        const header = ['#EXTM3U'];
        for (const p of sanitizedTracks) {
          header.push(`#EXTINF:-1,${basename(p)}`);
          header.push(p);
        }
        await writeFile(result.filePath, header.join('\r\n') + '\r\n', 'utf-8');
        return { success: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('library', 'playlist:export failed', e);
        return { success: false, error: msg };
      }
    }
  );
}
