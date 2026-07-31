import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ClipboardAction = 'copy' | 'cut' | null;

export const useClipboardStore = defineStore('clipboard', () => {
  const items = ref<{ path: string; name: string }[]>([]);
  const action = ref<ClipboardAction>(null);

  function setClipboard(paths: string[], act: Exclude<ClipboardAction, null>) {
    items.value = paths.map((p) => {
      const parts = p.split(/[\\/]/);
      return { path: p, name: parts[parts.length - 1] || p };
    });
    action.value = act;
  }

  function clear() {
    items.value = [];
    action.value = null;
  }

  function isCut(path: string): boolean {
    return action.value === 'cut' && items.value.some((i) => i.path === path);
  }

  return { items, action, setClipboard, clear, isCut };
});
