import { defineStore } from 'pinia';
import { ref, type Component } from 'vue';

/** Szerokość menu kontekstowego w px — wspólna dla pozycjonowania i przycinania. */
export const CONTEXT_MENU_WIDTH = 230;

export interface ContextMenuItem {
  label: string;
  icon?: Component;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
  checked?: boolean;
  children?: ContextMenuItem[];
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
  /** Postęp 0–100; `undefined` ukrywa pasek (toasty bez postępu). */
  progress?: number;
  /** Akcja w toaście (np. „Cofnij”); toast znika po jej uruchomieniu. */
  action?: { label: string; run: () => void };
}

type NotificationPatch = Partial<
  Pick<Notification, 'type' | 'title' | 'message' | 'duration' | 'progress'>
>;

export const useUIStore = defineStore('ui', () => {
  const searchMode = ref<'closed' | 'view' | 'global'>('closed');
  const searchQuery = ref('');
  const setupWizardVisible = ref(false);
  const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const notifications = ref<Notification[]>([]);

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

  function showContextMenu(x: number, y: number, items: ContextMenuItem[]) {
    contextMenu.value = { x, y, items };
  }

  function hideContextMenu() {
    contextMenu.value = null;
  }

  function scheduleRemoval(id: string, duration: number): void {
    if (duration <= 0) return;
    setTimeout(() => {
      try {
        removeNotification(id);
      } catch {
        /* zignoruj */
      }
    }, duration);
  }

  function notify(
    type: Notification['type'],
    title: string,
    message?: string,
    duration = 5000,
    action?: Notification['action']
  ): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    notifications.value.push({ id, type, title, message, duration, action });
    scheduleRemoval(id, duration);
    return id;
  }

  /** Aktualizuje istniejący toast (np. postęp transkodowania) zamiast tworzyć nowy. */
  function updateNotification(id: string, patch: NotificationPatch): void {
    const notification = notifications.value.find((n) => n.id === id);
    if (!notification) return;
    Object.assign(notification, patch);
    if (patch.duration !== undefined) scheduleRemoval(id, patch.duration);
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  return {
    searchMode,
    searchQuery,
    setupWizardVisible,
    contextMenu,
    notifications,
    updateNotification,
    toggleGlobalSearch,
    toggleViewSearch,
    openSearch,
    closeSearch,
    setSearchQuery,
    openSetupWizard,
    closeSetupWizard,
    showContextMenu,
    hideContextMenu,
    notify,
    removeNotification
  };
});
