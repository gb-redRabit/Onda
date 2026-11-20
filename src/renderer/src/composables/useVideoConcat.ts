import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { filesForTool, toolContextPaths } from '@shared/tool-input';
import { VIDEO_TOOL_EXTS } from '@shared/types/tools';
import type {
  MediaConvertProgress,
  VideoClipAudio,
  VideoClipContainer,
  VideoClipMode,
  VideoConcatRequest
} from '@shared/types/tools';

export type ConcatStatus = 'idle' | 'exporting' | 'done' | 'error' | 'canceled';

/**
 * Stan łączenia wideo: uporządkowana lista wejść, ustawienia wyjścia, postęp
 * i anulowanie oraz kontekst z Eksploratora. Widok zostaje przy formularzu.
 */
export function useVideoConcat() {
  const { t } = useI18n();
  const { context, sendToMain } = useToolBridge();
  const VIDEO_EXTS = new Set<string>(VIDEO_TOOL_EXTS);

  const files = ref<string[]>([]);
  const outputDir = ref('');
  const container = ref<VideoClipContainer>('mp4');
  const mode = ref<VideoClipMode>('copy');
  const audio = ref<VideoClipAudio>('keep');
  const status = ref<ConcatStatus>('idle');
  const progress = ref(0);
  const speed = ref('');
  const error = ref('');
  const outputPath = ref('');
  const busy = ref(false);
  let currentJobId = '';
  let offProgress: (() => void) | null = null;

  const canConcat = computed(() => files.value.length >= 2 && !busy.value);
  const copyHint = computed(() =>
    mode.value === 'copy' ? t('tools.concatCopyHint') : t('tools.concatExactHint')
  );

  function fileName(path: string): string {
    return path.split(/[\\/]/).pop() || path;
  }

  function extensionOf(path: string): string {
    const name = fileName(path);
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
  }

  function addFiles(paths: string[]): void {
    const next = new Set(files.value);
    for (const path of paths) {
      if (VIDEO_EXTS.has(extensionOf(path))) next.add(path);
    }
    files.value = [...next];
    status.value = 'idle';
    error.value = '';
    outputPath.value = '';
  }

  async function pickFiles(): Promise<void> {
    if (busy.value) return;
    const result = (await window.api.invoke('dialog:openFile', {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: t('tools.video'), extensions: [...VIDEO_EXTS] }]
    })) as { canceled: boolean; filePaths: string[] };
    if (!result.canceled) addFiles(result.filePaths);
  }

  function onDrop(event: DragEvent): void {
    if (busy.value) return;
    addFiles(getDroppedFilePaths(event.dataTransfer));
  }

  function removeFile(index: number): void {
    if (busy.value) return;
    files.value = files.value.filter((_, i) => i !== index);
  }

  function moveFile(index: number, direction: -1 | 1): void {
    if (busy.value) return;
    const target = index + direction;
    if (target < 0 || target >= files.value.length) return;
    const next = [...files.value];
    [next[index], next[target]] = [next[target], next[index]];
    files.value = next;
  }

  function clearFiles(): void {
    if (busy.value) return;
    files.value = [];
    status.value = 'idle';
    error.value = '';
    outputPath.value = '';
  }

  let appliedContextKey = '';

  // Otwarcie z Eksploratora zastępuje listę wejściową nowym zaznaczeniem.
  watch(
    () => context.value,
    () => {
      if (busy.value) return;
      const next = filesForTool('video-concat', toolContextPaths(context.value));
      if (next.length === 0) return;
      const key = next.join('\n');
      if (key === appliedContextKey) return;
      appliedContextKey = key;
      files.value = next;
      status.value = 'idle';
      error.value = '';
      outputPath.value = '';
    },
    { immediate: true }
  );

  async function pickOutputDir(): Promise<void> {
    const paths = (await window.api.invoke('dialog:openFolder')) as string[];
    if (paths.length > 0) outputDir.value = paths[0];
  }

  async function startConcat(): Promise<void> {
    if (!canConcat.value) return;
    busy.value = true;
    status.value = 'exporting';
    progress.value = 0;
    speed.value = '';
    error.value = '';
    outputPath.value = '';
    currentJobId = crypto.randomUUID();

    offProgress?.();
    offProgress = window.api.on('tools:progress', (payload) => {
      const update = payload as MediaConvertProgress;
      if (update.jobId !== currentJobId) return;
      if (update.percent >= 0) progress.value = update.percent;
      if (update.speed) speed.value = update.speed;
    });

    const request: VideoConcatRequest = {
      jobId: currentJobId,
      inputPaths: [...files.value],
      outputDir: outputDir.value.trim() || undefined,
      container: container.value,
      mode: mode.value,
      audio: audio.value
    };

    try {
      const result = await window.api.concatVideos(request);
      if (result.canceled) {
        status.value = 'canceled';
      } else if (result.success) {
        status.value = 'done';
        progress.value = 100;
        outputPath.value = result.outputPath ?? '';
        void sendToMain('concat-complete', {
          name: fileName(files.value[0] ?? ''),
          outputPath: result.outputPath
        });
      } else {
        status.value = 'error';
        error.value = result.error || t('tools.concatFailed');
      }
    } catch (e) {
      status.value = 'error';
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
      offProgress?.();
      offProgress = null;
    }
  }

  function cancelConcat(): void {
    if (!busy.value || !currentJobId) return;
    void window.api.cancelVideoConcat(currentJobId);
  }

  function openOutput(): void {
    if (outputPath.value) void window.api.invoke('shell:showItemInFolder', outputPath.value);
  }

  onBeforeUnmount(() => {
    offProgress?.();
    offProgress = null;
  });

  return {
    files,
    outputDir,
    container,
    mode,
    audio,
    status,
    progress,
    speed,
    error,
    outputPath,
    busy,
    canConcat,
    copyHint,
    fileName,
    addFiles,
    pickFiles,
    onDrop,
    removeFile,
    moveFile,
    clearFiles,
    pickOutputDir,
    startConcat,
    cancelConcat,
    openOutput
  };
}
