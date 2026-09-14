import type { IpcDownloadJobInput } from '@shared/types/ipc';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import { deriveFileName, sanitizeName } from '@renderer/utils/sources-helpers';

// Builds the yt-dlp/http download job input for a source item. Extracted from
// `stores/sources.ts` (plan 2.8); the store resolves the base directory (IPC)
// and passes it in.

export interface SourceDownloadInputArgs {
  item: SourceItem;
  source: MediaSource;
  /** Resolved download root (settings/downloadDir), without per-source folder. */
  baseDir: string;
  outputDir?: string;
  addToLibrary?: boolean;
  autoAddToLibrary: boolean;
}

export function buildSourceDownloadInput(args: SourceDownloadInputArgs): IpcDownloadJobInput {
  const { item, source, baseDir, outputDir, addToLibrary, autoAddToLibrary } = args;
  // Player (embed) ma pierwszeństwo — pobieranie przez yt-dlp (mega/cda/vk/drive).
  // mediaUrl to bezpośredni plik → tryb http (stream). sourceUrl tylko jako ostateczność.
  const url = item.playerUrl || item.mediaUrl || item.sourceUrl || '';
  const useYtdlp = !!item.playerUrl || (!item.mediaUrl && !!item.sourceUrl);
  const auth = source.auth;
  // Katalog docelowy: per-źródło (edycja w kreatorze), domyślnie <katalog Pobranych>/api.
  const prefs = source.download;
  const outDir =
    prefs?.folder !== false && baseDir ? `${baseDir}/${sanitizeName(source.name)}` : baseDir;
  return {
    url,
    title: item.title || url,
    thumbnail: item.thumbnail,
    // yt-dlp: zawsze bestvideo+bestaudio/best — wideo zostaje wideo, samo-audio
    // i tak złapie selektor /best; bez re-encodingu. http (bezpośredni plik):
    // kind wyłącznie do nazwy pliku.
    kind: useYtdlp ? 'video' : item.type === 'video' ? 'video' : 'audio',
    format: 'best',
    quality: 'best',
    outputDir: outputDir ?? outDir,
    filenameTemplate: '{title}',
    addToLibrary: addToLibrary ?? autoAddToLibrary,
    source: {
      mode: useYtdlp ? 'ytdlp' : 'http',
      fileName: useYtdlp ? undefined : deriveFileName(item),
      apiKeyId: auth && auth.type !== 'none' ? auth.apiKeyId : undefined,
      headerName: auth && auth.type === 'apikey' ? auth.headerName : undefined
    }
  };
}
