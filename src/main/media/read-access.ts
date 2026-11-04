import { realpathSync } from 'fs';
import { isPathWithinAllowedRoots } from './media-server';

/**
 * Czy odczyt zawartości pliku jest dozwolony? `media-server` i tak serwuje
 * tylko pliki z biblioteki / jawnie przyznanych korzeni; ten sam warunek
 * egzekwujemy dla odczytów przez IPC (okładki, duration, waveform, transkodowanie),
 * żeby przejęty renderer nie mógł czytać dowolnych mediów z dysku.
 */
export function isReadableMediaPath(filePath: string): boolean {
  try {
    return isPathWithinAllowedRoots(realpathSync.native(filePath));
  } catch {
    return false;
  }
}
