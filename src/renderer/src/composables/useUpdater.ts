import { computed, ref } from 'vue';
import type { IpcUpdaterEvent, UpdaterState } from '@shared/types/ipc';

// Globalny stan auto-aktualizacji (singleton modułu). Main wysyła `updater:event`
// (oraz odtwarza ostatnie przy `app:rendererReady`), a baner w App.vue czyta ten stan —
// więc informacja o aktualizacji jest widoczna niezależnie od otwartego widoku.
const status = ref<UpdaterState['status']>('idle');
const version = ref('');
const progress = ref(0);
const current = ref('');
const error = ref('');
const enabled = ref(false);
const dismissed = ref(false);

let subscribed = false;
let hydrated = false;

function applyEvent(event: IpcUpdaterEvent): void {
  switch (event.event) {
    case 'checking-for-update':
      status.value = 'checking';
      break;
    case 'update-available':
      status.value = 'available';
      version.value = event.version ?? '';
      error.value = '';
      // Nowa wersja → pokaż baner ponownie, nawet gdy poprzedni odrzucono.
      dismissed.value = false;
      break;
    case 'update-not-available':
      status.value = 'not-available';
      break;
    case 'download-progress':
      status.value = 'downloading';
      progress.value = event.percent ?? 0;
      break;
    case 'update-downloaded':
      status.value = 'downloaded';
      if (event.version) version.value = event.version;
      progress.value = 100;
      break;
    case 'error':
      status.value = 'error';
      error.value = event.error ?? '';
      break;
  }
}

export function useUpdater() {
  if (!subscribed) {
    subscribed = true;
    window.api?.on('updater:event', (payload) => applyEvent(payload as IpcUpdaterEvent));
  }
  if (!hydrated) {
    hydrated = true;
    const pending = window.api?.getUpdaterState();
    if (pending) {
      void pending
        .then((s) => {
          if (!s) return;
          status.value = s.status;
          version.value = s.version;
          progress.value = s.progress;
          current.value = s.current;
          error.value = s.error;
          enabled.value = s.enabled;
        })
        .catch(() => {});
    }
  }

  return {
    status,
    version,
    progress,
    current,
    error,
    enabled,
    dismissed,
    show: computed(
      () =>
        !dismissed.value &&
        (status.value === 'available' ||
          status.value === 'downloading' ||
          status.value === 'downloaded')
    ),
    download: () => void window.api?.downloadUpdate(),
    install: () => window.api?.installUpdate(),
    dismiss: () => {
      dismissed.value = true;
    }
  };
}

/** Reset stanu modułu — tylko dla testów (stan jest singletonem modułu). */
export function __resetUpdater(): void {
  status.value = 'idle';
  version.value = '';
  progress.value = 0;
  current.value = '';
  error.value = '';
  enabled.value = false;
  dismissed.value = false;
  subscribed = false;
  hydrated = false;
}
