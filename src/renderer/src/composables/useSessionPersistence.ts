import { onScopeDispose, watch } from 'vue';
import type { Router } from 'vue-router';
import { usePlayerStore } from '@renderer/stores/player';
import { buildMediaFile } from '@renderer/utils/explorerMedia';
import { openMediaFiles } from './useOpenMedia';

const SESSION_KEY = 'onda-session';
// Sesja potrzebuje tylko ograniczonego ogona kolejki — zapisywanie każdej
// ścieżki biblioteki 50k serializuje kilka MB synchronicznie przy każdej zmianie.
const MAX_PERSISTED_QUEUE = 500;

export interface PersistedSession {
  currentPath: string;
  queue: string[];
}

/** Odczyt sesji z localStorage (ten sam profil dla main i compactu). */
export function readPersistedSession(): PersistedSession | null {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as {
      currentPath?: unknown;
      queue?: unknown;
    } | null;
    if (!data || typeof data.currentPath !== 'string' || !data.currentPath) return null;
    const queue = Array.isArray(data.queue)
      ? data.queue.filter((path): path is string => typeof path === 'string')
      : [];
    return { currentPath: data.currentPath, queue };
  } catch {
    return null;
  }
}

export function clearPersistedSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* pamięć niedostępna */
  }
}

function writeSession(player: ReturnType<typeof usePlayerStore>): void {
  try {
    if (!player.currentTrack) {
      clearPersistedSession();
      return;
    }
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        currentPath: player.currentTrack.path,
        queue: player.queue.slice(0, MAX_PERSISTED_QUEUE).map((track) => track.path)
      })
    );
  } catch {
    /* pamięć niedostępna */
  }
}

/** Natychmiastowy zapis sesji (bez debounce). */
export function persistSessionNow(): void {
  writeSession(usePlayerStore());
}

/**
 * Przygotowuje sesję do automatycznego restartu legacy main → compact.
 * Renderer zapisuje ścieżki synchronicznie, więc main może od razu restartować;
 * jednorazowy znacznik odtworzenia żyje w `compact-window-state.json`.
 */
export function prepareSessionForRestart(): void {
  persistSessionNow();
}

/**
 * Przywraca sesję do playera bez nawigacji routerem (compact nie ma routera).
 * Odrzuca nieistniejące pliki, przyznaje dostęp serwerowi mediów i wznawia
 * zapisaną pozycję. Odtwarza tylko audio — compact jest audio-only.
 */
export async function restoreSessionToPlayer(): Promise<boolean> {
  const data = readPersistedSession();
  if (!data) return false;

  const paths = [data.currentPath, ...data.queue];
  let existing = paths;
  try {
    const filtered = (await window.api.invoke('fs:existing', paths)) as string[] | undefined;
    if (Array.isArray(filtered)) existing = filtered;
  } catch {
    /* brak weryfikacji — spróbuj odtworzyć jak jest */
  }
  if (!existing.length) {
    clearPersistedSession();
    return false;
  }

  const tracks = existing
    .map((path) => buildMediaFile({ path }))
    .filter((track) => track.type === 'audio');
  if (!tracks.length) return false;

  await Promise.all(tracks.map((track) => window.api?.grantMediaAccess(track.path)));
  const player = usePlayerStore();
  player.clearQueue();
  if (tracks.length > 1) player.addToQueueMultiple(tracks.slice(1));
  player.setTrack(tracks[0], { resume: true });
  return true;
}

// Zapisuje ostatnio odtwarzany utwór + kolejkę do localStorage i przywraca je
// przy starcie (gdy "przywróć ostatnią sesję" jest włączone).
export function useSessionPersistence() {
  const player = usePlayerStore();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function persist(): void {
    writeSession(player);
  }

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 1000);
  }

  watch(
    () => [player.currentTrack?.path, player.queueLength],
    () => scheduleSave()
  );

  // Oczekujący debounce to 1-sekundowy timer, który zapisałby do localStorage po
  // zniknięciu właścicielskiego zakresu.
  onScopeDispose(() => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  });

  async function restore(router: Router): Promise<boolean> {
    const data = readPersistedSession();
    if (!data) return false;

    const paths = [data.currentPath, ...data.queue];
    // Sprzątanie: odrzuć ścieżki plików usuniętych z dysku między uruchomieniami,
    // żeby nie odtwarzać nieistniejącego utworu (i nie sypać błędami serwera mediów).
    let existing = paths;
    try {
      const filtered = (await window.api.invoke('fs:existing', paths)) as string[] | undefined;
      if (Array.isArray(filtered)) existing = filtered;
    } catch {
      /* brak weryfikacji — spróbuj odtworzyć jak jest */
    }
    if (!existing.length) {
      clearPersistedSession();
      return false;
    }
    try {
      await openMediaFiles(existing, router);
    } catch {
      return false;
    }
    return true;
  }

  return { scheduleSave, persistNow: persistSessionNow, restore };
}
