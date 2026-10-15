import type { ProviderRef, RemoteItem } from '../../../../shared/types/providers';
import type { Provider } from '../types';
import { throttleProvider } from '../provider-rate-limit';

// Provider TeraBox (dawniej Baidu Netdisk international). EKSPERYMENTALNY: oparty na
// niepublicznym API share (shorturlinfo/list/download). Publiczne linki zwykle działają
// anonimowo, ale przepływ bywa kruchy (sign/timestamp, zmiany pól). Zweryfikuj na żywo
// skryptem `scripts/terabox-spike.mjs`.

const DOMAINS = [
  'terabox.com',
  'teraboxapp.com',
  '1024terabox.com',
  'dubox.com',
  'freeterabox.com',
  'momerybox.com',
  'tibibox.com',
  '4funbox.com',
  'mirrobox.com',
  'nephobox.com'
];
const HOST_RE = new RegExp(
  `^https?://(?:www\\.)?(?:${DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|')})/`,
  'i'
);
const SHARE_RE = /\/s\/([^/?#]+)/;
const APP_ID = '250528';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.terabox.com';
const HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  Referer: `${BASE}/`
};

interface TbEntry {
  fs_id?: number | string;
  server_filename?: string;
  filename?: string;
  size?: number | string;
  isdir?: number | string | boolean;
  path?: string;
}

async function getJson<T>(url: string): Promise<T> {
  await throttleProvider('terabox');
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function nameOf(e: TbEntry): string {
  return String(e.server_filename ?? e.filename ?? e.fs_id ?? '');
}

function isDir(e: TbEntry): boolean {
  const v = e.isdir;
  return v === 1 || v === '1' || v === true;
}

// Mapa `fs_id` folderu → jego ścieżka `path` (np. `2` → `/sub`). UI nawiguje po `item.id`
// (`fs_id`), natomiast endpoint `/share/list` wymaga ścieżki `dir=/sub`.
const folderPathById = new Map<string, string>();

function toItem(e: TbEntry, parentId: string | null): RemoteItem | null {
  const id = e.fs_id != null ? String(e.fs_id) : '';
  if (!id) return null;
  const dir = isDir(e);
  if (dir) {
    const path = e.path || (e.server_filename ? `/${e.server_filename.replace(/^\/+/, '')}` : '');
    if (path) folderPathById.set(id, path);
  }
  return {
    id,
    name: nameOf(e) || id,
    kind: dir ? 'folder' : 'file',
    size: dir ? undefined : Number(e.size) || undefined,
    parentId
  };
}

interface ShortInfo {
  errno?: number;
  sign?: string;
  timestamp?: number | string;
  list?: TbEntry[];
}

async function shortInfo(shareId: string): Promise<ShortInfo> {
  return getJson<ShortInfo>(
    `${BASE}/api/shorturlinfo?app_id=${APP_ID}&shorturl=${encodeURIComponent(shareId)}&root=1&web=1`
  );
}

async function listDir(
  shareId: string,
  sign: string | undefined,
  timestamp: number | string | undefined,
  dir: string
): Promise<TbEntry[]> {
  const q = new URLSearchParams({
    app_id: APP_ID,
    shorturl: shareId,
    root: '1',
    dir,
    web: '1'
  });
  if (sign) q.set('sign', sign);
  if (timestamp != null) q.set('timestamp', String(timestamp));
  const data = await getJson<{ errno?: number; list?: TbEntry[] }>(
    `${BASE}/share/list?${q.toString()}`
  );
  return data.list || [];
}

async function resolveDlink(
  sign: string | undefined,
  timestamp: number | string | undefined,
  fsId: string
): Promise<string> {
  const q = new URLSearchParams({
    app_id: APP_ID,
    web: '1',
    channel: 'dubox',
    clienttype: '0'
  });
  if (sign) q.set('sign', sign);
  if (timestamp != null) q.set('timestamp', String(timestamp));
  q.set('fidlist', `[${fsId}]`);
  const data = await getJson<{
    errno?: number;
    dlink?: string | Array<{ dlink?: string }>;
  }>(`${BASE}/api/download?${q.toString()}`);
  const dl = data.dlink;
  if (typeof dl === 'string') return dl;
  if (Array.isArray(dl) && dl[0]?.dlink) return dl[0].dlink;
  throw new Error('TeraBox: brak linku pobierania');
}

export const teraboxProvider: Provider = {
  id: 'terabox',
  label: 'TeraBox',
  icon: 'terabox',
  capabilities: {
    folders: true,
    thumbnails: false,
    anonymous: true,
    expiringLink: true,
    auth: 'none'
  },
  match: (url) => HOST_RE.test(url) && SHARE_RE.test(url),
  parse: (url) => {
    if (!HOST_RE.test(url)) return null;
    const m = SHARE_RE.exec(url);
    return m ? { provider: 'terabox', shareId: m[1] } : null;
  },
  listFolder: async (ref: ProviderRef, folderId?: string): Promise<RemoteItem[]> => {
    if (!folderId) {
      const info = await shortInfo(ref.shareId);
      if (info.errno && info.errno !== 0) {
        throw new Error(`TeraBox errno ${info.errno} (link wygasł lub wymaga hasła)`);
      }
      return (info.list || []).map((e) => toItem(e, null)).filter((x): x is RemoteItem => !!x);
    }
    // `folderId` może być już ścieżką (`/sub`) albo `fs_id` folderu klikniętego w UI.
    const dirPath = folderId.startsWith('/')
      ? folderId
      : folderPathById.get(folderId) || `/${folderId}`;
    const info = await shortInfo(ref.shareId);
    const list = await listDir(ref.shareId, info.sign, info.timestamp, dirPath);
    return list.map((e) => toItem(e, folderId)).filter((x): x is RemoteItem => !!x);
  },
  resolveFileUrl: async (ref: ProviderRef, itemId: string) => {
    const info = await shortInfo(ref.shareId);
    const url = await resolveDlink(info.sign, info.timestamp, itemId);
    return { url, headers: { Referer: `${BASE}/`, 'User-Agent': UA } };
  }
};
