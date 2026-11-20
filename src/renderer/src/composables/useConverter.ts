import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { filesForTool, inputKindOfPath, toolContextPaths } from '@shared/tool-input';
import { CONVERTER_AUDIO_EXTS, VIDEO_TOOL_EXTS } from '@shared/types/tools';
import type {
  MediaConvertProgress,
  MediaConvertRequest,
  ToolAudioFormat,
  ToolMediaKind,
  ToolVideoContainer,
  ToolVideoQuality
} from '@shared/types/tools';

export type JobStatus = 'pending' | 'converting' | 'done' | 'error' | 'canceled';

export interface ConvertJob {
  id: string;
  path: string;
  name: string;
  status: JobStatus;
  progress: number;
  speed?: string;
  outputPath?: string;
  error?: string;
}

/**
 * Stan i kolejka konwersji: wybór plików według rodzaju, wyjście, sekwencyjne
 * zadania z postępem i anulowaniem oraz kontekst z Eksploratora. Widok zostaje
 * przy formularzu i szablonie.
 */
export function useConverter() {
  const { t } = useI18n();
  const { context, sendToMain } = useToolBridge();

  const AUDIO_EXTS = new Set<string>(CONVERTER_AUDIO_EXTS);
  const VIDEO_EXTS = new Set<string>(VIDEO_TOOL_EXTS);

  const kind = ref<ToolMediaKind>('audio');
  const files = ref<string[]>([]);
  const jobs = ref<ConvertJob[]>([]);
  const outputDir = ref('');
  const audioFormat = ref<ToolAudioFormat>('mp3');
  const audioBitrate = ref(192);
  const videoContainer = ref<ToolVideoContainer>('mp4');
  const videoQuality = ref<ToolVideoQuality>('medium');
  const busy = ref(false);
  const cancelRequested = ref(false);
  const currentJobId = ref('');
  let offProgress: (() => void) | null = null;

  const bitrateDisabled = computed(
    () => kind.value === 'audio' && (audioFormat.value === 'flac' || audioFormat.value === 'wav')
  );

  watch(
    kind,
    () => {
      if (busy.value) return;
      files.value = [];
      jobs.value = [];
    },
    { flush: 'sync' }
  );

  function fileName(path: string): string {
    return path.split(/[\\/]/).pop() || path;
  }

  function extensionOf(path: string): string {
    const name = fileName(path);
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
  }

  function accepts(path: string): boolean {
    const ext = extensionOf(path);
    return kind.value === 'audio' ? AUDIO_EXTS.has(ext) : VIDEO_EXTS.has(ext);
  }

  function addFiles(paths: string[]): void {
    const next = new Set(files.value);
    for (const path of paths) {
      if (accepts(path)) next.add(path);
    }
    files.value = [...next];
  }

  async function pickFiles(): Promise<void> {
    if (busy.value) return;
    const filters =
      kind.value === 'audio'
        ? [{ name: t('tools.audio'), extensions: [...AUDIO_EXTS] }]
        : [{ name: t('tools.video'), extensions: [...VIDEO_EXTS] }];
    const result = (await window.api.invoke('dialog:openFile', {
      properties: ['openFile', 'multiSelections'],
      filters
    })) as { canceled: boolean; filePaths: string[] };
    if (!result.canceled) addFiles(result.filePaths);
  }

  function onDrop(event: DragEvent): void {
    if (busy.value) return;
    addFiles(getDroppedFilePaths(event.dataTransfer));
  }

  let appliedContextKey = '';

  // Otwarcie z Eksploratora (także gdy okno już żyje) zastępuje listę plików.
  function applyContext(): void {
    if (busy.value) return;
    const next = filesForTool('converter', toolContextPaths(context.value));
    if (next.length === 0) return;
    const key = next.join('\n');
    if (key === appliedContextKey) return;
    appliedContextKey = key;
    const targetKind = inputKindOfPath(next[0]) === 'video' ? 'video' : 'audio';
    if (kind.value !== targetKind) kind.value = targetKind;
    const accepted = targetKind === 'audio' ? AUDIO_EXTS : VIDEO_EXTS;
    files.value = next.filter((path) => accepted.has(extensionOf(path)));
    jobs.value = [];
  }

  watch(() => context.value, applyContext, { immediate: true });

  async function pickOutputDir(): Promise<void> {
    const paths = (await window.api.invoke('dialog:openFolder')) as string[];
    if (paths.length > 0) outputDir.value = paths[0];
  }

  function removeFile(path: string): void {
    if (busy.value) return;
    files.value = files.value.filter((p) => p !== path);
  }

  function clearFiles(): void {
    if (busy.value) return;
    files.value = [];
    jobs.value = [];
  }

  function statusLabel(status: JobStatus): string {
    return t(`tools.${status}`);
  }

  function fileCountLabel(count: number): string {
    const key =
      count === 1
        ? 'tools.fileCountOne'
        : count >= 2 && count <= 4
          ? 'tools.fileCountFew'
          : 'tools.fileCountMany';
    return t(key, { count });
  }

  function startConvert(): void {
    if (busy.value || files.value.length === 0) return;
    busy.value = true;
    cancelRequested.value = false;
    jobs.value = files.value.map((path) => ({
      id: crypto.randomUUID(),
      path,
      name: fileName(path),
      status: 'pending',
      progress: 0
    }));

    offProgress?.();
    offProgress = window.api.on('tools:progress', (payload) => {
      const progress = payload as MediaConvertProgress;
      const job = jobs.value.find((j) => j.id === progress.jobId);
      if (!job) return;
      if (progress.percent >= 0) job.progress = progress.percent;
      if (progress.speed) job.speed = progress.speed;
    });

    void runQueue();
  }

  async function runQueue(): Promise<void> {
    try {
      for (const job of jobs.value) {
        if (cancelRequested.value) {
          job.status = 'canceled';
          continue;
        }
        currentJobId.value = job.id;
        job.status = 'converting';
        job.progress = 0;
        const request: MediaConvertRequest = {
          jobId: job.id,
          kind: kind.value,
          inputPath: job.path,
          outputDir: outputDir.value.trim() || undefined,
          ...(kind.value === 'audio'
            ? { audioFormat: audioFormat.value, audioBitrate: audioBitrate.value }
            : { videoContainer: videoContainer.value, videoQuality: videoQuality.value })
        };
        try {
          const result = await window.api.convertMedia(request);
          if (result.canceled) {
            job.status = 'canceled';
            cancelRequested.value = true;
          } else if (result.success) {
            job.status = 'done';
            job.progress = 100;
            job.outputPath = result.outputPath;
            void sendToMain('conversion-complete', {
              name: job.name,
              outputPath: result.outputPath
            });
          } else {
            job.status = 'error';
            job.error = result.error || t('tools.convertFailed');
          }
        } catch (error) {
          job.status = 'error';
          job.error = error instanceof Error ? error.message : String(error);
        }
      }
    } finally {
      offProgress?.();
      offProgress = null;
      currentJobId.value = '';
      busy.value = false;
    }
  }

  function cancelConvert(): void {
    cancelRequested.value = true;
    if (currentJobId.value) void window.api.cancelMediaConvert(currentJobId.value);
  }

  function openOutput(path?: string): void {
    if (path) void window.api.invoke('shell:showItemInFolder', path);
  }

  onBeforeUnmount(() => {
    offProgress?.();
    offProgress = null;
  });

  return {
    kind,
    files,
    jobs,
    outputDir,
    audioFormat,
    audioBitrate,
    videoContainer,
    videoQuality,
    busy,
    bitrateDisabled,
    fileName,
    addFiles,
    pickFiles,
    onDrop,
    pickOutputDir,
    removeFile,
    clearFiles,
    statusLabel,
    fileCountLabel,
    startConvert,
    cancelConvert,
    openOutput
  };
}
