import { isIP } from 'node:net';
import type { ProviderRef, RemoteItem } from '../../../shared/types/providers';
import { isLoopbackHost, isNonPublicAddress } from '../network-target';
import type { Provider } from './types';

// Bezpośrednie linki do plików (np. `https://host/path/file.mp4`) — pobierane 1:1
// bez yt-dlp. Matchuje tylko URL-e z rozpoznawalnym rozszerzeniem, więc nie przechwytuje
// linków stron (YouTube/SoundCloud/providerów). Odrzuca adresy loopback/prywatne.

const DIRECT_EXT =
  /\.(mp4|mkv|mov|webm|avi|ts|m2ts|flv|wmv|m4v|mp3|m4a|aac|flac|wav|ogg|opus|jpg|jpeg|png|gif|webp|avif|pdf|zip|rar|7z)(?:$|\?)/i;

function isValidDirectUrl(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed) || !DIRECT_EXT.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password || !u.hostname) return false;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (isLoopbackHost(host)) return false;
    if (isIP(host) && isNonPublicAddress(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    return base || u.hostname;
  } catch {
    return url;
  }
}

export const directProvider: Provider = {
  id: 'direct',
  label: 'Direct link',
  icon: 'link',
  capabilities: {
    folders: false,
    thumbnails: false,
    anonymous: true,
    expiringLink: false,
    auth: 'none'
  },
  match: (url) => isValidDirectUrl(url),
  parse: (url) => (isValidDirectUrl(url) ? { provider: 'direct', shareId: url.trim() } : null),
  listFolder: async (ref: ProviderRef): Promise<RemoteItem[]> => {
    if (!isValidDirectUrl(ref.shareId)) {
      throw new Error('Nieprawidłowy lub niedozwolony bezpośredni URL pliku');
    }
    return [
      {
        id: ref.shareId,
        name: fileNameFromUrl(ref.shareId),
        kind: 'file',
        parentId: null
      }
    ];
  },
  resolveFileUrl: async (ref: ProviderRef) => {
    if (!isValidDirectUrl(ref.shareId)) {
      throw new Error('Nieprawidłowy lub niedozwolony bezpośredni URL pliku');
    }
    return { url: ref.shareId };
  }
};
