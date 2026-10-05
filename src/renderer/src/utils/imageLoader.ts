// Bazowy URL serwera mediów jest pobierany raz asynchronicznie (invoke) i cache'owany
// tutaj, więc `toMediaServerUrl`/`toMediaStreamUrl` pozostają synchroniczne dla
// ~35 miejsc wywołań. Bootstrap renderera czeka na `ensureMediaServerUrl()` przed
// montowaniem, więc wartość jest dostępna zanim cokolwiek zażąda URL-a.
let cachedBase = '';
let basePromise: Promise<string> | null = null;

export function ensureMediaServerUrl(): Promise<string> {
  if (cachedBase) return Promise.resolve(cachedBase);
  if (basePromise) return basePromise;
  basePromise = (async () => {
    try {
      cachedBase = (await window.api?.getMediaServerUrl()) || '';
    } catch {
      cachedBase = '';
    }
    basePromise = null;
    return cachedBase;
  })();
  return basePromise;
}

/** Synchroniczny odczyt dla ścieżek krytycznych; może być '' przed `ensure…`. */
export function mediaServerBase(): string {
  return cachedBase;
}

/** Reset cache'u — tylko dla testów (po podmianie `window.api`). */
export function __resetMediaServerCache(): void {
  cachedBase = '';
  basePromise = null;
}

export function toMediaServerUrl(filePath: string): string {
  return `${cachedBase}/?path=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}

// Zdalne (YouTube online) strumienie audio są proxowane przez media server,
// więc renderer rozmawia wyłącznie z 127.0.0.1, a URL strumienia nigdy nie
// trafia do własnego stosu sieciowego strony (patrz /stream w media-server.ts).
export function toMediaStreamUrl(remoteUrl: string): string {
  return `${cachedBase}/stream?url=${encodeURIComponent(remoteUrl)}`;
}

export function loadScaledImageUrl(filePath: string, maxWidth: number = 1920): Promise<string> {
  return fetch(`onda:///?path=${encodeURIComponent(filePath)}&w=${maxWidth}`)
    .then((resp) => {
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.blob();
    })
    .then((blob) => URL.createObjectURL(blob));
}
