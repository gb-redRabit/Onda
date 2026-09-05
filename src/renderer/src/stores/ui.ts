import { defineStore } from 'pinia';
import { ref, type Component } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: Component;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
  children?: ContextMenuItem[];
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
}

export const useUIStore = defineStore('ui', () => {
  const topMenuVisible = ref(true);
  const statusBarVisible = ref(true);
  const playerBarVisible = ref(true);
  const settingsVisible = ref(false);
  const currentView = ref('home');
  const isFullscreen = ref(false);
  const searchMode = ref<'closed' | 'view' | 'global'>('closed');
  const searchQuery = ref('');
  const setupWizardVisible = ref(false);
  const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const notifications = ref<Notification[]>([]);

  function toggleTopMenu() {
    topMenuVisible.value = !topMenuVisible.value;
  }
  function toggleStatusBar() {
    statusBarVisible.value = !statusBarVisible.value;
  }

  function toggleGlobalSearch() {
    searchMode.value = searchMode.value === 'global' ? 'closed' : 'global';
  }

  function toggleViewSearch() {
    searchMode.value = searchMode.value === 'view' ? 'closed' : 'view';
  }

  function openSearch(mode: 'view' | 'global') {
    searchMode.value = mode;
  }

  function closeSearch() {
    searchMode.value = 'closed';
  }

  function setSearchQuery(q: string) {
    searchQuery.value = q;
  }

  function openSetupWizard() {
    setupWizardVisible.value = true;
  }

  function closeSetupWizard() {
    setupWizardVisible.value = false;
  }

  function setView(view: string) {
    currentView.value = view;
  }

  function showContextMenu(x: number, y: number, items: ContextMenuItem[]) {
    contextMenu.value = { x, y, items };
  }

  function hideContextMenu() {
    contextMenu.value = null;
  }

  function notify(type: Notification['type'], title: string, message?: string, duration = 5000) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    notifications.value.push({ id, type, title, message, duration });
    if (duration > 0) {
      setTimeout(() => {
        try {
          removeNotification(id);
        } catch {
          /* ignore */
        }
      }, duration);
    }
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  return {
    topMenuVisible,
    statusBarVisible,
    playerBarVisible,
    settingsVisible,
    currentView,
    isFullscreen,
    searchMode,
    searchQuery,
    setupWizardVisible,
    contextMenu,
    notifications,
    toggleTopMenu,
    toggleStatusBar,
    toggleGlobalSearch,
    toggleViewSearch,
    openSearch,
    closeSearch,
    setSearchQuery,
    openSetupWizard,
    closeSetupWizard,
    setView,
    showContextMenu,
    hideContextMenu,
    notify,
    removeNotification
  };
});
