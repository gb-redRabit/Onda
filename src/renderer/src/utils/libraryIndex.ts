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

// Tania sygnatura zmian. Stara wersja hashowała ponownie każdą ścieżkę utworu przy
// każdym wywołaniu (O(N) na odczyt indeksu — a DirNode woła to wiele razy na renderowany
// wiersz). Tożsamość tablicy wychwytuje każde zastąpienie (load/scan/filter), a długość
// wychwytuje push w miejscu (addTrack); foldery są łączone (małe).
const arrIds = new WeakMap<object, number>();
let nextArrId = 1;
function arrayId(a: object): number {
  let id = arrIds.get(a);
  if (id === undefined) {
    id = nextArrId++;
    arrIds.set(a, id);
  }
  return id;
}

function buildSig(tracks: MediaFile[], folders: string[]): string {
  return `a:${arrayId(tracks)}|n:${tracks.length}|f:${folders.join('|')}`;
}

export function getLibraryIndex(tracks: MediaFile[], folders: string[]): LibraryIndex {
  const sig = buildSig(tracks, folders);
  if (cached && lastSig === sig) return cached;
  const childMap = new Map<string, Set<string>>();
  const directMap = new Map<string, MediaFile[]>();
  const allMap = new Map<string, MediaFile[]>();

  // zbuduj directMap i allMap
  for (const tr of tracks) {
    const dir = canonicalPath(dirname(tr.path));
    if (!directMap.has(dir)) directMap.set(dir, []);
    directMap.get(dir)!.push(tr);
    // allMap dla każdego folderu przodka, który jest w library.folders lub jest rodzicem pliku
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

export function getDirectTracksIndexed(
  dir: string,
  tracks: MediaFile[],
  folders: string[]
): MediaFile[] {
  const idx = getLibraryIndex(tracks, folders);
  return idx.directMap.get(canonicalPath(dir)) ?? [];
}

export function getAllTracksIndexed(
  dir: string,
  tracks: MediaFile[],
  folders: string[]
): MediaFile[] {
  const idx = getLibraryIndex(tracks, folders);
  return idx.allMap.get(canonicalPath(dir)) ?? [];
}
