import { runYtDlp, fetchEntryJson } from './youtube-handlers';
import { readProxyArgs } from './proxy-utils';
import { mapResolvedContainer, type YtDlpEntry } from './youtube-utils';
import { scThumbFromEntry, entryUrl, scVideoFromEntry } from './soundcloud-entries';
import type { IpcYoutubeVideo } from '../../shared/types/ipc';

// yt-dlp fallbacks for SoundCloud extracted from `soundcloud-handlers.ts`
// (plan 2.8): used when the internal api-v2 client cannot serve a request, so a
// rotated client_id or API change degrades to "slow but working".

export async function fallbackSearch(query: string): Promise<IpcYoutubeVideo[]> {
  const stdout = await runYtDlp(
    [`scsearch100:${query}`, '--flat-playlist', '--no-warnings', '-J', ...(await readProxyArgs())],
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
