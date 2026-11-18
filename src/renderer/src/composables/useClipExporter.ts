import { computed, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { fileNameOf } from '@renderer/utils/videoClipper';
import type {
  MediaConvertProgress,
  VideoClipAudio,
  VideoClipContainer,
  VideoClipFormat,
  VideoClipMode,
  VideoClipRequest,
  VideoClipRotation
} from '@shared/types/tools';

export type ClipStatus = 'idle' | 'exporting' | 'done' | 'error' | 'canceled';

export interface ClipItem {
  id: string;
  startSec: number;
  endSec: number;
  status: 'pending' | 'exporting' | 'done' | 'error' | 'canceled';
  outputPath?: string;
  error?: string;
}

interface ClipExporterOptions {
  videoPath: Ref<string>;
  duration: Ref<number>;
  startSec: Ref<number>;
  endSec: Ref<number>;
  clampRange: () => void;
}

/**
 * Eksport pojedynczego klipu i listy klipów: stan formularza, kolejka zleceń,
 * subskrypcja postępu i anulowanie. Widok tylko renderuje i deleguje akcje.
 */
export function useClipExporter(options: ClipExporterOptions) {
  const { videoPath, duration, startSec, endSec, clampRange } = options;
  const { t } = useI18n();
  const { sendToMain } = useToolBridge();

  const container = ref<VideoClipContainer>('mp4');
  const clipMode = ref<VideoClipMode>('copy');
  const clipFormat = ref<VideoClipFormat>('video');
  const audioMode = ref<VideoClipAudio>('keep');
  const rotation = ref<VideoClipRotation>(0);
  const targetSizeMb = ref(0);
  const outputDir = ref('');
  const status = ref<ClipStatus>('idle');
  const progress = ref(0);
  const speed = ref('');
  const error = ref('');
  const outputPath = ref('');
  const busy = ref(false);
  const cancelRequested = ref(false);
  const clips = ref<ClipItem[]>([]);
  let currentJobId = '';
  let offProgress: (() => void) | null = null;

  const canExport = computed(
    () =>
      !!videoPath.value &&
      !busy.value &&
      Number.isFinite(startSec.value) &&
      Number.isFinite(endSec.value) &&
      endSec.value - startSec.value >= 0.05
  );

  function setRotation(value: string | number | undefined): void {
    rotation.value = Number(value) as VideoClipRotation;
  }

  // GIF, wyciszenie, obrót i limit rozmiaru wymagają re-enkodowania — tryb
  // "copy" nie potrafi ich obsłużyć, więc przeskakujemy na "exact".
  watch([clipFormat, audioMode, rotation, targetSizeMb], () => {
    if (
      clipFormat.value === 'gif' ||
      audioMode.value === 'mute' ||
      rotation.value !== 0 ||
      targetSizeMb.value > 0
    ) {
      clipMode.value = 'exact';
    }
  });

  function resetExportState(): void {
    status.value = 'idle';
    progress.value = 0;
    speed.value = '';
    error.value = '';
    outputPath.value = '';
  }

  function addClip(): void {
    if (busy.value || duration.value <= 0) return;
    clampRange();
    if (endSec.value - startSec.value < 0.05) return;
    clips.value.push({
      id: crypto.randomUUID(),
      startSec: startSec.value,
      endSec: endSec.value,
      status: 'pending'
    });
  }

  function removeClip(id: string): void {
    if (busy.value) return;
    clips.value = clips.value.filter((clip) => clip.id !== id);
  }

  function clearClips(): void {
    if (busy.value) return;
    clips.value = [];
  }

  function requestFor(jobId: string, start: number, end: number): VideoClipRequest {
    return {
      jobId,
      inputPath: videoPath.value,
      outputDir: outputDir.value.trim() || undefined,
      startSec: start,
      endSec: end,
      container: container.value,
      mode: clipMode.value,
      format: clipFormat.value,
      audio: audioMode.value,
      rotation: rotation.value,
      targetSizeMb: targetSizeMb.value || undefined
    };
  }

  function subscribeProgress(): void {
    offProgress?.();
    offProgress = window.api.on('tools:progress', (payload) => {
      const update = payload as MediaConvertProgress;
      if (update.jobId !== currentJobId) return;
      if (update.percent >= 0) progress.value = update.percent;
      if (update.speed) speed.value = update.speed;
    });
  }

  function unsubscribeProgress(): void {
    offProgress?.();
    offProgress = null;
  }

  async function startClipList(): Promise<void> {
    if (busy.value || clips.value.length === 0) return;
    busy.value = true;
    cancelRequested.value = false;
    status.value = 'exporting';
    progress.value = 0;
    speed.value = '';
    error.value = '';
    outputPath.value = '';

    for (const clip of clips.value) {
      clip.status = 'pending';
      clip.error = undefined;
      clip.outputPath = undefined;
    }

    subscribeProgress();

    try {
      for (const clip of clips.value) {
        if (cancelRequested.value) {
          clip.status = 'canceled';
          continue;
        }
        currentJobId = crypto.randomUUID();
        clip.status = 'exporting';
        progress.value = 0;
        try {
          const result = await window.api.clipVideo(
            requestFor(currentJobId, clip.startSec, clip.endSec)
          );
          if (result.canceled) {
            clip.status = 'canceled';
            cancelRequested.value = true;
          } else if (result.success) {
            clip.status = 'done';
            clip.outputPath = result.outputPath;
            outputPath.value = result.outputPath ?? '';
          } else {
            clip.status = 'error';
            clip.error = result.error || t('tools.clipFailed');
            error.value = clip.error;
          }
        } catch (e) {
          clip.status = 'error';
          clip.error = e instanceof Error ? e.message : String(e);
          error.value = clip.error;
        }
      }

      const done = clips.value.filter((clip) => clip.status === 'done').length;
      if (done > 0) {
        void sendToMain('clip-complete', {
          name: t('tools.clipListComplete', { count: done }),
          outputPath: outputPath.value
        });
      }
      if (clips.value.some((clip) => clip.status === 'canceled')) {
        status.value = 'canceled';
      } else if (clips.value.some((clip) => clip.status === 'error')) {
        status.value = 'error';
        error.value =
          clips.value.find((clip) => clip.status === 'error')?.error || t('tools.clipFailed');
      } else {
        status.value = 'done';
        progress.value = 100;
      }
    } finally {
      busy.value = false;
      currentJobId = '';
      unsubscribeProgress();
    }
  }

  async function startClip(): Promise<void> {
    if (!canExport.value) return;
    clampRange();
    if (endSec.value - startSec.value < 0.05) {
      error.value = t('tools.clipInvalidRange');
      return;
    }

    busy.value = true;
    cancelRequested.value = false;
    status.value = 'exporting';
    progress.value = 0;
    speed.value = '';
    error.value = '';
    outputPath.value = '';
    currentJobId = crypto.randomUUID();

    subscribeProgress();

    const request: VideoClipRequest = {
      jobId: currentJobId,
      inputPath: videoPath.value,
      outputDir: outputDir.value.trim() || undefined,
      startSec: startSec.value,
      endSec: endSec.value,
      container: container.value,
      mode: clipMode.value,
      format: clipFormat.value,
      audio: audioMode.value,
      rotation: rotation.value,
      targetSizeMb: targetSizeMb.value || undefined
    };

    try {
      const result = await window.api.clipVideo(request);
      if (result.canceled) {
        status.value = 'canceled';
      } else if (result.success) {
        status.value = 'done';
        progress.value = 100;
        outputPath.value = result.outputPath ?? '';
        void sendToMain('clip-complete', {
          name: fileNameOf(videoPath.value),
          outputPath: result.outputPath
        });
      } else {
        status.value = 'error';
        error.value = result.error || t('tools.clipFailed');
      }
    } catch (e) {
      status.value = 'error';
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
      unsubscribeProgress();
    }
  }

  function cancelClip(): void {
    cancelRequested.value = true;
    if (!busy.value || !currentJobId) return;
    void window.api.cancelVideoClip(currentJobId);
  }

  function openPath(path?: string): void {
    if (path) void window.api.invoke('shell:showItemInFolder', path);
  }

  function openOutput(): void {
    openPath(outputPath.value);
  }

  return {
    container,
    clipMode,
    clipFormat,
    audioMode,
    rotation,
    targetSizeMb,
    outputDir,
    status,
    progress,
    speed,
    error,
    outputPath,
    busy,
    cancelRequested,
    clips,
    canExport,
    setRotation,
    resetExportState,
    addClip,
    removeClip,
    clearClips,
    startClipList,
    startClip,
    cancelClip,
    openPath,
    openOutput,
    unsubscribeProgress
  };
}
