import { watch } from 'vue';
import type { Router } from 'vue-router';
import { usePlayerStore } from '@renderer/stores/player';
import { openMediaFiles } from './useOpenMedia';

const SESSION_KEY = 'onda-session';

// Persists the last played track + queue to localStorage and restores them on
// startup (when "restore last session" is enabled).
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
          queue: player.queue.map((t) => t.path)
        })
      );
    } catch {
      /* storage unavailable */
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
