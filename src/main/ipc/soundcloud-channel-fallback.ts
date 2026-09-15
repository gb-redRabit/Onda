import { pickChannelThumbnail, type YtDlpEntry } from './youtube-utils';
import { runYtDlp } from './youtube-handlers';
import { readProxyArgs } from './proxy-utils';
import { scVideoFromEntry, entryUrl } from './soundcloud-entries';

// yt-dlp fallback for SoundCloud profile listings, split out of
// `soundcloud-handlers.ts` (plan 2.8). Used when the api-v2 client throws.

export interface ScFallbackChannel {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  bannerUrl?: string;
  subscriberCount?: number;
  description: string;
  videoCount: number;
}

export async function fallbackChannelPage(
  target: string,
  start: number,
  end: number,
  limit: number
): Promise<{
  channel: ScFallbackChannel;
  items: ReturnType<typeof scVideoFromEntry>[];
  hasMore: boolean;
}> {
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
      ...(await readProxyArgs())
    ],
    60000
  );
  const parsed = JSON.parse(stdout) as YtDlpEntry;
  const items = (parsed.entries || [])
    .filter((en) => en.title && (en.id || entryUrl(en)))
    .map((en) => scVideoFromEntry(en));
  return {
    channel: {
      id: parsed.uploader_id || parsed.uploader || target,
      url: target,
      title: parsed.channel || parsed.uploader || parsed.title || '',
      thumbnail: pickChannelThumbnail(parsed),
      bannerUrl: pickChannelThumbnail(parsed) || undefined,
      subscriberCount: parsed.channel_follower_count,
      description: parsed.description || '',
      videoCount: parsed.playlist_count ?? items.length
    },
    items,
    hasMore: items.length >= limit
  };
}

export async function fallbackChannelAll(
  target: string
): Promise<{ channel: ScFallbackChannel; items: ReturnType<typeof scVideoFromEntry>[] }> {
  const stdout = await runYtDlp(
    [target, '--flat-playlist', '--no-warnings', '-J', ...(await readProxyArgs())],
    120000
  );
  const parsed = JSON.parse(stdout) as YtDlpEntry;
  const valid = (parsed.entries || []).filter((en) => en.title && (en.id || entryUrl(en)));
  const items = valid.slice(0, 500).map((en) => scVideoFromEntry(en));
  return {
    channel: {
      id: parsed.uploader_id || parsed.uploader || target,
      url: target,
      title: parsed.channel || parsed.uploader || parsed.title || '',
      thumbnail: pickChannelThumbnail(parsed),
      bannerUrl: pickChannelThumbnail(parsed) || undefined,
      subscriberCount: parsed.channel_follower_count,
      description: parsed.description || '',
      videoCount: parsed.playlist_count ?? items.length
    },
    items
  };
}
