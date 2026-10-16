import type {
  ProviderDetectResult,
  ProviderRef,
  RemoteItem
} from '../../../shared/types/providers';
import type { Provider, ProviderByteRange, ProviderResolveResult } from './types';
import {
  getCachedFileUrl,
  getCachedFolder,
  setCachedFileUrl,
  setCachedFolder
} from './provider-cache';
import { pikpakProvider } from './pikpak';
import { megaProvider } from './mega';
import { gdriveProvider } from './gdrive';
import { teraboxProvider } from './terabox';
import { pan123Provider } from './pan123';
import { dropboxProvider, yandexProvider, archiveProvider } from './hoster';
import { directProvider } from './direct';

// Rejestr providerów linków. Dodanie serwisu = dopisanie go tutaj (obsługa w UI
// i pobieraniu jest generyczna). Kolejność ma znaczenie dla detekcji — `direct`
// (dowolny plik po rozszerzeniu) MUSI być ostatni.
const PROVIDERS: Provider[] = [
  pikpakProvider,
  megaProvider,
  gdriveProvider,
  teraboxProvider,
  pan123Provider,
  dropboxProvider,
  yandexProvider,
  archiveProvider,
  directProvider
];

export function detectProvider(url: string): ProviderDetectResult | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const provider = PROVIDERS.find((p) => p.match(url));
  if (!provider) return null;
  const ref = provider.parse(url);
  if (!ref) return null;
  return {
    id: provider.id,
    label: provider.label,
    icon: provider.icon,
    capabilities: provider.capabilities,
    ref
  };
}

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// Providery wymagające logowania (do ekranu poświadczeń w Ustawieniach).
export function listProvidersRequiringAuth(): Array<{ id: string; label: string; icon: string }> {
  return PROVIDERS.filter((p) => p.capabilities.auth !== 'none').map((p) => ({
    id: p.id,
    label: p.label,
    icon: p.icon
  }));
}

export async function listProviderFolder(
  ref: ProviderRef,
  folderId?: string,
  force = false
): Promise<RemoteItem[]> {
  const provider = getProvider(ref.provider);
  if (!provider) throw new Error(`Nieznany provider: ${ref.provider}`);
  const key = `${ref.provider}:${ref.shareId}:${folderId ?? ''}`;
  if (!force) {
    const cached = await getCachedFolder(key);
    if (cached) return cached;
  }
  const items = await provider.listFolder(ref, folderId);
  await setCachedFolder(key, items);
  return items;
}

// Sprzątanie po zakończeniu pobierania (sukces/porażka) — np. PikPak usuwa tymczasową
// kopię z dysku. Brak metody u providera = brak akcji.
export async function settleProviderDownload(ref: ProviderRef, itemId: string): Promise<void> {
  const provider = getProvider(ref.provider);
  await provider?.onDownloadSettled?.(ref, itemId);
}

export async function resolveProviderFileUrl(
  providerId: string,
  ref: ProviderRef,
  itemId: string,
  range?: ProviderByteRange,
  forDownload = false,
  onStatus?: (messageKey: string) => void
): Promise<ProviderResolveResult> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Nieznany provider: ${providerId}`);
  // Cache tylko dla odtwarzania/prezentacji (bez zakresu, bez pobierania) — pobranie
  // zawsze rozwiązuje świeży link (np. PikPak „转存").
  const cacheable = !range && !forDownload && !onStatus;
  const key = `${providerId}:${ref.shareId}:${itemId}`;
  if (cacheable) {
    const cached = await getCachedFileUrl(key);
    if (cached) return cached;
  }
  const res = await provider.resolveFileUrl(ref, itemId, range, forDownload, onStatus);
  if (cacheable && res.url && !res.stream) {
    await setCachedFileUrl(key, res.url, res.headers);
  }
  return res;
}
