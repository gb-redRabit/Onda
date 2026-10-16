import type { ProviderRef, RemoteItem } from '../../../../shared/types/providers';
import { PROVIDER_FETCH_TIMEOUT_MS, type Provider } from '../types';
import { throttleProvider } from '../provider-rate-limit';
import { getProviderCookie } from '../provider-credentials';

// Provider Google Drive.
// - Bez logowania: publiczne linki „anyone with link".
// - Z logowaniem (cookie Google z okna logowania lub sesji YouTube/Google): także pliki/foldery PRYWATNE.
// - Plik (`/file/d/<id>`): nazwa/rozmiar z Content-Disposition (Range 0).
// - Folder (`/drive/folders/<id>`): listowanie przez SCRAPE strony folderu.
//   To kruche — zależy od formatu `window['_DRIVE_ivd']` w HTML; gdy Google go zmieni, wróci błąd.

const DRIVE_RE = /^https?:\/\/(?:drive|docs)\.google\.com\//i;
const FOLDER_RE = /\/drive\/folders\/([a-zA-Z0-9_-]+)/;
const ID_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]+)/,
  /\/d\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/
];
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function extractDriveId(url: string): string | null {
  for (const re of ID_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function downloadUrl(id: string): string {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
}

function thumbnailUrl(id: string): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w300`;
}

async function fetchText(url: string, cookie?: string): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': UA, Accept: '*/*' };
  if (cookie) headers.Cookie = cookie;
  await throttleProvider('gdrive');
  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchFileMeta(
  id: string,
  cookie?: string
): Promise<{ name: string; size?: number }> {
  try {
    const headers: Record<string, string> = { Range: 'bytes=0-0', 'User-Agent': UA };
    if (cookie) headers.Cookie = cookie;
    await throttleProvider('gdrive');
    const res = await fetch(downloadUrl(id), {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS)
    });
    const disposition = res.headers.get('content-disposition') || '';
    const nameMatch = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
    const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/"/g, '').trim()) : '';
    const range = res.headers.get('content-range') || '';
    const size = Number(range.split('/')[1] || res.headers.get('content-length') || 0) || undefined;
    try {
      await res.body?.cancel();
    } catch {
      // ignoruj
    }
    return { name: name || `Drive-${id}`, size };
  } catch {
    return { name: `Drive-${id}` };
  }
}

interface ScrapedEntry {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  size?: unknown;
}

function toItem(entry: ScrapedEntry, parentId: string | null): RemoteItem | null {
  const id = typeof entry.id === 'string' ? entry.id : '';
  if (!id) return null;
  const isFolder = entry.mimeType === FOLDER_MIME;
  return {
    id,
    name: typeof entry.name === 'string' && entry.name ? entry.name : id,
    kind: isFolder ? 'folder' : 'file',
    size: isFolder ? undefined : Number(entry.size) || undefined,
    thumbnail: isFolder ? undefined : thumbnailUrl(id),
    parentId
  };
}

// Parsuje `window['_DRIVE_ivd']` (kolejność pól bywa różna — obsługujemy obiekty,
// tabelę z nagłówkiem oraz wiersze pozycyjne).
function parseDriveData(decoded: string, parentId: string | null): RemoteItem[] {
  let data: unknown;
  try {
    data = JSON.parse(decoded);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  if (data.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
    return data.map((o) => toItem(o as ScrapedEntry, parentId)).filter((x): x is RemoteItem => !!x);
  }

  if (Array.isArray(data[0]) && (data[0] as unknown[]).includes('id')) {
    const headers = data[0] as string[];
    const idx = (name: string) => headers.indexOf(name);
    const [idI, nameI, mimeI, sizeI] = [idx('id'), idx('name'), idx('mimeType'), idx('size')];
    return data
      .slice(1)
      .map((row) =>
        Array.isArray(row)
          ? toItem(
              { id: row[idI], name: row[nameI], mimeType: row[mimeI], size: row[sizeI] },
              parentId
            )
          : null
      )
      .filter((x): x is RemoteItem => !!x);
  }

  return data
    .map((row) =>
      Array.isArray(row)
        ? toItem({ id: row[0], name: row[1], mimeType: row[2], size: row[3] }, parentId)
        : null
    )
    .filter((x): x is RemoteItem => !!x);
}

async function listDriveFolder(folderId: string, cookie?: string): Promise<RemoteItem[]> {
  const html = await fetchText(`https://drive.google.com/drive/folders/${folderId}`, cookie);
  const match = /window\['_DRIVE_ivd'\]\s*=\s*'((?:\\.|[^'\\])*)'/.exec(html);
  if (!match) throw new Error('Nie udało się odczytać folderu Google Drive (zmiana strony?)');
  const decoded = match[1]
    .replace(/\\x([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
  return parseDriveData(decoded, folderId);
}

export const gdriveProvider: Provider = {
  id: 'gdrive',
  label: 'Google Drive',
  icon: 'gdrive',
  capabilities: {
    folders: true,
    thumbnails: true,
    anonymous: true,
    expiringLink: false,
    auth: 'none'
  },
  match: (url) => DRIVE_RE.test(url),
  parse: (url) => {
    const folder = url.match(FOLDER_RE);
    if (folder) return { provider: 'gdrive', shareId: `folder:${folder[1]}` };
    const id = extractDriveId(url);
    return id ? { provider: 'gdrive', shareId: id } : null;
  },
  listFolder: async (ref: ProviderRef, folderId?: string): Promise<RemoteItem[]> => {
    const cookie = await getProviderCookie('gdrive');
    if (ref.shareId.startsWith('folder:')) {
      const rootFolderId = ref.shareId.slice('folder:'.length);
      return listDriveFolder(folderId || rootFolderId, cookie);
    }
    const id = ref.shareId;
    const meta = await fetchFileMeta(id, cookie);
    return [
      {
        id,
        name: meta.name,
        kind: 'file',
        size: meta.size,
        thumbnail: thumbnailUrl(id),
        parentId: null
      }
    ];
  },
  resolveFileUrl: async (_ref: ProviderRef, itemId: string) => {
    // `itemId` to id pliku (dla linku pliku == shareId; dla pozycji w folderze == id pliku).
    // Gdy użytkownik zalogowany (cookie Google), dołączamy je — działają też pliki prywatne.
    const cookie = await getProviderCookie('gdrive');
    const headers: Record<string, string> = { 'User-Agent': UA };
    if (cookie) headers.Cookie = cookie;
    return { url: downloadUrl(itemId), headers };
  }
};
