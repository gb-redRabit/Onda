import { onBeforeUnmount, ref } from 'vue';
import { extensionForFormat } from '@renderer/utils/imageStudio';
import type { ImageOutputFormat } from '@shared/types/tools';

/**
 * Zapis i szacowanie rozmiaru obrazu: PNG z canvasu, estymata po debouncie,
 * wybór folderu i ustawianie okładki w pliku audio. Widok dostarcza sposób
 * wyrenderowania canvasu eksportu oraz wspólny ref błędu.
 */
export function useImageStudioOutput(deps: {
  renderCanvas: () => HTMLCanvasElement | null;
  errorMsg: { value: string };
  t: (key: string) => string;
}) {
  const { renderCanvas, errorMsg, t } = deps;

  const outputFormat = ref<ImageOutputFormat>('webp');
  const quality = ref(85);
  const outputPath = ref('');
  const estimatedBytes = ref<number | null>(null);
  const savedBytes = ref<number | null>(null);
  const savedPath = ref('');
  const saving = ref(false);
  const estimating = ref(false);
  const coverAudioPath = ref('');
  const coverStatus = ref('');
  const coverOk = ref(false);
  let estimateTimer: ReturnType<typeof setTimeout> | null = null;

  async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<number[]> {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), 'image/png')
    );
    if (!blob) throw new Error('PNG export failed');
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  }

  function scheduleEstimate(): void {
    if (estimateTimer) clearTimeout(estimateTimer);
    estimateTimer = setTimeout(() => {
      estimateTimer = null;
      void estimateSize();
    }, 600);
  }

  async function estimateSize(): Promise<void> {
    const canvas = renderCanvas();
    if (!canvas) return;
    estimating.value = true;
    try {
      const png = await canvasToPngBytes(canvas);
      const result = await window.api.imageEstimate({
        png,
        format: outputFormat.value,
        quality: quality.value
      });
      estimatedBytes.value = result.success ? (result.bytes ?? null) : null;
    } catch {
      estimatedBytes.value = null;
    } finally {
      estimating.value = false;
    }
  }

  async function save(): Promise<void> {
    const canvas = renderCanvas();
    if (!canvas || !outputPath.value.trim()) return;
    saving.value = true;
    errorMsg.value = '';
    coverStatus.value = '';
    try {
      const png = await canvasToPngBytes(canvas);
      const result = await window.api.imageSave({
        png,
        outputPath: outputPath.value.trim(),
        format: outputFormat.value,
        quality: quality.value
      });
      if (!result.success) {
        errorMsg.value = result.error || t('tools.imageStudioSaveFailed');
        return;
      }
      savedBytes.value = result.bytes ?? null;
      savedPath.value = result.outputPath ?? '';
    } catch (error) {
      errorMsg.value = error instanceof Error ? error.message : String(error);
    } finally {
      saving.value = false;
    }
  }

  async function pickOutputDir(): Promise<void> {
    const paths = (await window.api.invoke('dialog:openFolder')) as string[];
    if (paths.length === 0) return;
    const name =
      outputPath.value.split(/[\\/]/).pop() || `edited.${extensionForFormat(outputFormat.value)}`;
    outputPath.value = `${paths[0].replace(/\\/g, '/')}/${name}`;
  }

  async function pickCoverAudio(): Promise<void> {
    const result = (await window.api.invoke('dialog:openFile', {
      properties: ['openFile'],
      filters: [
        {
          name: t('tools.audio'),
          extensions: ['mp3', 'flac', 'm4a', 'm4b', 'ogg', 'oga', 'opus', 'wav']
        }
      ]
    })) as { canceled: boolean; filePaths: string[] };
    const path = result.filePaths?.[0];
    if (!result.canceled && path) {
      coverAudioPath.value = path;
      coverStatus.value = '';
    }
  }

  async function setAsCover(): Promise<void> {
    if (!savedPath.value || !coverAudioPath.value) return;
    const result = await window.api.writeCover(coverAudioPath.value, savedPath.value);
    coverOk.value = result.success;
    coverStatus.value = result.success
      ? t('tools.imageStudioCoverSet')
      : result.error || t('tools.imageStudioCoverFailed');
  }

  onBeforeUnmount(() => {
    if (estimateTimer) clearTimeout(estimateTimer);
  });

  return {
    outputFormat,
    quality,
    outputPath,
    estimatedBytes,
    savedBytes,
    savedPath,
    saving,
    estimating,
    coverAudioPath,
    coverStatus,
    coverOk,
    estimateSize,
    scheduleEstimate,
    save,
    pickOutputDir,
    pickCoverAudio,
    setAsCover
  };
}
