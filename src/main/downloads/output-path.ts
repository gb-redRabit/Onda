import { extname } from 'path';

interface DiskEntry {
  name: string;
  mtimeMs: number;
}

// yt-dlp w Windows wypisuje nazwy plików na stdout w kodowaniu strony konsoli, więc
// sparsowany destination może być zniekształcony dla nazw spoza ASCII. Plik zapisany
// na dysku ma jednak zawsze poprawną nazwę Unicode. Aby ustalić rzeczywistą ścieżkę
// końcową, przechodzimy sparsowane destinations od ostatniego wstecz i zwracamy
// pierwszy, który faktycznie istnieje (pliki pośrednie są usuwane przez yt-dlp po
// ekstrakcji audio / scalaniu).
export function resolveFinalOutputPath(
  destinations: string[],
  exists: (path: string) => boolean
): string | undefined {
  for (let i = destinations.length - 1; i >= 0; i--) {
    const dest = destinations[i];
    if (dest && exists(dest)) return dest;
  }
  return undefined;
}

// Ostateczny fallback, gdy żaden sparsowany destination nie istnieje na dysku (np.
// linie destination zostały zniekształcone nie do odratowania): wybierz najnowszy plik
// w katalogu wyjściowym z pasującym rozszerzeniem utworzony po starcie zadania.
export function findNewestOutput(
  dirEntries: DiskEntry[],
  extensions: readonly string[],
  newerThan: number
): string | undefined {
  const wanted = new Set(extensions.map((e) => e.toLowerCase()));
  let best: DiskEntry | undefined;
  for (const entry of dirEntries) {
    if (entry.name.endsWith('.part')) continue;
    if (!wanted.has(extname(entry.name).toLowerCase())) continue;
    if (entry.mtimeMs < newerThan) continue;
    if (!best || entry.mtimeMs > best.mtimeMs) best = entry;
  }
  return best?.name;
}
