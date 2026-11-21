import { reactive } from 'vue';
import { useUIStore } from '@renderer/stores/ui';
import { i18n } from '@renderer/i18n';
import type { VideoTranscodeReporter } from '@renderer/utils/videoElementHandlers';

export interface TranscodeNoticeState {
  active: boolean;
  /** 0–100 albo -1, gdy czas trwania nie jest znany. */
  percent: number;
}

export interface TranscodeNotice {
  reporter: VideoTranscodeReporter;
  /** Stan do nakładki w odtwarzaczu — widocznej także w pełnym ekranie. */
  state: TranscodeNoticeState;
}

/**
 * Jeden toast na całe transkodowanie: tworzony przy starcie, aktualizowany
 * postępem i zamieniany w sukces/błąd na końcu. Ten sam stan zasila nakładkę
 * w obszarze wideo, bo toast ogólny jest poza elementem pełnoekranowym.
 */
export function useTranscodeNotice(): TranscodeNotice {
  const ui = useUIStore();
  const state = reactive<TranscodeNoticeState>({ active: false, percent: -1 });
  let notificationId: string | null = null;
  const t = i18n.global.t;

  return {
    state,
    reporter: {
      start() {
        state.active = true;
        state.percent = -1;
        notificationId = ui.notify('info', t('player.transcodingVideo'), undefined, 0);
        ui.updateNotification(notificationId, { alwaysShow: true });
      },
      progress(percent) {
        state.percent = percent;
        if (!notificationId) return;
        const value = percent < 0 ? undefined : Math.round(percent);
        ui.updateNotification(notificationId, {
          progress: value,
          message:
            value === undefined ? undefined : t('player.transcodingProgress', { percent: value })
        });
      },
      finish(ok) {
        state.active = false;
        state.percent = -1;
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
        state.active = false;
        state.percent = -1;
        if (!notificationId) return;
        ui.removeNotification(notificationId);
        notificationId = null;
      }
    }
  };
}
