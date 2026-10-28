import { isAbsolute, normalize, sep } from 'path';
import { tmpdir } from 'os';
import { isSensitivePath } from '../../path-policy';

// Normalizacja niezaufanych ścieżek z renderera. Wspólne dla skanowania,
// dodawania plików i zapisu folderów biblioteki.

export const MAX_SCAN_FOLDERS = 100;
export const MAX_ADDED_FILES = 2000;

// Foldery/ścieżki przychodzące z renderera są niezaufane — zachowujemy tylko niepuste
// ścieżki absolutne, deduplikujemy i ograniczamy liczbę.
export function sanitizeFilePaths(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const p = item.trim();
    if (!p || !isAbsolute(p) || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= MAX_ADDED_FILES) break;
  }
  return out;
}

export function sanitizeFolderPaths(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const p = item.trim();
    if (!p || !isAbsolute(p) || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= MAX_SCAN_FOLDERS) break;
  }
  return out;
}

// Korzenie biblioteki trafiają do allowlisty serwera mediów, więc przy ich
// UTRWALANIU odrzucamy ścieżki z segmentami wrażliwymi (AppData, profile
// przeglądarek, .ssh…), żeby przejęty renderer nie przyznał serwerowi takich
// katalogów. `library:scan` nie grantuje rootów, więc skanowanie dowolnego
// folderu (np. katalogu tymczasowego w testach) pozostaje dozwolone.
//
// Wyjątek: katalog tymczasowy systemu jest dozwolony — `onda://` już ufa
// `app.getPath('temp')`, a fixture'y E2E i biblioteki trzymane w tempie muszą
// działać. Blokowane pozostają właściwe AppData (Roaming, profile przeglądarek).
const TEMP_PREFIX = normalize(tmpdir())
  .toLowerCase()
  .replace(/[\\/]+$/, '');

export function isSystemTemp(target: string): boolean {
  const n = normalize(target).toLowerCase();
  return n === TEMP_PREFIX || n.startsWith(TEMP_PREFIX + sep);
}

export function withoutSensitivePaths(paths: string[]): string[] {
  return paths.filter((p) => isSystemTemp(p) || !isSensitivePath(p));
}
