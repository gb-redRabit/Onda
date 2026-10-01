import { pickChannelThumbnail, type YtDlpEntry } from '../youtube/youtube-utils';
import { runYtDlp } from '../youtube/youtube-handlers';
import { readNetworkArgs } from '../proxy-utils';
import { scVideoFromEntry, entryUrl } from './soundcloud-entries';

// Fallback yt-dlp dla listingów profilu SoundCloud, wyodrębniony z
// `soundcloud-handlers.ts` (plan 2.8). Używany, gdy klient api-v2 rzuci wyjątek.

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
      ...(await readNetworkArgs('soundcloud'))
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
    [target, '--flat-playlist', '--no-warnings', '-J', ...(await readNetworkArgs('soundcloud'))],
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
