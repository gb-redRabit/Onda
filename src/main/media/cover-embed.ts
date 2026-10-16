import NodeID3 from 'node-id3';
import { extname, join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { writeFile } from 'fs/promises';
import { resolveBin } from '../binaries';
import { runCommand } from '../utils/exec';
import { replaceFileAtomic, safeRm } from '../utils/fs-atomic';

// Kontenery, w których okładkę osadzamy jako tag ID3v2 (ramka APIC).
const ID3_CONTAINERS = new Set(['.mp3']);
// Kontenery, w których ID3v2 USZKODZIŁOBY strukturę pliku (blok ID3 przed atomami
// MP4/FLAC → część odtwarzaczy odmawia odtwarzania). Okładkę wstawiamy przez
// ffmpeg jako `attached_pic`, kopiując strumień audio bez rekompresji.
const ATTACHED_PIC_CONTAINERS = new Set(['.m4a', '.m4b', '.flac']);

export interface CoverImage {
  buffer: Buffer;
  mime: string;
}

// Czy da się bezpiecznie osadzić okładkę w tym kontenerze.
export function coverEmbedSupported(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ID3_CONTAINERS.has(ext) || ATTACHED_PIC_CONTAINERS.has(ext);
}

async function embedId3Cover(filePath: string, image: CoverImage): Promise<void> {
  await NodeID3.Promise.update(
    {
      image: { mime: image.mime, type: { id: 3 }, imageBuffer: image.buffer, description: 'Cover' }
    },
    filePath
  );
}

async function embedAttachedPicCover(filePath: string, image: CoverImage): Promise<void> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpImage = join(tmpdir(), `onda-cover-${stamp}`);
  const tmpOut = join(dirname(filePath), `.${basename(filePath)}.cover-${stamp}.tmp`);
  try {
    await writeFile(tmpImage, image.buffer);
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    await runCommand(
      ffmpeg,
      [
        '-y',
        '-i',
        filePath,
        '-i',
        tmpImage,
        '-map',
        '0',
        '-map',
        '1',
        '-c',
        'copy',
        '-disposition:v:0',
        'attached_pic',
        '-metadata:s:v:0',
        'title=Cover',
        tmpOut
      ],
      { timeout: 60_000 }
    );
    await replaceFileAtomic(tmpOut, filePath);
  } finally {
    await safeRm(tmpImage);
    await safeRm(tmpOut);
  }
}

// Osadza obraz okładki w pliku audio, dobierając metodę do kontenera, aby NIE
// uszkodzić pliku. Rzuca dla nieobsługiwanych formatów (wywołujący raportuje błąd
// i pomija okładkę, zamiast psuć media).
export async function embedCover(filePath: string, image: CoverImage): Promise<void> {
  const ext = extname(filePath).toLowerCase();
  if (ID3_CONTAINERS.has(ext)) return embedId3Cover(filePath, image);
  if (ATTACHED_PIC_CONTAINERS.has(ext)) return embedAttachedPicCover(filePath, image);
  throw new Error(`cover embedding unsupported for ${ext || 'unknown'}`);
}
