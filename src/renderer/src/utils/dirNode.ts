import { canonicalPath } from '@renderer/utils/path';
import type { MediaFile } from '@renderer/types/media';
import {
  getAllTracksIndexed,
  getDirectTracksIndexed,
  getChildDirsIndexed
} from '@renderer/utils/libraryIndex';
import { trackMatchesQuery } from '@renderer/utils/librarySearch';

type Folders = Parameters<typeof getChildDirsIndexed>[2];

// Wszystko, czego wiersz/szablon potrzebuje dla folderu potomnego, liczone raz na dziecko
// zamiast filtrowania/redukcji poddrzewa 3-5x na render (patrz plan 1.1).
export interface DirChildMeta {
  subtree: MediaFile[];
  audio: MediaFile[];
  audioCount: number;
  duration: number;
  directAll: MediaFile[];
  directAudio: MediaFile[];
  directImages: MediaFile[];
}

export const EMPTY_CHILD_META: DirChildMeta = {
  subtree: [],
  audio: [],
  audioCount: 0,
  duration: 0,
  directAll: [],
  directAudio: [],
  directImages: []
};

export function childCanonical(dir: string, name: string): string {
  return canonicalPath(dir) + '/' + name;
}

export function directTracksInDir(
  dir: string,
  tracks: MediaFile[],
  folders: Folders,
  query: string
): MediaFile[] {
  const all = getDirectTracksIndexed(dir, tracks, folders);
  return all.filter((t) => trackMatchesQuery(t, query));
}

export function buildChildMeta(
  dir: string,
  childNames: string[],
  tracks: MediaFile[],
  folders: Folders,
  query: string
): Record<string, DirChildMeta> {
  const map: Record<string, DirChildMeta> = {};
  for (const name of childNames) {
    const child = childCanonical(dir, name);
    const subtree = getAllTracksIndexed(child, tracks, folders);
    const audio = subtree.filter((t) => t.type !== 'image');
    let duration = 0;
    for (const t of audio) duration += t.duration || 0;
    const directAll = directTracksInDir(child, tracks, folders, query);
    map[name] = {
      subtree,
      audio,
      audioCount: audio.length,
      duration,
      directAll,
      directAudio: directAll.filter((t) => t.type !== 'image'),
      directImages: directAll.filter((t) => t.type === 'image')
    };
  }
  return map;
}
