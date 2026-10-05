import { classifyYtDlpError } from '../../downloads/error-classifier';
import { logger } from '../../../shared/logger';
import type { IpcDownloadErrorCode } from '../../../shared/types/ipc';
import {
  pickChannelThumbnail,
  resolveChannelAvatar,
  detectYtKind,
  normalizeYtUrl,
  mapVideoEntry,
  type YtDlpEntry
} from './youtube-utils';
import { readNetworkArgs } from '../proxy-utils';
import { runYtDlp } from './youtube-fetch';
import { e2eFixturesEnabled } from '../../e2e-fixtures';

// Pobieranie list filmów kanału (pojedyncza strona i całość) oraz wyszukiwanie,
// wyodrębnione z `youtube-handlers.ts`. Pure parsowanie/mapowanie zostaje w
// `youtube-utils`; tutaj żyje tylko uruchamianie yt-dlp i składanie odpowiedzi.

export async function fetchChannelItems(opts: {
  url: string;
  start?: number;
  end?: number;
  tab?: 'videos' | 'shorts';
}): Promise<{
  success: boolean;
  error?: string;
  code?: IpcDownloadErrorCode;
  channel?: {
    id: string;
    url: string;
    title: string;
    thumbnail: string;
    subscriberCount?: number;
    description?: string;
    videoCount?: number;
    bannerUrl?: string;
  };
  items: ReturnType<typeof mapVideoEntry>[];
  hasMore: boolean;
}> {
  if (detectYtKind(opts.url) !== 'channel') {
    return { success: false, error: 'Expected a channel link or name', items: [], hasMore: false };
  }
  const base = normalizeYtUrl(opts.url, 'channel');
  const tab = opts.tab === 'shorts' ? 'shorts' : 'videos';
  const target = `${base}/${tab}`;
  if (e2eFixturesEnabled()) {
    return {
      success: true,
      channel: {
        id: 'UCabcdefghijABCDEFGHIJ1234',
        url: base,
        title: 'E2E Channel',
        thumbnail: '',
        videoCount: 0
      },
      items: [],
      hasMore: false
    };
  }
  const start = Math.max(1, Math.floor(Number(opts.start) || 1));
  const end = Math.max(start, Math.min(start + 199, Math.floor(Number(opts.end) || start + 29)));
  try {
    const stdout = await runYtDlp(
      [
        target,
        '--flat-playlist',
        '--playlist-start',
        String(start),
        '--playlist-end',
        String(end),
        '--no-warnings',
        '-J',
        ...(await readNetworkArgs('youtube'))
      ],
      60000
    );
    const parsed = JSON.parse(stdout) as YtDlpEntry;
    const items = (parsed.entries || [])
      .filter((e) => e.id && e.title)
      .map((e) => mapVideoEntry(e));
    const channelId = parsed.channel_id || parsed.uploader_id || parsed.id || '';
    const channelThumbnail =
      pickChannelThumbnail(parsed) || (await resolveChannelAvatar(channelId));
    return {
      success: true,
      channel: {
        id: channelId,
        url: base,
        title: parsed.channel || parsed.uploader || parsed.title || '',
        thumbnail: channelThumbnail,
        subscriberCount: parsed.channel_follower_count,
        description: parsed.description || '',
        videoCount: parsed.playlist_count ?? items.length,
        bannerUrl: pickChannelThumbnail(parsed) || undefined
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
      code: classifyYtDlpError(msg),
      items: [],
      hasMore: false
    };
  }
}

// Pobiera CAŁĄ listę filmów kanału w jednym wywołaniu `--flat-playlist -J`
// (bez paginacji per strona). Używane przez checker subskrypcji, aby "sprawdź teraz"
// nie wywoływał dziesiątek redundantnych uruchomień yt-dlp.
export async function fetchChannelAll(opts: { url: string; tab?: 'videos' | 'shorts' }): Promise<{
  success: boolean;
  error?: string;
  code?: IpcDownloadErrorCode;
  channel?: {
    id: string;
    url: string;
    title: string;
    thumbnail: string;
    subscriberCount?: number;
    description?: string;
    videoCount?: number;
  };
  items: ReturnType<typeof mapVideoEntry>[];
}> {
  if (detectYtKind(opts.url) !== 'channel') {
    return { success: false, error: 'Expected a channel link or name', items: [] };
  }
  const base = normalizeYtUrl(opts.url, 'channel');
  const tab = opts.tab === 'shorts' ? 'shorts' : 'videos';
  const target = `${base}/${tab}`;
  try {
    const stdout = await runYtDlp(
      [target, '--flat-playlist', '--no-warnings', '-J', ...(await readNetworkArgs('youtube'))],
      120000
    );
    const parsed = JSON.parse(stdout) as YtDlpEntry;
    const items = (parsed.entries || [])
      .filter((e) => e.id && e.title)
      .map((e) => mapVideoEntry(e));
    const channelId = parsed.channel_id || parsed.uploader_id || parsed.id || '';
    const channelThumbnail =
      pickChannelThumbnail(parsed) || (await resolveChannelAvatar(channelId));
    return {
      success: true,
      channel: {
        id: channelId,
        url: base,
        title: parsed.channel || parsed.uploader || parsed.title || '',
        thumbnail: channelThumbnail,
        subscriberCount: parsed.channel_follower_count,
        description: parsed.description || '',
        videoCount: parsed.playlist_count ?? items.length
      },
      items
    };
  } catch (e: unknown) {
    const err = e as { message?: string };
    logger.warn('yt', 'fetchChannelAll failed', err.message || String(e));
    return {
      success: false,
      error: err.message || 'Could not load this channel',
      code: classifyYtDlpError(err.message || ''),
      items: []
    };
  }
}

export async function searchYoutube(query: string): Promise<{
  success: boolean;
  error?: string;
  code?: IpcDownloadErrorCode;
  items: ReturnType<typeof mapVideoEntry>[];
  nextPageToken: null;
  prevPageToken: null;
}> {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) {
    return {
      success: false,
      error: 'Invalid search query',
      items: [],
      nextPageToken: null,
      prevPageToken: null
    };
  }
  if (e2eFixturesEnabled()) {
    const { e2eSearchItems } = await import('../../e2e-fixtures');
    return {
      success: true,
      items: e2eSearchItems(query),
      nextPageToken: null,
      prevPageToken: null
    };
  }
  try {
    const stdout = await runYtDlp(
      [
        `ytsearch100:${query}`,
        '--flat-playlist',
        '--no-warnings',
        '-J',
        ...(await readNetworkArgs('youtube'))
      ],
      60000
    );
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
      code: classifyYtDlpError(err.message || ''),
      items: [],
      nextPageToken: null,
      prevPageToken: null
    };
  }
}
