import { ref } from 'vue';
import { useUIStore } from '@renderer/stores/ui';
import type { CoverStatus, DownloadTask } from '@renderer/types/online';
import type { IpcDownloadJobInput, IpcDownloadTask } from '@shared/types/ipc';
import { pluginHookBus } from '@renderer/utils/pluginHooks';
import { toDownloadTask } from '@renderer/utils/onlineDownloadTask';

// Downloads list + job submission. `markVideoDownloaded` is injected from the
// subscriptions module so a completed job can update the subscription snapshot
// without this module importing the store (avoids a cycle). The store
// destructures the returned refs/actions back into the same names.
export function createOnlineDownloads(
  markVideoDownloaded: (videoId: string, channelId: string) => void
) {
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

  return {
    downloads,
    downloadByVideoId,
    upsertTask,
    submitJobs,
    downloadStatusFor,
    coverStatusFor
  };
}
