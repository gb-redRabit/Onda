import { ref, type Ref } from 'vue';
import type { ExplorerTab } from '@renderer/types/explorer';
import { formatTabLabel } from '@renderer/utils/explorerPath';

export interface ExplorerTabs {
  tabs: Ref<ExplorerTab[]>;
  activeTabIndex: Ref<number>;
  addTab: (path: string) => void;
  closeTab: (index: number) => void;
  switchTab: (index: number) => void;
  reorderTab: (from: number, to: number) => void;
  syncActiveTab: (path: string) => void;
}

// Explorer tab state + operations extracted from `stores/explorer.ts` (plan 2.8).
// `navigateTo` is injected so switching a tab drives the store's navigation.
export function createExplorerTabs(navigateTo: (path: string) => void): ExplorerTabs {
  const tabs = ref<ExplorerTab[]>([]);
  const activeTabIndex = ref(-1);

  function addTab(path: string) {
    const existing = tabs.value.findIndex(
      (t, idx) => t.path === path && idx !== activeTabIndex.value
    );
    if (existing >= 0) {
      switchTab(existing);
      return;
    }
    const label = formatTabLabel(path);
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tabs.value.push({ id, path, label });
    switchTab(tabs.value.length - 1);
  }

  function closeTab(index: number) {
    if (tabs.value.length <= 1) return;
    tabs.value.splice(index, 1);
    if (activeTabIndex.value === index) {
      const newIdx = Math.min(index, tabs.value.length - 1);
      switchTab(newIdx);
    } else if (activeTabIndex.value > index) {
      activeTabIndex.value--;
    }
  }

  function switchTab(index: number) {
    if (index < 0 || index >= tabs.value.length) return;
    activeTabIndex.value = index;
    const tab = tabs.value[index];
    navigateTo(tab.path);
  }

  function reorderTab(from: number, to: number) {
    if (from < 0 || from >= tabs.value.length || to < 0 || to >= tabs.value.length) return;
    if (from === to) return;
    const [tab] = tabs.value.splice(from, 1);
    tabs.value.splice(to, 0, tab);
    const active = activeTabIndex.value;
    if (active === from) {
      activeTabIndex.value = to;
    } else if (active > from && active <= to) {
      activeTabIndex.value = active - 1;
    } else if (active < from && active >= to) {
      activeTabIndex.value = active + 1;
    }
  }

  function syncActiveTab(path: string) {
    const tab = tabs.value[activeTabIndex.value];
    if (activeTabIndex.value >= 0 && tab) {
      tab.path = path;
      tab.label = formatTabLabel(path);
    }
  }

  return { tabs, activeTabIndex, addTab, closeTab, switchTab, reorderTab, syncActiveTab };
}
