import type { Readable } from 'node:stream';
import type {
  ProviderCapabilities,
  ProviderId,
  ProviderRef,
  RemoteItem
} from '../../../shared/types/providers';

// Kontrakt providera w procesie głównym. Rejestr (`registry.ts`) dobiera providera po URL,
// a warstwa pobierania używa `resolveFileUrl` do ŚWIEŻEGO rozwiązania linku przy każdej próbie.

export interface ProviderResolveResult {
  // Providerzy z publicznym, podpisanym URL (PikPak, Drive) zwracają `url`.
  url?: string;
  headers?: Record<string, string>;
  // Providerzy deszyfrujący po stronie klienta (MEGA) zwracają gotowy strumień (nie IPC —
  // używany tylko wewnątrz procesu głównego przez download-attempt).
  stream?: Readable;
  size?: number;
}

export interface ProviderByteRange {
  start: number;
  end?: number;
}

export interface Provider {
  id: ProviderId;
  label: string;
  icon: string;
  capabilities: ProviderCapabilities;
  match(url: string): boolean;
  parse(url: string): ProviderRef | null;
  listFolder(ref: ProviderRef, folderId?: string): Promise<RemoteItem[]>;
  resolveFileUrl(
    ref: ProviderRef,
    itemId: string,
    range?: ProviderByteRange,
    // true = wywołanie z pobierania (nie odtwarzania); provider może wtedy wykonać akcje
    // jednorazowe, np. PikPak „转存" (zapis na dysk, by pobrać oryginał).
    forDownload?: boolean,
    // Zgłasza fazę przygotowania (klucz i18n) — pokazywane w wierszu pobierania.
    onStatus?: (messageKey: string) => void
  ): Promise<ProviderResolveResult>;
  // Sprzątanie po zakończeniu pobierania (sukces LUB porażka). Np. PikPak usuwa
  // tymczasową kopię z dysku (trwale, by zwolnić miejsce).
  onDownloadSettled?(ref: ProviderRef, itemId: string): Promise<void>;
}

export const GDRIVE_DOMAINS = ['drive.google.com', 'googleusercontent.com', 'google.com'];

// Górny limit pojedynczego żądania HTTP providera. Zawieszone połączenie TCP
// (częste przy serwerach spoza regionu) inaczej blokowałoby `providers:list`,
// `remote-subs-checker` (`running` latch) czy rozwiązywanie URL bez końca.
export const PROVIDER_FETCH_TIMEOUT_MS = 30_000;

export function domainMatches(cookieDomain: string, target: string): boolean {
  const clean = cookieDomain.replace(/^\./, '').toLowerCase();
  return clean === target || clean.endsWith(`.${target}`);
}
