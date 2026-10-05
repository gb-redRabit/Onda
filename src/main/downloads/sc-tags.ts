// Pobrania z SoundCloud to surowe strumienie progresywne MP3 — bez tagów ID3 i bez
// okładki. Po zapisaniu pliku na dysk osadzamy title/artist (+ opcjonalne nadpisania
// album/year) oraz artwork_url utworu jako APIC, aby biblioteka
// pokazywała właściwe metadane zamiast nazw plików.
import NodeID3 from 'node-id3';
import { logger } from '../../shared/logger';
import { writeCoverToAudioFile } from '../ipc/media/media-handlers';
import { fetchRemoteImageBytes } from '../ipc/remote-image';

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
  // `fetchRemoteImageBytes` waliduje każdy hop przekierowania i blokuje cele
  // loopback/prywatne/metadanych — wcześniej surowy `fetch` podążał za
  // przekierowaniami bez walidacji (SSRF przez `thumbnailUrl` z renderera).
  const buf = await fetchRemoteImageBytes(url);
  if (!buf || buf.length === 0) return null;
  return [...buf];
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
      await NodeID3.Promise.update(tags, filePath);
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
