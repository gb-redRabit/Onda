import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import type { CoverStatus, DownloadTask, MetaOverride } from '@renderer/types/online';
import type { IpcDownloadJobInput, IpcDownloadTask } from '@shared/types/ipc';
import { pluginHookBus } from '@renderer/utils/pluginHooks';
import { toDownloadTask } from '@renderer/utils/onlineDownloadTask';
import { buildTaskInput } from '@renderer/utils/onlineJob';

// Downloads list + job submission. `markVideoDownloaded` is injected from the
// subscriptions module so a completed job can update the subscription snapshot
// without this module importing the store (avoids a cycle). The store
// destructures the returned refs/actions back into the same names.
export function createOnlineDownloads(
  markVideoDownloaded: (videoId: string, channelId: string) => void
) {
  const { t } = useI18n();
  const downloads = ref<DownloadTask[]>([]);
  // O(1) lookup by videoId - updated in upsertTask, avoids O(n) find per item per render.
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
        // ui store unavailable
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
      // plugins unavailable
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

  // Status of the download task for a given video id (used to show a loading /
  // downloading / done state on the quick "download" button).
  function downloadStatusFor(videoId: string): DownloadTask['status'] | null {
    if (!videoId) return null;
    const task = downloadByVideoId.get(videoId);
    return task ? task.status : null;
  }

  // Cover-processing status of the task for a video (used to show that the
  // animated cover is still being prepared after the audio download finished).
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
      /* downloads unavailable yet */
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
      /* cancel failed */
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
      /* pause failed */
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
      /* resume failed */
    }
  }

  async function retryDownload(task: DownloadTask) {
    const created = await submitJobs([buildTaskInput(task)]);
    if (!created) {
      // The main process replaced the failed job with a fresh one only when no
      // active job with the same video id existed. If it was skipped, tell the
      // user instead of failing silently.
      useUIStore().notify('info', t('downloads.retry'), t('youtube.retryAlreadyActive'));
      return;
    }
    // A retry creates a brand-new job — drop the old failed row so the same
    // video is not listed twice (once as error, once as pending).
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
      /* pause all failed */
    }
  }

  async function resumeAll() {
    try {
      await window.api.invoke('yt:download:resumeAll');
    } catch {
      /* resume all failed */
    }
  }

  async function moveToFront(id: string) {
    try {
      await window.api.invoke('yt:download:moveToFront', id);
    } catch {
      /* move to front failed */
    }
  }

  async function move(id: string, direction: -1 | 1) {
    try {
      await window.api.invoke('yt:download:move', id, direction);
    } catch {
      /* move failed */
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
      /* schedule failed */
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
      /* clear failed */
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
