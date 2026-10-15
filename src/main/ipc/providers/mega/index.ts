import mega from 'megajs';
import type { ProviderRef, RemoteItem } from '../../../../shared/types/providers';
import type { Provider } from '../types';

// Provider MEGA (publiczne linki `mega.nz/file|folder/...`). Pliki są deszyfrowane po
// stronie klienta, więc zamiast URL-a provider zwraca GOTOWY strumień. Obsługuje zakresy
// bajtów (`file.download({start,end})`) → przewijanie. Drzewo folderu jest cache'owane.

const MEGA_RE = /^https?:\/\/(?:www\.)?mega\.nz\/(?:file|folder)\/[^\s]+/i;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 64;

interface MegaNode {
  name: string | null;
  size?: number;
  nodeId?: string;
  // Dla dzieci folderu udostępnionego megajs ustawia `downloadId = [rootDownloadId, handle]`
  // (nodeId NIE jest ustawiane) — handle to stabilny identyfikator.
  downloadId?: string | string[];
  directory: boolean;
  children?: MegaNode[];
  loadAttributes(): Promise<unknown>;
  download(options?: { start?: number; end?: number }): NodeJS.ReadableStream;
}

function stableId(node: MegaNode): string | undefined {
  if (Array.isArray(node.downloadId)) return node.downloadId[1];
  if (node.nodeId) return node.nodeId;
  return undefined;
}

interface RootEntry {
  root: MegaNode;
  index: Map<string, MegaNode>;
  at: number;
}

const rootCache = new Map<string, RootEntry>();

// Dla testów: czyści cache drzewa MEGA.
export function __resetMegaRootCache(): void {
  rootCache.clear();
}

async function loadRoot(url: string): Promise<RootEntry> {
  const now = Date.now();
  const cached = rootCache.get(url);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached;
  const root = mega.File.fromURL(url) as unknown as MegaNode;
  // Dla folderu udostępnionego MEGA zwraca CAŁE drzewo w jednym zapytaniu (`f` z `r:1`),
  // a megajs buduje relacje parent→children. NIE wolno wołać `loadAttributes()` na
  // dzieciach — ich `downloadId` to tablica i żądanie z `n=[array]` kończy się EARGS(-2).
  await root.loadAttributes();
  const entry: RootEntry = { root, index: indexTree(root), at: Date.now() };
  for (const [key, val] of rootCache) {
    if (now - val.at >= CACHE_TTL_MS) rootCache.delete(key);
  }
  while (rootCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = rootCache.keys().next().value;
    if (!oldest) break;
    rootCache.delete(oldest);
  }
  rootCache.set(url, entry);
  return entry;
}

function indexTree(root: MegaNode): Map<string, MegaNode> {
  const map = new Map<string, MegaNode>();
  const visit = (node: MegaNode): void => {
    const id = stableId(node);
    if (id) map.set(id, node);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return map;
}

function toItem(file: MegaNode, parentId: string | null, fallbackId: string): RemoteItem {
  const name = file.name || fallbackId;
  return {
    id: stableId(file) || name,
    name,
    kind: file.directory ? 'folder' : 'file',
    size: file.directory ? undefined : file.size,
    parentId
  };
}

export const megaProvider: Provider = {
  id: 'mega',
  label: 'MEGA',
  icon: 'mega',
  capabilities: {
    folders: true,
    thumbnails: false,
    anonymous: true,
    expiringLink: false,
    auth: 'none'
  },
  match: (url) => MEGA_RE.test(url),
  parse: (url) => {
    const m = MEGA_RE.exec(url);
    return m ? { provider: 'mega', shareId: m[0] } : null;
  },
  listFolder: async (ref: ProviderRef, folderId?: string): Promise<RemoteItem[]> => {
    const { root, index } = await loadRoot(ref.shareId);
    // Link do pojedynczego pliku: korzeń JEST plikiem.
    if (!root.directory) return [toItem(root, null, 'file')];
    if (!folderId) {
      return (root.children || [])
        .filter((c) => !!c.name)
        .map((c) => toItem(c, null, c.name || 'x'));
    }
    const dir = index.get(folderId);
    if (!dir || !dir.directory) throw new Error('Nie znaleziono folderu w linku MEGA');
    return (dir.children || [])
      .filter((c) => !!c.name)
      .map((c) => toItem(c, folderId, c.name || 'x'));
  },
  resolveFileUrl: async (ref: ProviderRef, itemId: string, range) => {
    const { root, index } = await loadRoot(ref.shareId);
    const file = root.directory ? index.get(itemId) : root;
    if (!file) throw new Error('Nie znaleziono pliku w linku MEGA');
    if (file.directory) throw new Error('Wybrany element to folder, nie plik');
    const stream = (range
      ? file.download({ start: range.start, end: range.end })
      : file.download()) as unknown as import('node:stream').Readable;
    return { stream, size: file.size };
  }
};
