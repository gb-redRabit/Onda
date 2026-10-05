import { shallowRef, triggerRef } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { captureVideoFrame, type CoverResult } from '@renderer/utils/videoFrameCapture';
import { useLibraryStore } from './library';
import { useSettingsStore } from './settings';

export type { CoverResult };

// Utwory strumieniowe (YouTube/SoundCloud/radio) używają zdalnych URL-i http(s) jako
// ścieżki — main odrzuca je jako "unsafe path" w media:getCover, a prawdziwą okładkę
// dostają wyłącznie przez seedowanie miniatury w enrichTrack. Nigdy nie kolejkuj
// ich ani nie wysyłaj przez IPC; pudło w cache degraduje się do zastępczej ikony.
function isRemoteUrl(filePath: string): boolean {
  return /^https?:\/\//i.test(filePath) || filePath.startsWith('//');
}

export function usePlayerCover() {
  const coverCache = shallowRef<Record<string, CoverResult>>({});
  const coverQueue: string[] = [];
  const coverSealedAt = new Map<string, number>();
  // Kolejność ostatniego dostępu do wpisu cache — eviction usuwa NAJMNIEJ ostatnio
  // używane, a nie najstarsze wstawione (FIFO wyrzucało często oglądane okładki,
  // trzymając nieaktualne).
  const coverLastUsed = new Map<string, number>();
  let coverAccessClock = 0;
  function touchCover(path: string): void {
    coverLastUsed.set(path, ++coverAccessClock);
  }
  let coverFlushScheduled = false;
  let coverProcessing = false;
  const COVER_CACHE_MAX = 500;
  // Wynik "brak okładki" jest buforowany krótko (tanio — main zwraca natychmiast z
  // własnego cache w pamięci) i sondowany ponownie później, więc przejściowy błąd IPC lub
  // plik chwilowo nieobecny nigdy nie zatrują cache.
  const NULL_COVER_TTL_MS = 30_000;

  async function processCoverBatch(): Promise<void> {
    coverProcessing = true;
    try {
      while (coverQueue.length > 0) {
        const batch = coverQueue.splice(0, 5);
        await Promise.all(
          batch.map((p) =>
            doLoadCover(p).catch(() => {
              /* best-effort */
            })
          )
        );
        if (coverQueue.length > 0) await new Promise<void>((r) => queueMicrotask(() => r()));
      }
    } finally {
      coverProcessing = false;
    }
  }

  function scheduleCoverFlush(): void {
    if (coverProcessing || coverFlushScheduled) return;
    coverFlushScheduled = true;
    setTimeout(() => {
      coverFlushScheduled = false;
      processCoverBatch();
    }, 0);
  }

  // Ustawienia → Biblioteka → rozmiar cache okładek (renderer trzyma znacznie mniejsze
  // okno niż cache procesu main). Wraca do wbudowanego limitu, gdy
  // store ustawień jest nieosiągalny (testy jednostkowe, bardzo wczesne wywołania).
  function coverCacheMax(): number {
    try {
      return useSettingsStore().library.coverCacheMaxEntries ?? COVER_CACHE_MAX;
    } catch {
      return COVER_CACHE_MAX;
    }
  }

  function evictCoverCache(): void {
    const max = coverCacheMax();
    const keys = Object.keys(coverCache.value);
    if (keys.length <= max) return;
    // Sortuj po czasie ostatniego użycia (starsze = do usunięcia); wpisy bez
    // znacznika traktuj jako najstarsze.
    const byAge = keys.sort((a, b) => (coverLastUsed.get(a) ?? 0) - (coverLastUsed.get(b) ?? 0));
    const excess = keys.length - max;
    for (let i = 0; i < excess; i++) {
      const path = byAge[i];
      delete coverCache.value[path];
      coverSealedAt.delete(path);
      coverLastUsed.delete(path);
    }
  }

  async function doLoadCover(filePath: string): Promise<void> {
    const cached = coverCache.value[filePath];
    if (cached && cached.data) return;
    // Zdalne URL-e (strumienie/radio) nie mają lokalnego pliku do sondowania — nigdy nie
    // wykonuj dla nich rundy przez IPC, tylko zapieczętuj pustą okładkę.
    if (isRemoteUrl(filePath)) {
      coverCache.value[filePath] = { type: null, data: null };
      coverSealedAt.set(filePath, Date.now());
      triggerRef(coverCache);
      return;
    }
    // Świeży wynik "brak okładki" — pomiń rundę, aż TTL wygaśnie.
    const sealedAt = coverSealedAt.get(filePath);
    if (sealedAt && Date.now() - sealedAt < NULL_COVER_TTL_MS) return;
    if (cached) {
      delete coverCache.value[filePath];
      coverSealedAt.delete(filePath);
    }
    coverCache.value[filePath] = { type: null, data: null };
    try {
      const cover = (await window.api?.getCover(filePath)) ?? { type: null, data: null };
      if (cover.data) {
        coverCache.value[filePath] = cover;
      } else {
        const frame = await captureVideoFrame(filePath);
        coverCache.value[filePath] = frame;
        if (!frame.data) coverSealedAt.set(filePath, Date.now());
      }
    } catch {
      delete coverCache.value[filePath];
      coverSealedAt.delete(filePath);
    }
    touchCover(filePath);
    evictCoverCache();
    triggerRef(coverCache);
  }

  async function loadCover(filePath: string): Promise<CoverResult> {
    const cached = coverCache.value[filePath];
    if (cached) {
      touchCover(filePath);
      const sealedAt = coverSealedAt.get(filePath) ?? 0;
      if (cached.data || Date.now() - sealedAt < NULL_COVER_TTL_MS) {
        return cached;
      }
    }
    if (!coverQueue.includes(filePath) && !isRemoteUrl(filePath)) coverQueue.push(filePath);
    scheduleCoverFlush();
    return cached ?? { type: null, data: null };
  }

  function getCover(filePath: string): CoverResult {
    if (coverCache.value[filePath]) touchCover(filePath);
    return coverCache.value[filePath] ?? { type: null, data: null };
  }

  function invalidateCoverCache(filePath: string) {
    delete coverCache.value[filePath];
    coverLastUsed.delete(filePath);
    triggerRef(coverCache);
    loadCover(filePath);
  }

  // Mikro-wsadowe odpytywanie czasu trwania: masowe kolejkowanie odpalało kiedyś jedno wywołanie IPC na
  // utwór. Zbierz ścieżki przez ~50ms i rozwiąż je jednym
  // wywołaniem `media:batchDurations` (wraca do getDuration gdy niedostępne) —
  // plan 1.7.
  const pendingDuration = new Map<string, { track: MediaFile; resolve: () => void }>();
  let durationTimer: ReturnType<typeof setTimeout> | null = null;
  async function flushDurations(): Promise<void> {
    durationTimer = null;
    const batch = [...pendingDuration.values()];
    pendingDuration.clear();
    const paths = batch.map((b) => b.track.path);
    const results: Record<string, number> = {};
    try {
      if (window.api?.getDurations) {
        Object.assign(results, (await window.api.getDurations(paths)) || {});
      } else {
        await Promise.all(
          paths.map(async (p) => {
            try {
              results[p] = (await window.api?.getDuration(p)) || 0;
            } catch {
              results[p] = 0;
            }
          })
        );
      }
    } catch {
      /* zostaw zera */
    }
    for (const b of batch) {
      const dur = results[b.track.path] ?? 0;
      if (dur > 0) {
        useLibraryStore().updateTrack(b.track.path, (t) => {
          t.duration = dur;
        });
      }
      b.resolve();
    }
  }

  async function enrichTrack(track: MediaFile): Promise<void> {
    // Strumienie nie mają lokalnego pliku: brak odpytania o czas trwania, brak okładki z pliku.
    // Miniatura YouTube (zdalny URL https, dozwolony przez CSP img-src) jest seedowana
    // prosto do cache okładek, więc PlayerBar/AudioView renderują ją natychmiast.
    if (track.type === 'stream') {
      if (track.thumbnail && coverCache.value[track.path]?.data !== track.thumbnail) {
        coverCache.value[track.path] = { type: 'image', data: track.thumbnail };
        touchCover(track.path);
        evictCoverCache();
        triggerRef(coverCache);
      }
      return;
    }
    if (!track.duration && !pendingDuration.has(track.path)) {
      await new Promise<void>((resolve) => {
        pendingDuration.set(track.path, { track, resolve });
        if (!durationTimer) {
          durationTimer = setTimeout(() => {
            void flushDurations();
          }, 50);
        }
      });
    }
    // UWAGA: brak loadCover() tutaj — zakolejkowanie (np. "odtwórz wszystko" w folderze)
    // zalałoby loader okładek jedną rundą IPC na
    // zakolejkowany utwór, nawet dla setek, których użytkownik nigdy nie widział. Okładki są
    // pobierane na żądanie przez MediaCover przez jego IntersectionObserver, gdy
    // miniatura faktycznie się renderuje.
  }

  return { loadCover, getCover, invalidateCoverCache, enrichTrack };
}
