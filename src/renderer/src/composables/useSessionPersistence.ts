import { onScopeDispose, watch } from 'vue';
import type { Router } from 'vue-router';
import { usePlayerStore } from '@renderer/stores/player';
import { openMediaFiles } from './useOpenMedia';

const SESSION_KEY = 'onda-session';
// Sesja potrzebuje tylko ograniczonego ogona kolejki — zapisywanie każdej ścieżki
// biblioteki 50k serializuje kilka MB synchronicznie przy każdej zmianie (plan 1.9).
const MAX_PERSISTED_QUEUE = 500;

// Zapisuje ostatnio odtwarzany utwór + kolejkę do localStorage i przywraca je przy
// starcie (gdy "przywróć ostatnią sesję" jest włączone).
export function useSessionPersistence() {
  const player = usePlayerStore();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function persist(): void {
    try {
      if (!player.currentTrack) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          currentPath: player.currentTrack.path,
          queue: player.queue.slice(0, MAX_PERSISTED_QUEUE).map((t) => t.path)
        })
      );
    } catch {
      /* pamięć niedostępna */
    }
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
    let data: { currentPath?: string; queue?: unknown } | null = null;
    try {
      data = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      data = null;
    }
    if (!data || typeof data.currentPath !== 'string' || !data.currentPath) return false;

    const queue = Array.isArray(data.queue)
      ? data.queue.filter((p): p is string => typeof p === 'string')
      : [];
    const paths = [data.currentPath, ...queue];
    try {
      await openMediaFiles(paths, router);
    } catch {
      return false;
    }
    return true;
  }

  return { scheduleSave, restore };
}
