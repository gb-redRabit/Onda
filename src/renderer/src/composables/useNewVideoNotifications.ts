import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import { notifyNative } from '@renderer/utils/notifications';
import type { IpcNewVideosEvent } from '@shared/types/ipc';

let subscribed = false;

// Global listener for subscription auto-check results: toasts about new videos
// regardless of the currently open view. Mounted once from App.vue.
export function useNewVideoNotifications() {
  const { t } = useI18n();
  if (!subscribed) {
    subscribed = true;
    window.api?.on('yt:newVideos', (payload) => {
      const event = payload as IpcNewVideosEvent;
      if (!event || typeof event.count !== 'number' || event.count <= 0) return;
      const listed = event.titles
        .filter((x) => x)
        .slice(0, 3)
        .join(' • ');
      const more =
        event.count > event.titles.length ? ` (+${event.count - event.titles.length})` : '';
      const title = t('youtube.newVideosToastTitle', { channel: event.channelTitle || 'YouTube' });
      useUIStore().notify('info', title, listed ? `${listed}${more}` : undefined);

      if (useSettingsStore().toast.showNative) {
        notifyNative(title, listed ? `${listed}${more}` : undefined);
      }
    });
  }
  return {};
}
