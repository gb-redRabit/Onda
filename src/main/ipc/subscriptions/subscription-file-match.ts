export interface VideoTitleRef {
  id: string;
  title: string;
}

export interface OutputFileRef {
  path: string;
  name: string;
}

export interface DownloadFileMatch {
  /** videoId → ścieżka najlepszego dopasowania (preferowany format). */
  files: Record<string, string>;
  /** ID, dla których nie znaleziono żadnego pliku. */
  unmatchedIds: string[];
}

/** Klucz porównania: bez rozszerzenia, bez interpunkcji, bez różnic Unicode. */
export function matchKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function stripChannelSuffix(stem: string, channelTitle: string): string {
  const suffix = ` - ${channelTitle}`;
  return stem.toLowerCase().endsWith(suffix.toLowerCase())
    ? stem.slice(0, stem.length - suffix.length)
    : stem;
}

/**
 * Dopasowuje pliki z katalogu pobrań do filmów kanału po tytule. Używane jako
 * uzupełnienie `downloadedFiles` dla subskrypcji pobranych przed zapisywaniem ścieżek.
 * Dla tego samego tytułu (np. MP3 + MP4) wybiera preferowane rozszerzenie.
 */
export function matchDownloadedFiles(
  videos: readonly VideoTitleRef[],
  files: readonly OutputFileRef[],
  channelTitle: string,
  preferredExt?: string
): DownloadFileMatch {
  const byTitle = new Map<string, OutputFileRef[]>();
  for (const file of files) {
    // Najpierw zdejmij rozszerzenie, dopiero potem sufiks kanału; inaczej
    // „… - Club Kawaii.mp3” nie kończy się na „ - Club Kawaii”.
    const stem = file.name.replace(/\.[^.]+$/, '');
    const key = matchKey(stripChannelSuffix(stem, channelTitle));
    if (!key) continue;
    const list = byTitle.get(key);
    if (list) list.push(file);
    else byTitle.set(key, [file]);
  }

  const wanted = preferredExt?.toLowerCase();
  const out: Record<string, string> = {};
  const unmatchedIds: string[] = [];
  for (const video of videos) {
    const candidates = byTitle.get(matchKey(video.title)) ?? [];
    if (candidates.length === 0) {
      unmatchedIds.push(video.id);
      continue;
    }
    const preferred = wanted
      ? candidates.find((file) => file.path.toLowerCase().endsWith(wanted))
      : undefined;
    out[video.id] = (preferred ?? candidates[0]).path;
  }
  return { files: out, unmatchedIds };
}
