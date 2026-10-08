import type { MediaFile } from '@renderer/types/media';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import { parseDurationText } from '@renderer/utils/onlineHelpers';

// Odtwarzanie elementów źródła bez pobierania: elementy z bezpośrednim `mediaUrl`
// idą do playerа jako utwory typu 'stream' (silnik audio serwuje je przez lokalny
// proxy `/stream`, tak jak strumienie online). `playerUrl` (embed) nie jest tu
// obsługiwany — trafia do okna podglądu.

const AUDIO_EXT = new Set([
  'mp3',
  'flac',
  'wav',
  'ogg',
  'aac',
  'm4a',
  'opus',
  'wma',
  'aiff',
  'alac'
]);

/** Bezpośredni, odtwarzalny adres elementu (plik media) albo pusty string. */
export function sourceItemPlayUrl(item: SourceItem): string {
  return item.mediaUrl || '';
}

export function isSourceItemPlayable(item: SourceItem): boolean {
  return !!sourceItemPlayUrl(item);
}

function extensionOf(url: string): string {
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]+)$/i);
    return match ? match[1]!.toLowerCase() : '';
  } catch {
    return '';
  }
}

function mimeFor(extension: string): string {
  if (AUDIO_EXT.has(extension)) return extension === 'mp3' ? 'audio/mpeg' : `audio/${extension}`;
  return 'video/mp4';
}

/**
 * Buduje utwór strumieniowy do playerа z elementu źródła. `type: 'stream'` sprawia,
 * że `useAudioPlayer` kieruje go do `audioEngine.loadRemote` (proxy/direct fallback),
 * więc nie wymaga lokalnego pliku ani `grantMediaAccess`.
 */
export function buildSourceStreamTrack(
  source: MediaSource,
  item: SourceItem,
  order: number
): MediaFile {
  const url = sourceItemPlayUrl(item);
  const extension = extensionOf(url);
  return {
    id: `src:${source.id}:${item.id || item.title || order}`,
    name: item.title || item.id || source.name,
    path: url,
    extension,
    mimeType: mimeFor(extension),
    size: 0,
    duration: parseDurationText(item.duration),
    thumbnail: item.thumbnail,
    type: 'stream',
    addedAt: Date.now() + order,
    playCount: 0
  };
}
