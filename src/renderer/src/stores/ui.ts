import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: string;
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
  const searchVisible = ref(false);
  const settingsVisible = ref(false);
  const currentView = ref('home');
  const isFullscreen = ref(false);
  const commandPaletteVisible = ref(false);
  const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const notifications = ref<Notification[]>([]);

  function toggleTopMenu() {
    topMenuVisible.value = !topMenuVisible.value;
  }
  function toggleStatusBar() {
    statusBarVisible.value = !statusBarVisible.value;
  }
  function toggleSearch() {
    searchVisible.value = !searchVisible.value;
  }
  function toggleCommandPalette() {
    commandPaletteVisible.value = !commandPaletteVisible.value;
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
    searchVisible,
    settingsVisible,
    currentView,
    isFullscreen,
    commandPaletteVisible,
    contextMenu,
    notifications,
    toggleTopMenu,
    toggleStatusBar,
    toggleSearch,
    toggleCommandPalette,
    setView,
    showContextMenu,
    hideContextMenu,
    notify,
    removeNotification
  };
});
