import { triggerRef, type Ref } from 'vue';
import { useUIStore } from '@renderer/stores/ui';
import { i18n } from '@renderer/i18n';
import type { FileItem } from '@renderer/types/explorer';

interface BatchLoader {
  load: (path: string) => Promise<void>;
  cancel: () => void;
}

export function createBatchLoader(
  files: Ref<FileItem[]>,
  isLoading: Ref<boolean>,
  onError?: (message: string | null) => void
): BatchLoader {
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
    onError?.(null);
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
        useUIStore().notify('error', i18n.global.t('explorer.loadError'), data.error);
        onError?.(data.error);
      }
      if (data.items.length > 0) {
        // Push do `shallowRef` (bez deep-proxy) zamiast kopiowania całej tablicy na
        // batch — kopia była O(n) na batch; `triggerRef` powiadamia odbiorców raz na partię.
        files.value.push(...data.items);
        triggerRef(files);
      }
      if (data.done) finish(stopListening);
    });
    cleanup = () => finish(stopListening);

    // Jeśli batch `done` nigdy nie dotrze (zgubione zdarzenie, awaria main), stary kod
    // zostawiał `isLoading` na zawsze true i wyciekał listener.
    timeout = setTimeout(() => {
      if (loadId !== currentLoadId) return;
      finish(stopListening);
    }, 15_000);

    try {
      await window.api.invoke('fs:readdir', path);
    } catch (e) {
      if (loadId === currentLoadId) {
        files.value = [];
        onError?.(e instanceof Error ? e.message : String(e));
        finish(stopListening);
      }
    }
  }

  return { load, cancel };
}
