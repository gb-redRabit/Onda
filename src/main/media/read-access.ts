import { realpathSync } from 'fs';
import { getRootsVersion, isPathWithinAllowedRoots } from './media-server';

const CACHE_TTL_MS = 2000;
const MAX_CACHE_ENTRIES = 1024;

/**
 * `realpathSync` + skan korzeni na każdym żądaniu było kosztowne (miniatury,
 * duration, waveform, transkodowanie). Cache jest ważny tylko dla bieżącej
 * wersji korzeni — dodanie/usunięcie rootu unieważnia wpisy natychmiast.
 */
const cache = new Map<string, { at: number; version: number; allowed: boolean }>();

/**
 * Czy odczyt zawartości pliku jest dozwolony? `media-server` i tak serwuje
 * tylko pliki z biblioteki / jawnie przyznanych korzeni; ten sam warunek
 * egzekwujemy dla odczytów przez IPC (okładki, duration, waveform, transkodowanie),
 * żeby przejęty renderer nie mógł czytać dowolnych mediów z dysku.
 */
export function isReadableMediaPath(filePath: string): boolean {
  const now = Date.now();
  const version = getRootsVersion();
  const cached = cache.get(filePath);
  if (cached && cached.version === version && now - cached.at < CACHE_TTL_MS) {
    return cached.allowed;
  }

  let allowed = false;
  try {
    allowed = isPathWithinAllowedRoots(realpathSync.native(filePath));
  } catch {
    // brak pliku/symlinku — traktujemy jak brak dostępu
  }

  cache.set(filePath, { at: now, version, allowed });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return allowed;
}
