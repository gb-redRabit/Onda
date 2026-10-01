import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import type { IpcUpdaterEvent } from '@shared/types/ipc';

let subscribed = false;
let lastNotified = '';

// Globalny nasłuch zdarzeń auto-aktualizacji: toasty o dostępnych / pobranych
// aktualizacjach niezależnie od aktualnie otwartego widoku. Montowany raz z App.vue.
// Main odtwarza ostatnie zdarzenie przy `app:rendererReady`, więc późne zamontowanie renderera
// wciąż otrzymuje powiadomienie.
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
