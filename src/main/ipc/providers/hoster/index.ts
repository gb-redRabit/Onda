import type { ProviderRef, RemoteItem } from '../../../../shared/types/providers';
import type { Provider } from '../types';
import { inspectHoster } from './ytdlp-resolve';

// Hostery obsługiwane przez yt-dlp: Dropbox, Yandex.Disk, Internet Archive.
// `listFolder` i `resolveFileUrl` korzystają ze wspólnego resolvera (`-J`).

function makeHosterProvider(cfg: {
  id: string;
  label: string;
  icon: string;
  match: RegExp;
}): Provider {
  return {
    id: cfg.id,
    label: cfg.label,
    icon: cfg.icon,
    capabilities: {
      folders: false,
      thumbnails: false,
      anonymous: true,
      expiringLink: false,
      auth: 'none'
    },
    match: (url) => cfg.match.test(url),
    parse: (url) => (cfg.match.test(url) ? { provider: cfg.id, shareId: url.trim() } : null),
    listFolder: async (ref: ProviderRef): Promise<RemoteItem[]> => {
      if (!cfg.match.test(ref.shareId)) {
        throw new Error(`Nieprawidłowy link ${cfg.label}`);
      }
      const entries = await inspectHoster(ref.shareId);
      return entries.map((e) => ({
        id: e.id,
        name: e.title,
        kind: 'file',
        size: e.size,
        parentId: null
      }));
    },
    resolveFileUrl: async (ref: ProviderRef, itemId: string) => {
      if (!cfg.match.test(ref.shareId)) {
        throw new Error(`Nieprawidłowy link ${cfg.label}`);
      }
      const entries = await inspectHoster(ref.shareId);
      const match = entries.find((e) => e.id === itemId) ?? entries[0];
      if (!match) throw new Error('Nie znaleziono pliku pod tym linkiem');
      return { url: match.url };
    }
  };
}

export const dropboxProvider = makeHosterProvider({
  id: 'dropbox',
  label: 'Dropbox',
  icon: 'dropbox',
  match: /^https?:\/\/(?:www\.)?dropbox\.com\//i
});

export const yandexProvider = makeHosterProvider({
  id: 'yandex',
  label: 'Yandex.Disk',
  icon: 'yandex',
  match: /^https?:\/\/(?:www\.)?(?:disk\.yandex\.[a-z]+|yadi\.sk)\//i
});

export const archiveProvider = makeHosterProvider({
  id: 'archive',
  label: 'Internet Archive',
  icon: 'archive',
  match: /^https?:\/\/(?:www\.)?archive\.org\/(?:details|download)\//i
});
