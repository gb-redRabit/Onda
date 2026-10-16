import type { ProviderRef, RemoteItem } from '../../../../shared/types/providers';
import { logger } from '../../../../shared/logger';
import type { Provider } from '../types';
import {
  getProviderCookie,
  getProviderRefresh,
  getProviderToken,
  setProviderToken
} from '../provider-credentials';
import { PikPakClient, PIKPAK_UA } from './pikpak-client';

// Provider PikPak: udostępnienia `/s/<shareId>` → foldery/pliki.
// Domyślnie anonimowo; jeśli użytkownik zalogował się kontem PikPak (token w localStorage,
// wysyłany jako Bearer), działa zalogowane API.
// - Listowanie/odtwarzanie: najlepsza DOSTĘPNA rendition (Original bywa quota-gated).
// - POBIERANIE: próbujemy oryginału przez „转存" (zapis na dysk → link → usunięcie kopii
//   po pobraniu), bo sam share może ograniczać jakość quota. Wymaga wolnego miejsca.
// Bezpośredni URL jest podpisany i wygasa, więc rozwiązywany jest na żądanie.

const SHARE_RE = /^https?:\/\/(?:www\.)?mypikpak\.(?:com|net)\/s\/([^/?#]+)/i;

let client: PikPakClient | null = null;
function getClient(): PikPakClient {
  if (!client) client = new PikPakClient();
  return client;
}

// Tymczasowe kopie z „转存" czekające na usunięcie po zakończeniu pobrania.
const restoredDriveFiles = new Map<string, string>();
const keyOf = (ref: ProviderRef, itemId: string): string => `${ref.shareId}:${itemId}`;

async function applyAuth(c: PikPakClient): Promise<{ cookie: string }> {
  const cookie = await getProviderCookie('pikpak');
  c.setCookie(cookie);
  let token = await getProviderToken('pikpak');
  // Token wygasł → spróbuj odświeżyć przez refresh_token (best-effort).
  if (!token) {
    const refresh = await getProviderRefresh('pikpak');
    if (refresh) {
      try {
        const fresh = await c.refreshAccessToken(refresh);
        if (fresh) {
          await setProviderToken('pikpak', fresh);
          token = fresh;
        }
      } catch (e) {
        logger.warn('providers', 'pikpak token refresh failed', e);
      }
    }
  }
  c.setAccessToken(token);
  return { cookie };
}

function downloadHeaders(cookie: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': PIKPAK_UA,
    Referer: 'https://mypikpak.com/'
  };
  if (cookie) headers.Cookie = cookie;
  return headers;
}

export const pikpakProvider: Provider = {
  id: 'pikpak',
  label: 'PikPak',
  icon: 'pikpak',
  capabilities: {
    folders: true,
    thumbnails: true,
    anonymous: true,
    expiringLink: true,
    auth: 'none'
  },
  match: (url) => SHARE_RE.test(url),
  parse: (url) => {
    const m = SHARE_RE.exec(url);
    return m ? { provider: 'pikpak', shareId: m[1] } : null;
  },
  listFolder: async (ref: ProviderRef, folderId?: string): Promise<RemoteItem[]> => {
    const c = getClient();
    await applyAuth(c);
    const entries = await c.listFolder(ref.shareId, folderId ?? '');
    return entries
      .filter((e) => typeof e.id === 'string' && typeof e.name === 'string')
      .map((e) => {
        const isFolder = e.kind === 'drive#folder';
        return {
          id: e.id as string,
          name: e.name as string,
          kind: isFolder ? 'folder' : 'file',
          size: isFolder ? undefined : parseInt(e.size || '0', 10) || 0,
          thumbnail: e.thumbnail_link || e.web_thumbnail_link || undefined,
          parentId: folderId ?? ''
        } satisfies RemoteItem;
      });
  },
  resolveFileUrl: async (ref: ProviderRef, itemId: string, _range, forDownload, onStatus) => {
    const c = getClient();
    const { cookie } = await applyAuth(c);
    const headers = downloadHeaders(cookie);

    // POBIERANIE: najpierw „转存" (kopia na dysk) → pobierz ORYGINAŁ → usuń kopię po pobraniu.
    // Sam link share bywa tylko przetworzony (720P/480P); oryginał daje własny dysk.
    if (forDownload && c.hasAccessToken()) {
      try {
        const meta = await c.getShareFileMeta(ref.shareId, itemId);
        onStatus?.('downloads.statusSaving');
        logger.info('providers', 'pikpak: „转存" — kopiuję na dysk…');
        const driveId = await c.restoreToDrive(ref.shareId, itemId, meta.name);
        onStatus?.('downloads.statusWaiting');
        logger.info('providers', `pikpak: restore file_id=${driveId}, czekam na gotowość pliku…`);
        const url = await c.waitDriveFileUrl(driveId);
        if (url) {
          logger.info('providers', 'pikpak: oryginał gotowy — start pobierania');
          restoredDriveFiles.set(keyOf(ref, itemId), driveId);
          return { url, headers };
        }
        logger.warn(
          'providers',
          'pikpak: „转存" nie zmaterializował pliku — fallback do renditions'
        );
        await c.cleanupDriveFiles([driveId]);
      } catch (e) {
        logger.warn('providers', 'pikpak restore failed, falling back', e);
      }
    }

    // Odtwarzanie / brak logowania / nieudany „转存" → najlepsza dostępna rendition.
    onStatus?.('downloads.statusChecking');
    const url = await c.getFileInfo(ref.shareId, itemId);
    return { url, headers };
  },
  onDownloadSettled: async (ref: ProviderRef, itemId: string): Promise<void> => {
    const k = keyOf(ref, itemId);
    const driveId = restoredDriveFiles.get(k);
    if (!driveId) return;
    restoredDriveFiles.delete(k);
    try {
      const c = getClient();
      await applyAuth(c);
      await c.cleanupDriveFiles([driveId]);
    } catch (e) {
      logger.warn('providers', 'pikpak drive cleanup failed', e);
    }
  }
};
