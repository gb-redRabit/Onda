import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { filesForTool, toolContextPaths } from '@shared/tool-input';
import {
  BATCH_IMAGES_MAX_FILES,
  IMAGE_TOOL_EXTS,
  type BatchImageProgress,
  type ImageOutputFormat
} from '@shared/types/tools';
import type { ToolStatus } from '@renderer/components/tools/ToolWindowShell.vue';

export type RowStatus = 'pending' | 'processing' | 'done' | 'error' | 'canceled';

export interface BatchRow {
  path: string;
  name: string;
  status: RowStatus;
  outputPath?: string;
  bytes?: number;
  error?: string;
}

/**
 * Stan wsadowej konwersji obrazów: lista z limitem, format/jakość/wymiary,
 * folder wyjściowy, postęp per plik i anulowanie. Widok zostaje przy formularzu.
 */
export function useBatchImages() {
  const { t } = useI18n();
  const { context } = useToolBridge();
  const IMAGE_EXTS: readonly string[] = IMAGE_TOOL_EXTS;

  const files = ref<BatchRow[]>([]);
  const format = ref<ImageOutputFormat>('webp');
  const quality = ref(85);
  const maxWidth = ref(0);
  const maxHeight = ref(0);
  const outputDir = ref('');
  const busy = ref(false);
  const cancelRequested = ref(false);
  const jobId = ref('');
  const doneCount = ref(0);
  const errorMsg = ref('');
  const status = computed<ToolStatus | null>(() =>
    errorMsg.value ? { tone: 'error', text: errorMsg.value } : null
  );

  const total = computed(() => files.value.length);
  const doneRows = computed(() => files.value.filter((row) => row.status === 'done').length);
  const failedRows = computed(() => files.value.filter((row) => row.status === 'error').length);
  const processed = computed(() => doneRows.value + failedRows.value);

  function fileName(path: string): string {
    return path.split(/[\\/]/).pop() || path;
  }

  function extensionOf(path: string): string {
    const name = fileName(path);
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
  }

  function statusLabel(status: RowStatus): string {
    if (status === 'processing') return t('tools.batchImagesProcessing');
    if (status === 'pending') return t('tools.pending');
    if (status === 'done') return t('tools.done');
    if (status === 'error') return t('tools.error');
    return t('tools.canceled');
  }

  function addFiles(paths: string[]): void {
    if (busy.value) return;
    const existing = new Set(files.value.map((row) => row.path));
    for (const path of paths) {
      if (!IMAGE_EXTS.includes(extensionOf(path))) continue;
      if (existing.has(path)) continue;
      existing.add(path);
      files.value.push({ path, name: fileName(path), status: 'pending' });
      if (files.value.length >= BATCH_IMAGES_MAX_FILES) break;
    }
  }

  async function pickFiles(): Promise<void> {
    if (busy.value) return;
    const result = (await window.api.invoke('dialog:openFile', {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: t('tools.imageStudioTitle'), extensions: [...IMAGE_EXTS] }]
    })) as { canceled: boolean; filePaths: string[] };
    if (!result.canceled) addFiles(result.filePaths);
  }

  function onDrop(event: DragEvent): void {
    addFiles(getDroppedFilePaths(event.dataTransfer));
  }

  function removeRow(path: string): void {
    if (busy.value) return;
    files.value = files.value.filter((row) => row.path !== path);
  }

  function clearAll(): void {
    if (busy.value) return;
    files.value = [];
    doneCount.value = 0;
    errorMsg.value = '';
  }

  async function pickOutputDir(): Promise<void> {
    const paths = (await window.api.invoke('dialog:openFolder')) as string[];
    if (paths.length > 0) outputDir.value = paths[0];
  }

  function openOutput(path?: string): void {
    if (path) void window.api.invoke('shell:showItemInFolder', path);
  }

  async function start(): Promise<void> {
    if (busy.value || files.value.length === 0) return;
    busy.value = true;
    cancelRequested.value = false;
    errorMsg.value = '';
    doneCount.value = 0;
    const id = crypto.randomUUID();
    jobId.value = id;
    for (const row of files.value) {
      row.status = 'pending';
      row.outputPath = undefined;
      row.bytes = undefined;
      row.error = undefined;
    }

    const off = window.api.on('tools:batchImagesProgress', (payload) => {
      const progress = payload as BatchImageProgress;
      if (progress.jobId !== id) return;
      const row = files.value.find((item) => item.path === progress.path);
      if (row) {
        row.status = progress.status;
        row.outputPath = progress.outputPath;
        row.bytes = progress.bytes;
        row.error = progress.error;
      }
      if (progress.status === 'done' || progress.status === 'error') {
        doneCount.value = Math.max(doneCount.value, progress.index + 1);
      }
    });

    try {
      const result = await window.api.batchConvertImages({
        jobId: id,
        inputPaths: files.value.map((row) => row.path),
        outputDir: outputDir.value.trim() || undefined,
        format: format.value,
        quality: quality.value,
        maxWidth: maxWidth.value || undefined,
        maxHeight: maxHeight.value || undefined
      });
      if (!result.success && result.error) errorMsg.value = result.error;
      if (result.canceled) {
        for (const row of files.value) {
          if (row.status === 'pending') row.status = 'canceled';
        }
      }
    } catch (error) {
      errorMsg.value = error instanceof Error ? error.message : String(error);
    } finally {
      off();
      busy.value = false;
    }
  }

  function cancel(): void {
    cancelRequested.value = true;
    if (jobId.value) void window.api.cancelBatchImages(jobId.value);
  }

  let appliedContextKey = '';

  // Otwarcie z Eksploratora zastępuje listę obrazów nowym zaznaczeniem.
  watch(
    () => context.value,
    () => {
      if (busy.value) return;
      const next = filesForTool('batch-images', toolContextPaths(context.value));
      if (next.length === 0) return;
      const key = next.join('\n');
      if (key === appliedContextKey) return;
      appliedContextKey = key;
      clearAll();
      addFiles(next);
    },
    { immediate: true }
  );

  return {
    files,
    format,
    quality,
    maxWidth,
    maxHeight,
    outputDir,
    busy,
    status,
    total,
    doneRows,
    failedRows,
    processed,
    statusLabel,
    addFiles,
    pickFiles,
    onDrop,
    removeRow,
    clearAll,
    pickOutputDir,
    openOutput,
    start,
    cancel
  };
}
