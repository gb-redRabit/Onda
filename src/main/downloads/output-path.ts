import { extname } from 'path';

interface DiskEntry {
  name: string;
  mtimeMs: number;
}

// yt-dlp on Windows prints filenames to stdout using the console codepage, so
// the parsed destination may be mangled for non-ASCII names. The file written
// to disk however always has the correct Unicode name. To derive the real final
// path we walk the parsed destinations from the last one backwards and return
// the first that actually exists (intermediates are deleted by yt-dlp after
// audio extraction / merging).
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

// Last-resort fallback when no parsed destination exists on disk (e.g. the
// destination lines were mangled beyond recovery): pick the newest file in the
// output directory with a matching extension created after the job started.
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