import { runYtDlp, fetchEntryJson } from '../youtube/youtube-handlers';
import { readNetworkArgs } from '../proxy-utils';
import { mapResolvedContainer, type YtDlpEntry } from '../youtube/youtube-utils';
import { scThumbFromEntry, entryUrl, scVideoFromEntry } from './soundcloud-entries';
import type { IpcYoutubeVideo } from '../../../shared/types/ipc';

// Fallbacki yt-dlp dla SoundCloud wyodrębnione z `soundcloud-handlers.ts`
// (plan 2.8): używane, gdy wewnętrzny klient api-v2 nie może obsłużyć żądania, więc
// zrotowany client_id lub zmiana API degraduje do "wolno, ale działa".

export async function fallbackSearch(query: string): Promise<IpcYoutubeVideo[]> {
  const stdout = await runYtDlp(
    [
      `scsearch100:${query}`,
      '--flat-playlist',
      '--no-warnings',
      '-J',
      ...(await readNetworkArgs('soundcloud'))
    ],
    60000
  );
  const parsed = JSON.parse(stdout) as { entries?: YtDlpEntry[] };
  return (parsed.entries || [])
    .filter((e) => e.title && (e.id || entryUrl(e)))
    .map((e) => scVideoFromEntry(e));
}

export async function fallbackResolvePage(
  target: string,
  mode: 'full' | 'page30'
): Promise<{
  title: string;
  items: IpcYoutubeVideo[];
  resolvedItems: ReturnType<typeof mapResolvedContainer>;
  totalItems: number | null;
  hasMore: boolean;
}> {
  const parsed = await fetchEntryJson(target, mode);
  const valid = (parsed.entries || []).filter((e) => e.title && (e.id || entryUrl(e)));
  const items = valid.map((e) => scVideoFromEntry(e));
  const resolvedItems = valid.map((e) => {
    const base = mapResolvedContainer({ entries: [e] })[0];
    return {
      ...base,
      thumbnail: scThumbFromEntry(e),
      url: entryUrl(e) || (/^https:\/\//i.test(base.id) ? base.id : undefined)
    };
  });
  const count = parsed.playlist_count;
  return {
    title: parsed.title || parsed.playlist_title || parsed.channel || parsed.uploader || '',
    items,
    resolvedItems,
    totalItems: count ?? null,
    hasMore: items.length >= 30 && (count == null || items.length < count)
  };
}
