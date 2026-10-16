import type { SourceItem } from '../../shared/types/sources';
import { registerGenericStreamUrl } from '../media/media-server-stream-registry';

// Rejestracja odtwarzalnych adresów źródła w rejestrze generycznych strumieni —
// wydzielone z `generic-fetch.ts` (plan 2.8).

// Ile adresów rejestrujemy z jednego pobrania źródła (ochrona przed lawiną
// rozwiązań DNS, gdy źródło zwraca setki pozycji). Nadmiar pójdzie ścieżką bezpośrednią.
const MAX_REGISTERED_SOURCE_STREAMS = 100;

/**
 * Rejestruje publiczne `mediaUrl` odtwarzalnych elementów źródła w rejestrze
 * generycznych strumieni, aby lokalny serwer mediów (`/stream?url=`) je przepuścił.
 * Proxy domyślnie dopuszcza tylko znane hosty YouTube/SoundCloud; elementy źródeł
 * pochodzą z KONFIGURACJI użytkownika (ta sama rodzina zaufania co URL-e yt-dlp).
 * Adresy prywatne/loopback odrzuca `resolveNetworkTarget`. Rejestracja jest
 * nieblokująca i cicha — nieudany adres po prostu nie trafi do rejestru.
 */
export function registerPlayableMediaUrls(items: SourceItem[]): void {
  let registered = 0;
  const seen = new Set<string>();
  for (const item of items) {
    if (item.type !== 'audio' && item.type !== 'video') continue;
    const url = item.mediaUrl;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (registered++ >= MAX_REGISTERED_SOURCE_STREAMS) break;
    void registerGenericStreamUrl(url).catch(() => {
      // adres odrzucony (prywatny/niepubliczny) — odtwarzanie pójdzie bezpośrednio
    });
  }
}
