import { ref } from 'vue';
import { i18n } from '@renderer/i18n';
import { useUIStore } from '@renderer/stores/ui';
import type { CoverStatus, DownloadTask, MetaOverride } from '@renderer/types/online';
import type { IpcDownloadJobInput, IpcDownloadTask } from '@shared/types/ipc';
import { pluginHookBus } from '@renderer/utils/pluginHooks';
import { toDownloadTask } from '@renderer/utils/onlineDownloadTask';
import { buildTaskInput } from '@renderer/utils/onlineJob';

// Lista pobrań + wysyłanie zadań. `markVideoDownloaded` jest wstrzykiwane z
// modułu subskrypcji, więc zakończone zadanie może zaktualizować snapshot subskrypcji
// bez importowania store przez ten moduł (unika cyklu). Store
// destrukturyzuje zwrócone refy/akcje z powrotem do tych samych nazw.
export function createOnlineDownloads(
  markVideoDownloaded: (videoId: string, channelId: string) => void
) {
  const t = i18n.global.t;
  const downloads = ref<DownloadTask[]>([]);
  // Wyszukiwanie O(1) po videoId - aktualizowane w upsertTask, unika find O(n) na element na render.
  const downloadByVideoId = new Map<string, DownloadTask>();

  function upsertTask(task: DownloadTask) {
    const idx = downloads.value.findIndex((d) => d.id === task.id);
    const prev = idx >= 0 ? downloads.value[idx] : undefined;
    const becameCompleted = task.status === 'completed' && prev?.status !== 'completed';
    const becameError = task.status === 'error' && (!prev || prev.status !== 'error');
    const becameDownloading = task.status === 'downloading' && prev?.status !== 'downloading';
    if (idx >= 0) downloads.value[idx] = task;
    else downloads.value.push(task);
    if (task.videoId) downloadByVideoId.set(task.videoId, task);
    if (becameCompleted && task.videoId && task.channelId) {
      markVideoDownloaded(task.videoId, task.channelId);
    }
    if (becameError && task.error) {
      try {
        useUIStore().notify('error', task.title, task.error);
      } catch {
        // store ui niedostępny
      }
    }
    try {
      if (becameDownloading) {
        pluginHookBus.emit('download:start', {
          id: task.id,
          url: task.url,
          title: task.title,
          platform: task.source ? String(task.source) : undefined,
          format: task.format,
          quality: task.quality
        });
      }
      if (becameCompleted) {
        pluginHookBus.emit('download:complete', {
          id: task.id,
          title: task.title,
          url: task.url,
          outputPath: task.outputPath
        });
      }
      if (becameError) {
        pluginHookBus.emit('download:error', {
          id: task.id,
          title: task.title,
          url: task.url,
          error: task.error,
          errorCode: task.errorCode
        });
      }
    } catch {
      // pluginy niedostępne
    }
  }

  async function submitJobs(inputs: IpcDownloadJobInput[]): Promise<number> {
    if (!inputs.length) return 0;
    try {
      const created = (await window.api.invoke('yt:download:add', inputs)) as IpcDownloadTask[];
      for (const task of created || []) upsertTask(toDownloadTask(task));
      return created?.length || 0;
    } catch {
      return 0;
    }
  }

  // Status zadania pobierania dla danego id wideo (używane do pokazania stanu ładowanie /
  // pobieranie / gotowe na szybkim przycisku "pobierz").
  function downloadStatusFor(videoId: string): DownloadTask['status'] | null {
    if (!videoId) return null;
    const task = downloadByVideoId.get(videoId);
    return task ? task.status : null;
  }

  // Status przetwarzania okładki zadania dla wideo (używane do pokazania, że
  // animowana okładka wciąż jest przygotowywana po zakończeniu pobierania audio).
  function coverStatusFor(videoId: string): CoverStatus | null {
    if (!videoId) return null;
    const task = downloadByVideoId.get(videoId);
    return task?.coverStatus ?? null;
  }

  async function loadDownloads() {
    try {
      const list = (await window.api.invoke('yt:download:list')) as IpcDownloadTask[];
      if (Array.isArray(list)) {
        downloads.value = list.map(toDownloadTask);
        downloadByVideoId.clear();
        for (const d of downloads.value) {
          if (d.videoId) downloadByVideoId.set(d.videoId, d);
        }
      }
    } catch {
      /* pobrania jeszcze niedostępne */
    }
  }

  async function addTask(task: DownloadTask) {
    await submitJobs([buildTaskInput(task)]);
  }

  async function cancelDownload(id: string) {
    try {
      const ok = (await window.api.invoke('yt:download:cancel', id)) as boolean;
      if (ok) {
        const idx = downloads.value.findIndex((d) => d.id === id);
        if (idx >= 0) {
          const prev = downloads.value[idx];
          downloads.value[idx] = { ...prev, status: 'cancelled' };
        }
      }
    } catch {
      /* anulowanie nie powiodło się */
    }
  }

  async function pauseDownload(id: string) {
    try {
      const ok = (await window.api.invoke('yt:download:pause', id)) as boolean;
      if (ok) {
        const idx = downloads.value.findIndex((d) => d.id === id);
        if (idx >= 0) {
          const prev = downloads.value[idx];
          downloads.value[idx] = { ...prev, status: 'paused' };
        }
      }
    } catch {
      /* pauza nie powiodła się */
    }
  }

  async function resumeDownload(id: string) {
    try {
      const ok = (await window.api.invoke('yt:download:resume', id)) as boolean;
      if (ok) {
        const idx = downloads.value.findIndex((d) => d.id === id);
        if (idx >= 0) {
          const prev = downloads.value[idx];
          downloads.value[idx] = { ...prev, status: 'pending' };
        }
      }
    } catch {
      /* wznowienie nie powiodło się */
    }
  }

  async function retryDownload(task: DownloadTask) {
    const created = await submitJobs([buildTaskInput(task)]);
    if (!created) {
      // Proces main zastąpił nieudane zadanie nowym tylko wtedy, gdy nie istniało
      // aktywne zadanie z tym samym id wideo. Jeśli zostało pominięte, powiadom
      // użytkownika zamiast cichej porażki.
      useUIStore().notify('info', t('downloads.retry'), t('youtube.retryAlreadyActive'));
      return;
    }
    // Ponowienie tworzy zupełnie nowe zadanie — usuń stary nieudany wiersz, żeby to samo
    // wideo nie było wymienione dwa razy (raz jako błąd, raz jako oczekujące).
    const idx = downloads.value.findIndex((d) => d.id === task.id);
    if (idx >= 0) downloads.value.splice(idx, 1);
    if (task.videoId && downloadByVideoId.get(task.videoId)?.id === task.id) {
      downloadByVideoId.delete(task.videoId);
    }
  }

  async function pauseAll() {
    try {
      await window.api.invoke('yt:download:pauseAll');
    } catch {
      /* pauza wszystkich nie powiodła się */
    }
  }

  async function resumeAll() {
    try {
      await window.api.invoke('yt:download:resumeAll');
    } catch {
      /* wznowienie wszystkich nie powiodło się */
    }
  }

  async function moveToFront(id: string) {
    try {
      await window.api.invoke('yt:download:moveToFront', id);
    } catch {
      /* przeniesienie na przód nie powiodło się */
    }
  }

  async function move(id: string, direction: -1 | 1) {
    try {
      await window.api.invoke('yt:download:move', id, direction);
    } catch {
      /* przeniesienie nie powiodło się */
    }
  }

  async function exportQueue() {
    try {
      return (await window.api.invoke('yt:download:export')) as {
        success: boolean;
        error?: string;
      };
    } catch {
      return { success: false };
    }
  }

  async function importQueue() {
    try {
      const res = (await window.api.invoke('yt:download:import')) as {
        success: boolean;
        count?: number;
      };
      if (res?.success) await loadDownloads();
      return res ?? { success: false };
    } catch {
      return { success: false };
    }
  }

  async function scheduleStart(timestamp: number | null) {
    try {
      await window.api.invoke('yt:download:schedule', timestamp);
    } catch {
      /* planowanie nie powiodło się */
    }
  }

  async function getScheduledStart(): Promise<number | null> {
    try {
      return (await window.api.invoke('yt:download:schedule:get')) as number | null;
    } catch {
      return null;
    }
  }

  async function updateMetadata(filePath: string, meta: MetaOverride): Promise<boolean> {
    try {
      const res = (await window.api.invoke('yt:download:updateMetadata', filePath, meta)) as {
        success: boolean;
      };
      return !!res?.success;
    } catch {
      return false;
    }
  }

  async function clearFinishedDownloads() {
    try {
      await window.api.invoke('yt:download:clearFinished');
      downloads.value = downloads.value.filter(
        (d) => d.status === 'pending' || d.status === 'downloading' || d.status === 'paused'
      );
      downloadByVideoId.clear();
      for (const d of downloads.value) {
        if (d.videoId) downloadByVideoId.set(d.videoId, d);
      }
    } catch {
      /* czyszczenie nie powiodło się */
    }
  }
  return {
    downloads,
    downloadByVideoId,
    upsertTask,
    submitJobs,
    downloadStatusFor,
    coverStatusFor,
    loadDownloads,
    addTask,
    cancelDownload,
    pauseDownload,
    resumeDownload,
    retryDownload,
    pauseAll,
    resumeAll,
    moveToFront,
    move,
    exportQueue,
    importQueue,
    scheduleStart,
    getScheduledStart,
    updateMetadata,
    clearFinishedDownloads
  };
}
