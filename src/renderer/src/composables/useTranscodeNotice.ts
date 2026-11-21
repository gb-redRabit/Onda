import { reactive } from 'vue';
import type { VideoTranscodeReporter } from '@renderer/utils/videoElementHandlers';

export interface TranscodeNoticeState {
  active: boolean;
  /** 0–100 albo -1, gdy czas trwania nie jest znany. */
  percent: number;
}

export interface TranscodeNotice {
  reporter: VideoTranscodeReporter;
  /** Stan nakładki w odtwarzaczu — widocznej także w pełnym ekranie. */
  state: TranscodeNoticeState;
}

/**
 * Postęp transkodowania pokazujemy wyłącznie jako nakładkę w obszarze wideo.
 * Nakładka jest wewnątrz kontenera pełnoekranowego i nie zależy od ustawień
 * toastów, więc jeden wskaźnik wystarcza.
 */
export function useTranscodeNotice(): TranscodeNotice {
  const state = reactive<TranscodeNoticeState>({ active: false, percent: -1 });
  const hide = (): void => {
    state.active = false;
    state.percent = -1;
  };

  return {
    state,
    reporter: {
      start() {
        state.active = true;
        state.percent = -1;
      },
      progress(percent) {
        state.percent = percent;
      },
      finish() {
        hide();
      },
      cancel() {
        hide();
      }
    }
  };
}
