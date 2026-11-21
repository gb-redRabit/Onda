import { useUIStore } from '@renderer/stores/ui';
import { i18n } from '@renderer/i18n';
import type { VideoTranscodeReporter } from '@renderer/utils/videoElementHandlers';

/**
 * Jeden toast na całe transkodowanie: tworzony przy starcie, aktualizowany
 * postępem i zamieniany w sukces/błąd na końcu. Bez tego użytkownik widział
 * tylko 8-sekundowy komunikat, a przy dłuższym pliku nie wiedział, czy coś się
 * dzieje.
 */
export function useTranscodeNotice(): VideoTranscodeReporter {
  const ui = useUIStore();
  let notificationId: string | null = null;
  const t = i18n.global.t;

  return {
    start() {
      notificationId = ui.notify('info', t('player.transcodingVideo'), undefined, 0);
    },
    progress(percent) {
      if (!notificationId) return;
      const value = percent < 0 ? undefined : Math.round(percent);
      ui.updateNotification(notificationId, {
        progress: value,
        message:
          value === undefined ? undefined : t('player.transcodingProgress', { percent: value })
      });
    },
    finish(ok) {
      if (!notificationId) return;
      ui.updateNotification(notificationId, {
        type: ok ? 'success' : 'error',
        title: ok ? t('player.transcodingDone') : t('player.videoUnsupported'),
        message: undefined,
        progress: undefined,
        duration: ok ? 2500 : 5000
      });
      notificationId = null;
    },
    cancel() {
      if (!notificationId) return;
      ui.removeNotification(notificationId);
      notificationId = null;
    }
  };
}
