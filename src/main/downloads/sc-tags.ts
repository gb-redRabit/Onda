// SoundCloud downloads are raw progressive MP3 streams — no ID3 tags and no
// artwork. After the file lands on disk we embed title/artist (+ optional
// album/year overrides) and the track's artwork_url as APIC so the library
// shows proper metadata instead of file names.
import NodeID3 from 'node-id3';
import { logger } from '../../shared/logger';
import { writeCoverToAudioFile } from '../ipc/media-handlers';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 15_000;

export interface ScTagMeta {
  title: string;
  artist?: string;
  album?: string;
  year?: string;
  thumbnailUrl?: string;
}

function sniffImageMime(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF') return 'image/webp';
  return 'image/jpeg';
}

async function fetchArtwork(url: string): Promise<number[] | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    return [...buf];
  } catch {
    return null;
  }
}

export async function embedScMp3Tags(filePath: string, meta: ScTagMeta): Promise<boolean> {
  if (!filePath.toLowerCase().endsWith('.mp3')) return false;
  try {
    const tags: Record<string, string> = {};
    if (meta.title) tags.title = meta.title;
    if (meta.artist) tags.artist = meta.artist;
    if (meta.album) tags.album = meta.album;
    if (meta.year) tags.year = meta.year;
    if (Object.keys(tags).length > 0) {
      NodeID3.update(tags, filePath);
    }
    const image = meta.thumbnailUrl ? await fetchArtwork(meta.thumbnailUrl) : null;
    if (image) {
      const mime = sniffImageMime(Buffer.from(image));
      const res = await writeCoverToAudioFile(filePath, image, mime);
      if (!res.success)
        logger.warn('downloads', `sc cover embed failed for ${filePath}`, res.error);
    }
    return true;
  } catch (e) {
    logger.warn('downloads', `sc tags embed failed for ${filePath}`, String(e));
    return false;
  }
}
