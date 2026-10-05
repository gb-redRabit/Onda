import { ipcMain } from 'electron';
import { classifyYtDlpError } from '../../downloads/error-classifier';
import { logger } from '../../../shared/logger';
import { detectPlatform, isHttpUrl } from '../../../shared/platform';
import { resolveNetworkTarget } from '../network-target';
import {
  detectYtKind,
  normalizeYtUrl,
  mapResolvedEntry,
  mapResolvedContainer,
  mapExternalResolvedEntry
} from './youtube-utils';
import { fetchEntryJson, fetchRangeJson } from './youtube-fetch';
import { getStreamUrl } from './youtube-stream';
import { e2eFixturesEnabled } from '../../e2e-fixtures';
import { fetchChannelItems, fetchChannelAll, searchYoutube } from './youtube-channel';

// Rejestracja kanałów `yt:*`. Pobieranie kanału/wyszukiwanie żyje w
// `youtube-channel.ts`; resolve/resolveMore/stream pozostają tutaj.

export { runYtDlp, fetchEntryJson, fetchRangeJson } from './youtube-fetch';
export { getStreamUrl };
export { fetchChannelItems, fetchChannelAll } from './youtube-channel';

export function registerYoutubeHandlers(): void {
  ipcMain.handle('yt:search', async (_event, query: string) => {
    return searchYoutube(query);
  });

  ipcMain.handle(
    'yt:channel',
    async (
      _event,
      opts: { url: string; start?: number; end?: number; tab?: 'videos' | 'shorts' }
    ) => {
      return fetchChannelItems(opts);
    }
  );

  ipcMain.handle(
    'yt:channelAll',
    async (_event, opts: { url: string; tab?: 'videos' | 'shorts' }) => {
      return fetchChannelAll(opts);
    }
  );

  ipcMain.handle('yt:resolve', async (_event, url: string) => {
    if (e2eFixturesEnabled()) {
      if (!detectPlatform(url) && isHttpUrl(url)) {
        return {
          success: true,
          result: {
            kind: 'video',
            sourceUrl: url,
            title: 'External E2E Media',
            meta: {},
            items: [
              {
                id: 'external-e2e-media',
                title: 'External E2E Media',
                thumbnail: '',
                channelTitle: '',
                channelId: '',
                isPlayable: true,
                url
              }
            ]
          }
        };
      }
      // Całkowicie trzymaj ścieżkę prefetch E2E z dala od yt-dlp.
      return { success: false, error: 'e2e fixtures: resolve disabled' };
    }
    const kind = detectYtKind(url);
    if (!kind) {
      if (!isHttpUrl(url)) {
        return { success: false, error: 'Paste a valid public http(s) link' };
      }
      try {
        await resolveNetworkTarget(url);
        const parsed = await fetchEntryJson(url, 'page30', 'generic');
        const isCollection = Array.isArray(parsed.entries) || parsed._type === 'playlist';
        const entries = isCollection ? (parsed.entries ?? []) : [parsed];
        const items = entries
          .filter((entry) => entry.id || entry.url || entry.webpage_url || entry.title)
          .map((entry) => mapExternalResolvedEntry(entry, url));
        if (!items.length) {
          return { success: false, error: 'This site did not return playable media' };
        }
        const title =
          parsed.title || parsed.playlist_title || parsed.channel || parsed.uploader || url;
        const totalItems = parsed.playlist_count ?? items.length;
        return {
          success: true,
          result: {
            kind: isCollection ? 'playlist' : 'video',
            sourceUrl: parsed.webpage_url || url,
            title,
            meta: {
              channelId: parsed.channel_id || parsed.uploader_id || '',
              channelTitle: parsed.channel || parsed.uploader || '',
              totalItems,
              hasMore: isCollection && items.length >= 30 && items.length < totalItems
            },
            items
          }
        };
      } catch (e: unknown) {
        const err = e as { message?: string };
        const msg = err.message || String(e);
        logger.warn('yt', 'external link resolve failed', msg);
        return { success: false, error: msg, code: classifyYtDlpError(msg) };
      }
    }
    const target = normalizeYtUrl(url, kind);
    // Kanały otwierają się bezpośrednio w dedykowanym widoku kanału — nie ma potrzeby pobierać
    // tutaj całej listy przesłanych, więc zwracamy lekki marker.
    if (kind === 'channel') {
      return {
        success: true,
        result: { kind, sourceUrl: target, title: '', meta: {}, items: [] }
      };
    }
    try {
      const isVideo = kind === 'video';
      const parsed = await fetchEntryJson(target, isVideo ? 'full' : 'page30');

      if (isVideo) {
        if (!parsed.id || !parsed.title) {
          return { success: false, error: 'Could not read video info' };
        }
        return {
          success: true,
          result: {
            kind,
            sourceUrl: target,
            title: parsed.title || '',
            meta: {
              channelId: parsed.channel_id || '',
              channelTitle: parsed.channel || parsed.uploader || ''
            },
            items: [mapResolvedEntry(parsed)]
          }
        };
      }

      const items = mapResolvedContainer(parsed);
      const title =
        parsed.title || parsed.playlist_title || parsed.channel || parsed.uploader || '';
      const playlistCount = parsed.playlist_count;
      // Gdy yt-dlp nie raportuje liczby elementów playlisty, zostawiamy ją nieznaną i
      // pozwalamy rendererowi uzupełnić dokładną sumę po wczytaniu całej listy.
      const totalItems = playlistCount ?? null;
      return {
        success: true,
        result: {
          kind,
          sourceUrl: target,
          title,
          meta: {
            channelId: parsed.channel_id || parsed.uploader_id || '',
            channelTitle: parsed.channel || parsed.uploader || '',
            totalItems,
            // Ładuj dalej, gdy strona jest pełna — nawet gdy brakuje playlist_count,
            // pełna 30-elementowa strona oznacza, że prawie na pewno jest więcej.
            hasMore: items.length >= 30 && (playlistCount == null || items.length < playlistCount)
          },
          items
        }
      };
    } catch (e: unknown) {
      const err = e as { message?: string };
      logger.warn('yt', 'resolve failed', err.message || String(e));
      return {
        success: false,
        error: err.message || 'Could not resolve this link',
        code: classifyYtDlpError(err.message || '')
      };
    }
  });

  ipcMain.handle(
    'yt:resolveMore',
    async (_event, opts: { url: string; start: number; end: number }) => {
      const kind = typeof opts?.url === 'string' ? detectYtKind(opts.url) : null;
      if (!opts || typeof opts.url !== 'string' || (!kind && !isHttpUrl(opts.url))) {
        return {
          success: false,
          error: 'Invalid YouTube link',
          items: [],
          hasMore: false,
          totalItems: 0
        };
      }
      try {
        const target = kind ? normalizeYtUrl(opts.url, kind) : opts.url;
        await resolveNetworkTarget(target);
        const start = Math.max(1, Math.floor(Number(opts.start) || 1));
        const end = Math.max(
          start,
          Math.min(start + 199, Math.floor(Number(opts.end) || start + 29))
        );
        const parsed = await fetchRangeJson(target, start, end, kind ? 'youtube' : 'generic');
        const items = mapResolvedContainer(parsed);
        const playlistCount = parsed.playlist_count;
        return {
          success: true,
          items,
          // Pełna strona oznacza, że jest więcej do wczytania — chyba że liczba elementów playlisty
          // jest znana, a skumulowane elementy już ją osiągnęły.
          hasMore:
            items.length >= end - start + 1 &&
            (playlistCount == null || start - 1 + items.length < playlistCount),
          totalItems: playlistCount ?? null
        };
      } catch (e: unknown) {
        const err = e as { message?: string };
        logger.warn('yt', 'resolveMore failed', err.message || String(e));
        return {
          success: false,
          error: err.message || 'Could not load more items',
          code: classifyYtDlpError(err.message || ''),
          items: [],
          hasMore: false,
          totalItems: 0
        };
      }
    }
  );

  ipcMain.handle('yt:stream:get', async (_event, url: string) => {
    return getStreamUrl(url);
  });
}
