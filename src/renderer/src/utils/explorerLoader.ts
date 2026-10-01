import type { Ref } from 'vue';
import { useUIStore } from '@renderer/stores/ui';
import type { FileItem } from '@renderer/types/explorer';

interface BatchLoader {
  load: (path: string) => Promise<void>;
  cancel: () => void;
}

export function createBatchLoader(files: Ref<FileItem[]>, isLoading: Ref<boolean>): BatchLoader {
  let cleanup: (() => void) | null = null;
  let currentLoadId = 0;

  function cancel() {
    currentLoadId++;
    cleanup?.();
    cleanup = null;
  }

  async function load(path: string): Promise<void> {
    const loadId = ++currentLoadId;
    files.value = [];
    isLoading.value = true;
    cleanup?.();
    if (!window.api) {
      isLoading.value = false;
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (stopListening: () => void) => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      isLoading.value = false;
      stopListening();
      cleanup = null;
    };

    const stopListening = window.api.on('fs:readdir:batch', (...args: unknown[]) => {
      if (loadId !== currentLoadId) {
        stopListening();
        return;
      }
      const data = args[0] as { done: boolean; items: FileItem[]; error?: string };
      if (data.error) {
        useUIStore().notify('error', 'Błąd odczytu folderu', data.error);
      }
      if (data.items.length > 0) {
        // Push (reactive deep ref) instead of copying the whole array per batch
        // — the copy was O(n) per batch and forced a full re-sort each time.
        files.value.push(...data.items);
      }
      if (data.done) finish(stopListening);
    });
    cleanup = () => finish(stopListening);

    // If the `done` batch never arrives (dropped event, main crash) the old code
    // left `isLoading` true forever and leaked the listener.
    timeout = setTimeout(() => {
      if (loadId !== currentLoadId) return;
      finish(stopListening);
    }, 15_000);

    try {
      await window.api.invoke('fs:readdir', path);
    } catch {
      if (loadId === currentLoadId) {
        files.value = [];
        finish(stopListening);
      }
    }
  }

  return { load, cancel };
}
