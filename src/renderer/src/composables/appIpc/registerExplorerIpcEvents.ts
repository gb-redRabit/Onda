import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { useExplorerStore } from '@renderer/stores/explorer';
import { claimTabDrag } from '@renderer/utils/tabDrag';
import { createListenerScope } from './listeners';

// Zakładki eksploratora synchronizowane między oknami (zakładka przeniesiona
// między oknami). `route` decyduje, czy ostatnia zakładka zamyka okno.
export function registerExplorerIpcEvents(route: RouteLocationNormalizedLoaded): () => void {
  const { listen, dispose } = createListenerScope();

  listen('explorer:add-tab', (path: unknown) => {
    if (typeof path === 'string') useExplorerStore().addTab(path);
  });
  listen('explorer:refresh', () => {
    const explorerStore = useExplorerStore();
    explorerStore.loadFiles(explorerStore.currentPath);
  });
  listen('explorer:remove-tab', (path: unknown) => {
    if (typeof path !== 'string') return;
    claimTabDrag(path);
    const explorerStore = useExplorerStore();
    const idx = explorerStore.tabs.findIndex((tab) => tab.path === path);
    if (idx < 0) return;
    if (explorerStore.tabs.length <= 1) {
      if (route.name === 'explorer-window') {
        window.api?.invoke('window:close');
      } else {
        explorerStore.navigateTo('');
      }
      return;
    }
    explorerStore.closeTab(idx);
  });

  return dispose;
}
