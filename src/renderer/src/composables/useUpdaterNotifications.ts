import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import type { IpcUpdaterEvent } from '@shared/types/ipc';

let subscribed = false;
let lastNotified = '';

// Global listener for auto-update events: toasts about available / downloaded
// updates regardless of the currently open view. Mounted once from App.vue.
// Main replays the last event on `app:rendererReady`, so a late renderer mount
// still gets the notification.
export function useUpdaterNotifications() {
  const { t } = useI18n();
  if (!subscribed) {
    subscribed = true;
    window.api?.on('updater:event', (payload) => {
      const event = payload as IpcUpdaterEvent;
      if (!event || (event.event !== 'update-available' && event.event !== 'update-downloaded')) {
        return;
      }
      const version = event.version ?? '';
      const key = `${event.event}:${version}`;
      if (key === lastNotified) return;
      lastNotified = key;

      const ui = useUIStore();
      if (event.event === 'update-available') {
        ui.notify(
          'info',
          t('settings.updateToastAvailableTitle'),
          version ? t('settings.updateToastAvailableMessage', { version }) : undefined
        );
      } else {
        ui.notify(
          'success',
          t('settings.updateToastReadyTitle'),
          version ? t('settings.updateToastReadyMessage', { version }) : undefined
        );
      }
    });
  }
  return {};
}
