import { ipcMain } from 'electron';
import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';
import { getYtAuthConfig } from '../youtube-auth';
import { logger } from '../../shared/logger';
import {
  pickChannelThumbnail,
  buildYtArgs,
  detectYtKind,
  normalizeYtUrl,
  mapResolvedEntry,
  mapResolvedContainer,
  mapVideoEntry,
  type YtDlpEntry
} from './youtube-utils';

export function registerYoutubeHandlers(): void {
  ipcMain.handle('yt:search', async (_event, query: string) => {
    try {
      const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
      const auth = await getYtAuthConfig();
      const args = buildYtArgs(
        [`ytsearch50:${query}`, '--flat-playlist', '--no-warnings', '-J'],
        auth
      );
      const stdout = await runCommand(bin, args, { timeout: 60000 });
      const parsed = JSON.parse(stdout) as { entries?: YtDlpEntry[] };
      const items = (parsed.entries || [])
        .filter((e) => e.id && e.title)
        .map((e) => mapVideoEntry(e));
      return { success: true, items, nextPageToken: null, prevPageToken: null };
    } catch (e: unknown) {
      const err = e as { message?: string };
      logger.warn('yt', 'search failed', err.message || String(e));
      return {
        success: false,
        error: err.message || 'YouTube search failed',
        items: [],
        nextPageToken: null,
        prevPageToken: null
      };
    }
  });

  ipcMain.handle(
    'yt:channel',
    async (
      _event,
      opts: { url: string; start?: number; end?: number; tab?: 'videos' | 'shorts' }
    ) => {
      if (detectYtKind(opts.url) !== 'channel') {
        return { success: false, error: 'Expected a channel link or name' };
      }
      const base = normalizeYtUrl(opts.url, 'channel');
      const tab = opts.tab === 'shorts' ? 'shorts' : 'videos';
      const target = `${base}/${tab}`;
      const start = Math.max(1, opts.start ?? 1);
      const end = Math.max(start, opts.end ?? start + 29);
      try {
        const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
        const auth = await getYtAuthConfig();
        const args = buildYtArgs(
          [
            target,
            '--flat-playlist',
            '--playlist-start',
            String(start),
            '--playlist-end',
            String(end),
            '--no-warnings',
            '-J'
          ],
          auth
        );
        const stdout = await runCommand(bin, args, { timeout: 60000 });
        const parsed = JSON.parse(stdout) as YtDlpEntry;
        const items = (parsed.entries || [])
          .filter((e) => e.id && e.title)
          .map((e) => mapVideoEntry(e));
        return {
          success: true,
          channel: {
            id: parsed.channel_id || parsed.uploader_id || parsed.id || '',
            url: base,
            title: parsed.channel || parsed.uploader || parsed.title || '',
            thumbnail: pickChannelThumbnail(parsed),
            subscriberCount: parsed.channel_follower_count
          },
          items,
          hasMore: items.length >= end - start + 1
        };
      } catch (e: unknown) {
        const err = e as { message?: string };
        const msg = err.message || String(e);
        logger.warn('yt', 'channel failed', msg);
        if (tab === 'shorts' && /does not have a shorts tab/i.test(msg)) {
          return { success: false, error: 'no_shorts_tab', items: [], hasMore: false };
        }
        return {
          success: false,
          error: msg || 'Could not load this channel',
          items: [],
          hasMore: false
        };
      }
    }
  );

  ipcMain.handle('yt:resolve', async (_event, url: string) => {
    const kind = detectYtKind(url);
    if (!kind) {
      return { success: false, error: 'Unsupported or invalid YouTube link' };
    }
    const target = normalizeYtUrl(url, kind);
    // Channels open directly in the dedicated channel view — no need to fetch
    // the full uploads list here, so return a lightweight marker.
    if (kind === 'channel') {
      return {
        success: true,
        result: { kind, sourceUrl: target, title: '', meta: {}, items: [] }
      };
    }
    try {
      const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
      const auth = await getYtAuthConfig();
      const isVideo = kind === 'video';
      const args = buildYtArgs(
        isVideo
          ? [target, '--no-warnings', '-J']
          : [
              target,
              '--flat-playlist',
              '--playlist-start',
              '1',
              '--playlist-end',
              '30',
              '--no-warnings',
              '-J'
            ],
        auth
      );
      const stdout = await runCommand(bin, args, { timeout: 60000 });
      const parsed = JSON.parse(stdout) as YtDlpEntry;

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
      // When yt-dlp does not report the playlist count we leave it unknown and
      // let the renderer fill in the exact total once the whole list is loaded.
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
            // Keep loading while the page is full — even when playlist_count is
            // missing, a full 30-item page means there is almost certainly more.
            hasMore: items.length >= 30 && (playlistCount == null || items.length < playlistCount)
          },
          items
        }
      };
    } catch (e: unknown) {
      const err = e as { message?: string };
      logger.warn('yt', 'resolve failed', err.message || String(e));
      return { success: false, error: err.message || 'Could not resolve this link' };
    }
  });

  ipcMain.handle(
    'yt:resolveMore',
    async (_event, opts: { url: string; start: number; end: number }) => {
      try {
        const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
        const auth = await getYtAuthConfig();
        const start = Math.max(1, opts.start || 1);
        const end = Math.max(start, opts.end || start + 29);
        const args = buildYtArgs(
          [
            opts.url,
            '--flat-playlist',
            '--playlist-start',
            String(start),
            '--playlist-end',
            String(end),
            '--no-warnings',
            '-J'
          ],
          auth
        );
        const stdout = await runCommand(bin, args, { timeout: 60000 });
        const parsed = JSON.parse(stdout) as YtDlpEntry;
        const items = mapResolvedContainer(parsed);
        const playlistCount = parsed.playlist_count;
        return {
          success: true,
          items,
          // A full page means there is more to load — unless the playlist count
          // is known and the cumulative items already reached it.
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
          items: [],
          hasMore: false,
          totalItems: 0
        };
      }
    }
  );
}
