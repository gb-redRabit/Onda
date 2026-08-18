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
        files.value = [...files.value, ...data.items];
      }
      if (data.done) {
        isLoading.value = false;
        stopListening();
        cleanup = null;
      }
    });
    cleanup = stopListening;
    try {
      await window.api.invoke('fs:readdir', path);
    } catch {
      if (loadId === currentLoadId) {
        files.value = [];
        isLoading.value = false;
        stopListening();
        cleanup = null;
      }
    }
  }

  return { load, cancel };
}
