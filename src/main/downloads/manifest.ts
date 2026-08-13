import { writeFile } from 'fs/promises';
import { basename, extname, dirname, join } from 'path';

export interface DownloadManifest {
  url: string;
  videoId?: string;
  title: string;
  channelId?: string;
  channelTitle?: string;
  downloadedAt: number;
}

// Manifest sits next to the media file under the same base name (`Title.onda.json`).
export function manifestPathFor(outputPath: string): string {
  return join(dirname(outputPath), `${basename(outputPath, extname(outputPath))}.onda.json`);
}

// Writes a small provenance file (original URL, video id, download date) next to
// the downloaded media. Never throws — the download itself is already done.
export async function writeDownloadManifest(
  outputPath: string,
  meta: DownloadManifest
): Promise<string | null> {
  try {
    const p = manifestPathFor(outputPath);
    await writeFile(p, JSON.stringify(meta, null, 2), 'utf-8');
    return p;
  } catch {
    return null;
  }
}
