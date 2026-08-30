import { canonicalPath, dirname } from './path';
import type { MediaFile } from '@renderer/types/media';

interface LibraryIndex {
  childMap: Map<string, Set<string>>;
  directMap: Map<string, MediaFile[]>;
  allMap: Map<string, MediaFile[]>;
  sig: string;
}

let cached: LibraryIndex | null = null;
let lastSig = '';

function buildSig(tracks: MediaFile[], folders: string[]): string {
  let h = 0x811c9dc5;
  for (const t of tracks) {
    const p = t.path;
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
  }
  return `t:${tracks.length}|h:${h}|f:${folders.join('|')}`;
}

export function getLibraryIndex(tracks: MediaFile[], folders: string[]): LibraryIndex {
  const sig = buildSig(tracks, folders);
  if (cached && lastSig === sig) return cached;
  const childMap = new Map<string, Set<string>>();
  const directMap = new Map<string, MediaFile[]>();
  const allMap = new Map<string, MediaFile[]>();

  // build directMap and allMap
  for (const tr of tracks) {
    const dir = canonicalPath(dirname(tr.path));
    if (!directMap.has(dir)) directMap.set(dir, []);
    directMap.get(dir)!.push(tr);
    // allMap for each ancestor folder that is in library.folders or is parent of file
    let cur = dir;
    while (cur && cur !== '/' && cur !== '.') {
      if (!allMap.has(cur)) allMap.set(cur, []);
      allMap.get(cur)!.push(tr);
      const idx = cur.lastIndexOf('/');
      if (idx <= 0) break;
      cur = cur.slice(0, idx) || '/';
    }
  }

  // childMap — dla każdego pliku dorzuć wszystkich przodków
  for (const tr of tracks) {
    let cur = canonicalPath(dirname(canonicalPath(tr.path)));
    while (cur && cur !== '/' && cur !== '.') {
      const parent = cur.slice(0, cur.lastIndexOf('/')) || '/';
      const childName = cur.slice(parent === '/' ? 1 : parent.length + 1);
      if (childName) {
        if (!childMap.has(parent)) childMap.set(parent, new Set());
        childMap.get(parent)!.add(childName);
      }
      if (parent === '/' || parent === cur) break;
      cur = parent;
    }
  }

  cached = { childMap, directMap, allMap, sig };
  lastSig = sig;
  return cached;
}

export function getChildDirsIndexed(dir: string, tracks: MediaFile[], folders: string[]): string[] {
  const idx = getLibraryIndex(tracks, folders);
  const key = canonicalPath(dir);
  const set = idx.childMap.get(key);
  if (!set) return [];
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function getDirectTracksIndexed(dir: string, tracks: MediaFile[], folders: string[]): MediaFile[] {
  const idx = getLibraryIndex(tracks, folders);
  return idx.directMap.get(canonicalPath(dir)) ?? [];
}

export function getAllTracksIndexed(dir: string, tracks: MediaFile[], folders: string[]): MediaFile[] {
  const idx = getLibraryIndex(tracks, folders);
  return idx.allMap.get(canonicalPath(dir)) ?? [];
}
