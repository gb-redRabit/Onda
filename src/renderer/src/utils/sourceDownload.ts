import type { IpcDownloadJobInput } from '@shared/types/ipc';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import { deriveFileName, sanitizeName } from '@renderer/utils/sources-helpers';

// Buduje wejście zadania pobierania yt-dlp/http dla elementu źródła. Wydzielone z
// `stores/sources.ts` (plan 2.8); store rozwiązuje katalog bazowy (IPC)
// i przekazuje go tutaj.

export interface SourceDownloadInputArgs {
  item: SourceItem;
  source: MediaSource;
  /** Rozwiązany korzeń pobierania (settings/downloadDir), bez folderu per źródło. */
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
      sourceId: source.id,
      // Tylko elementy ujawniające id API mogą zostać rozpoznane ponownie po
      // zakończeniu pobierania; proces główny zapisuje je jako "downloaded".
      sourceItemId: item.id || undefined,
      fileName: useYtdlp ? undefined : deriveFileName(item),
      apiKeyId: auth && auth.type !== 'none' ? auth.apiKeyId : undefined,
      headerName: auth && auth.type === 'apikey' ? auth.headerName : undefined,
      allowPrivateNetwork: source.allowPrivateNetwork
    }
  };
}
