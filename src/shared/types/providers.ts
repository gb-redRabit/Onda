// Typy współdzielone dla „providerów" linków w widoku Online (PikPak, MEGA, Drive…).
// Wykorzystywane przez IPC (renderer ↔ main) oraz przez resolver w procesie głównym.

export type ProviderId = string;

// Możliwości serwera — dobierają zachowanie UI (foldery, miniatury, ostrzeżenie o wygasaniu).
// Wyboru jakości nie ma z założenia dla źródeł plikowych (pobieranie 1:1).
export interface ProviderCapabilities {
  folders: boolean;
  thumbnails: boolean;
  anonymous: boolean;
  expiringLink: boolean;
  auth: 'none' | 'cookie' | 'oauth' | 'token';
}

export interface ProviderDetectResult {
  id: ProviderId;
  label: string;
  icon: string;
  capabilities: ProviderCapabilities;
  // Stabilny ref udostępnienia (provider + shareId) — potrzebny do listowania i pobierania.
  ref: ProviderRef;
}

// Stabilny identyfikator udostępnienia/źródła. `shareId` jest jedynym wymaganym polem;
// providerzy mogą dokładać własne (np. `parentId`), ale na potrzeby IPC trzymamy string.
export interface ProviderRef {
  provider: ProviderId;
  shareId: string;
}

export interface RemoteItem {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  size?: number;
  thumbnail?: string;
  parentId?: string | null;
}

// Subskrypcja LINKU providera (jak kanał): zapisuje stabilny ref, więc zawartość
// odświeżana jest bez ponownego wklejania. Linki udostępniania mogą WYGASNĄĆ — stąd status.
export interface RemoteSubscription {
  id: string;
  providerId: ProviderId;
  ref: ProviderRef;
  // Oryginalny wklejony URL — do ponownego otwarcia i podmiany przy wygaśnięciu.
  url: string;
  title: string;
  addedAt: number;
  lastCheckedAt?: number;
  status: 'ok' | 'expired' | 'error';
  downloadedItemIds?: string[];
  // Wykrywanie nowych pozycji (auto-check): ostatnio widziane id elementów + liczba nowych.
  seenItemIds?: string[];
  newCount?: number;
}

export interface RemoteSubscriptionInput {
  url: string;
  title?: string;
}

export interface RemoteSubscriptionPatch {
  title?: string;
  status?: 'ok' | 'expired' | 'error';
  lastCheckedAt?: number;
  downloadedItemIds?: string[];
  // Podmiana wygasłego linku: nowy URL + jego ref (po re-detekcji).
  url?: string;
  ref?: ProviderRef;
  // Wykrywanie nowych pozycji (auto-check).
  seenItemIds?: string[];
  newCount?: number;
}
