import type { ProviderRef, RemoteItem } from '../../../../shared/types/providers';
import { PROVIDER_FETCH_TIMEOUT_MS, type Provider } from '../types';
import { throttleProvider } from '../provider-rate-limit';
import { getProviderCookie } from '../provider-credentials';

// Provider 123云盘. EKSPERYMENTALNY (niepubliczne API share). Polega na shareKey + opcjonalnym
// haśle. Pola odpowiedzi bywają różne (InfoList/FileName/Type/Size). Spike: scripts/123pan-spike.mjs.

const HOST_RE =
  /^https?:\/\/(?:www\.)?(?:123pan\.com|123684\.com|123865\.com|123912\.com|123pan\.cn|123pan\.cc)\//i;
const SHARE_RE = /\/s\/([^/?#]+)/;
const API = 'https://www.123pan.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface Item123 {
  FileId?: number | string;
  fileId?: number | string;
  FileName?: string;
  fileName?: string;
  Type?: number | string;
  Size?: number | string;
  size?: number | string;
}

function idOf(e: Item123): string {
  return String(e.FileId ?? e.fileId ?? '');
}
function nameOf(e: Item123): string {
  return String(e.FileName ?? e.fileName ?? '');
}
function sizeOf(e: Item123): number {
  return Number(e.Size ?? e.size) || 0;
}
function isDir(e: Item123): boolean {
  return e.Type === 1 || e.Type === '1';
}

function headers(cookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    Referer: `${API}/`
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

async function getJson<T>(url: string, cookie?: string): Promise<T> {
  await throttleProvider('123pan');
  const res = await fetch(url, {
    headers: headers(cookie),
    signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS)
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* nie-JSON */
  }
  if (!res.ok) throw new Error(`123pan HTTP ${res.status}`);
  return data as T;
}

function toItem(e: Item123, parentId: string | null): RemoteItem | null {
  const id = idOf(e);
  if (!id) return null;
  const dir = isDir(e);
  return {
    id,
    name: nameOf(e) || id,
    kind: dir ? 'folder' : 'file',
    size: dir ? undefined : sizeOf(e),
    parentId
  };
}

export const pan123Provider: Provider = {
  id: '123pan',
  label: '123云盘',
  icon: '123pan',
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
    if (!m) return null;
    let pwd = '';
    try {
      pwd = new URL(url).searchParams.get('pwd') || '';
    } catch {
      /* brak hasła */
    }
    return { provider: '123pan', shareId: pwd ? `${m[1]}#${pwd}` : m[1] };
  },
  listFolder: async (ref: ProviderRef, folderId?: string): Promise<RemoteItem[]> => {
    const [id, pwd = ''] = ref.shareId.split('#');
    const cookie = await getProviderCookie('123pan');
    const q = new URLSearchParams({ shareKey: id, sharePwd: pwd });
    if (folderId) q.set('parentFileId', folderId);
    const data = await getJson<{
      code?: number;
      message?: string;
      data?: { InfoList?: Item123[]; infoList?: Item123[] };
    }>(`${API}/api/share/get?${q.toString()}`, cookie);
    if (data?.code && data.code !== 0) {
      throw new Error(
        `123pan code ${data.code}: ${data.message || 'link wygasł lub wymaga hasła'}`
      );
    }
    const list = data?.data?.InfoList || data?.data?.infoList || [];
    return list.map((e) => toItem(e, folderId ?? null)).filter((x): x is RemoteItem => !!x);
  },
  resolveFileUrl: async (ref: ProviderRef, itemId: string) => {
    const [id, pwd = ''] = ref.shareId.split('#');
    const cookie = await getProviderCookie('123pan');
    await throttleProvider('123pan');
    const res = await fetch(`${API}/api/share/download/info`, {
      method: 'POST',
      headers: {
        ...headers(cookie),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shareKey: id,
        fileId: itemId,
        sharePwd: pwd,
        DownloadType: '',
        etag: ''
      }),
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS)
    });
    const text = await res.text();
    let data: { code?: number; data?: { DownloadUrl?: string; downloadUrl?: string } } | null =
      null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* nie-JSON */
    }
    const url = data?.data?.DownloadUrl || data?.data?.downloadUrl;
    if (!url) throw new Error('123pan: brak URL pobierania (może wymagać logowania)');
    return { url, headers: headers(cookie) };
  }
};
