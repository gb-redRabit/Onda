<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, Image as ImageIcon, Save } from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import Spinner from '@renderer/components/ui/Spinner.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import Button from '@renderer/components/ui/Button.vue';
import ImageStudioAdjustPanel from '@renderer/components/tools/image/ImageStudioAdjustPanel.vue';
import ImageStudioAnnotationPanel from '@renderer/components/tools/image/ImageStudioAnnotationPanel.vue';
import ImageStudioCoverPanel from '@renderer/components/tools/image/ImageStudioCoverPanel.vue';
import ImageStudioCropPanel from '@renderer/components/tools/image/ImageStudioCropPanel.vue';
import ImageStudioOutputPanel from '@renderer/components/tools/image/ImageStudioOutputPanel.vue';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import {
  useImageStudioInteraction,
  type StudioTool
} from '@renderer/composables/useImageStudioInteraction';
import {
  drawAnnotations,
  drawCropOverlay,
  renderBaseCanvas,
  renderExportCanvas as renderExportCanvasIn
} from '@renderer/utils/imageStudioCanvas';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { filesForTool, toolContextPaths } from '@shared/tool-input';
import {
  MAX_OUTPUT_DIMENSION,
  computeAspectCrop,
  extensionForFormat,
  fileNameOf as fileName,
  formatBytes,
  suggestOutputPath,
  type Annotation,
  type Aspect,
  type CropRect
} from '@renderer/utils/imageStudio';
import type { ImageOutputFormat, ImageStudioLoadResult } from '@shared/types/tools';

type Tool = StudioTool;
const MAX_PREVIEW_W = 720;
const MAX_PREVIEW_H = 540;

const { t } = useI18n();
const { context } = useToolBridge();

const sourcePath = ref('');
const sourceBytes = ref(0);
const sourceFormat = ref('');
const sourceWidth = ref(0);
const sourceHeight = ref(0);
const image = ref<HTMLImageElement | null>(null);
const loading = ref(false);
const errorMsg = ref('');

const rotation = ref(0);
const flipH = ref(false);
const flipV = ref(false);
// Cache bazowego canvasu: `renderPreview` jest wołany na każdym `pointermove`,
// a buildBaseCanvas + sharpen to pełny przebieg po pikselach. Klucz obejmuje
// wszystkie parametry, które zmieniają obraz bazowy.
let baseCache: { key: string; canvas: HTMLCanvasElement } | null = null;
let imageRevision = 0;

const adjust = reactive({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  temperature: 0,
  sharpen: 0
});

const crop = reactive<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
const aspect = ref<Aspect>('free');

const annotations = ref<Annotation[]>([]);
const tool = ref<Tool>('crop');
const color = ref('#ff3b30');
const strokeWidth = ref(8);
const textValue = ref('');

const outputFormat = ref<ImageOutputFormat>('webp');
const quality = ref(85);
const outputWidth = ref(0);
const outputPath = ref('');
const estimatedBytes = ref<number | null>(null);
const savedBytes = ref<number | null>(null);
const savedPath = ref('');
const saving = ref(false);
const estimating = ref(false);

const coverAudioPath = ref('');
const coverStatus = ref('');
const coverOk = ref(false);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const selectedId = ref<string | null>(null);

const orientedW = computed(() =>
  rotation.value % 180 === 0 ? sourceWidth.value : sourceHeight.value
);
const orientedH = computed(() =>
  rotation.value % 180 === 0 ? sourceHeight.value : sourceWidth.value
);
const previewScale = computed(() => {
  if (!orientedW.value || !orientedH.value) return 1;
  return Math.min(MAX_PREVIEW_W / orientedW.value, MAX_PREVIEW_H / orientedH.value);
});
const previewW = computed(() => Math.max(1, Math.round(orientedW.value * previewScale.value)));
const previewH = computed(() => Math.max(1, Math.round(orientedH.value * previewScale.value)));
const outputHeight = computed(() => {
  if (!crop.w || !crop.h || !outputWidth.value) return 0;
  return Math.max(1, Math.round((outputWidth.value * crop.h) / crop.w));
});
const hasImage = computed(() => !!image.value);
const selectedWidth = computed(
  () => annotations.value.find((annotation) => annotation.id === selectedId.value)?.width ?? null
);

let estimateTimer: ReturnType<typeof setTimeout> | null = null;

const {
  cropCursor,
  pointerToImage,
  updateCropFromDrag,
  hitCropHandle,
  resizeCrop,
  updateCursor,
  deleteSelected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  undoAnnotation,
  clearAnnotations
} = useImageStudioInteraction({
  canvasRef,
  image,
  crop,
  aspect,
  annotations,
  tool,
  color,
  strokeWidth,
  textValue,
  selectedId,
  orientedW,
  orientedH,
  previewScale,
  outputWidth,
  renderPreview,
  scheduleEstimate
});

// Testy sterują tymi operacjami bezpośrednio, tak jak zdarzenia wskaźnika;
// jawny eksport dokumentuje ten kontrakt (i nie gubi go w buildzie).
defineExpose({ pointerToImage, updateCropFromDrag, hitCropHandle, resizeCrop, updateCursor });

function resetCropToFull(): void {
  crop.x = 0;
  crop.y = 0;
  crop.w = orientedW.value;
  crop.h = orientedH.value;
  outputWidth.value = Math.min(crop.w, MAX_OUTPUT_DIMENSION);
}

async function loadPath(path: string): Promise<void> {
  if (!path) return;
  loading.value = true;
  errorMsg.value = '';
  coverStatus.value = '';
  try {
    const result: ImageStudioLoadResult = await window.api.imageRead(path);
    if (!result.success || !result.dataUrl || !result.width || !result.height) {
      errorMsg.value = result.error || t('tools.imageStudioLoadFailed');
      return;
    }
    sourcePath.value = path;
    sourceBytes.value = result.bytes ?? 0;
    sourceFormat.value = result.format ?? '';
    sourceWidth.value = result.width;
    sourceHeight.value = result.height;
    rotation.value = 0;
    flipH.value = false;
    flipV.value = false;
    annotations.value = [];
    resetCropToFull();
    outputPath.value = suggestOutputPath(path, outputFormat.value);
    savedPath.value = '';
    savedBytes.value = null;
    estimatedBytes.value = null;
    const img = await loadImageElement(result.dataUrl);
    image.value = img;
    imageRevision++;
    baseCache = null;
    await nextTick();
    renderPreview();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

async function pickImage(): Promise<void> {
  const result = (await window.api.invoke('dialog:openImage')) as {
    canceled: boolean;
    filePaths: string[];
  };
  const path = result.filePaths?.[0];
  if (!result.canceled && path) await loadPath(path);
}

function onDropImage(event: DragEvent): void {
  const paths = getDroppedFilePaths(event.dataTransfer);
  const imagePath = paths.find((path) =>
    /\.(png|jpe?g|webp|avif|gif|bmp|tiff?|heic|heif)$/i.test(path)
  );
  if (imagePath) void loadPath(imagePath);
}

function applyAspect(): void {
  if (!orientedW.value || !orientedH.value) return;
  const next = computeAspectCrop(aspect.value, orientedW.value, orientedH.value);
  if (!next) {
    resetCropToFull();
  } else {
    crop.x = next.x;
    crop.y = next.y;
    crop.w = next.w;
    crop.h = next.h;
    outputWidth.value = Math.min(Math.round(next.w), MAX_OUTPUT_DIMENSION);
  }
  renderPreview();
  scheduleEstimate();
}

function rotateBy(direction: 1 | -1): void {
  rotation.value = (rotation.value + direction * 90 + 360) % 360;
  annotations.value = [];
  resetCropToFull();
  renderPreview();
  scheduleEstimate();
}

function toggleFlip(axis: 'h' | 'v'): void {
  if (axis === 'h') flipH.value = !flipH.value;
  else flipV.value = !flipV.value;
  annotations.value = [];
  renderPreview();
  scheduleEstimate();
}

function baseCacheKey(maxDimension?: number): string {
  return [
    imageRevision,
    maxDimension ?? 'full',
    rotation.value,
    flipH.value ? 1 : 0,
    flipV.value ? 1 : 0,
    adjust.brightness,
    adjust.contrast,
    adjust.saturation,
    adjust.temperature,
    adjust.sharpen
  ].join('|');
}

function buildBaseCanvas(maxDimension?: number): HTMLCanvasElement {
  const cacheKey = maxDimension ? baseCacheKey(maxDimension) : '';
  if (maxDimension && baseCache?.key === cacheKey) return baseCache.canvas;
  const canvas = renderBaseCanvas({
    image: image.value as HTMLImageElement,
    sourceWidth: sourceWidth.value,
    sourceHeight: sourceHeight.value,
    orientedWidth: orientedW.value,
    orientedHeight: orientedH.value,
    rotation: rotation.value,
    flipH: flipH.value,
    flipV: flipV.value,
    adjust,
    maxDimension
  });
  if (maxDimension) baseCache = { key: cacheKey, canvas };
  return canvas;
}

function renderPreview(): void {
  const canvas = canvasRef.value;
  if (!canvas || !image.value) return;
  canvas.width = previewW.value;
  canvas.height = previewH.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const base = buildBaseCanvas(Math.max(canvas.width, canvas.height));
  const baseScale = base.width / orientedW.value;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
  drawAnnotations(
    ctx,
    annotations.value,
    selectedId.value,
    base,
    baseScale,
    (annotation) => ({
      x: annotation.x1 * previewScale.value,
      y: annotation.y1 * previewScale.value,
      w: (annotation.x2 - annotation.x1) * previewScale.value,
      h: (annotation.y2 - annotation.y1) * previewScale.value
    }),
    previewScale.value
  );
  if (tool.value === 'crop') drawCropOverlay(ctx, canvas, crop, previewScale.value);
}

function renderExportCanvas(): HTMLCanvasElement | null {
  if (!image.value || !crop.w || !crop.h || !outputWidth.value) return null;
  return renderExportCanvasIn({
    base: () => buildBaseCanvas(),
    orientedWidth: orientedW.value,
    crop,
    outputWidth: outputWidth.value,
    annotations: annotations.value,
    selectedId: selectedId.value,
    maxDimension: MAX_OUTPUT_DIMENSION
  });
}

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
  const canvas = renderExportCanvas();
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
  const canvas = renderExportCanvas();
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

watch(
  () => context.value,
  (ctx) => {
    const path = filesForTool('image-studio', toolContextPaths(ctx))[0] ?? '';
    if (path && path !== sourcePath.value) void loadPath(path);
  },
  { immediate: true }
);

watch(
  adjust,
  () => {
    renderPreview();
    scheduleEstimate();
  },
  { deep: true }
);

watch([color, strokeWidth], () => {
  const selected = annotations.value.find((item) => item.id === selectedId.value);
  if (!selected) return;
  selected.color = color.value;
  selected.width = strokeWidth.value;
  renderPreview();
  scheduleEstimate();
});

watch([outputFormat, quality, outputWidth], () => {
  if (outputFormat.value) {
    outputPath.value = outputPath.value.replace(
      /\.(png|jpe?g|webp|avif)$/i,
      `.${extensionForFormat(outputFormat.value)}`
    );
  }
  scheduleEstimate();
});

onBeforeUnmount(() => {
  if (estimateTimer) clearTimeout(estimateTimer);
});
</script>

<template>
  <ToolWindowShell :title="t('tools.imageStudioTitle')" :icon="ImageIcon">
    <div
      data-testid="image-studio-view"
      class="flex h-full flex-col"
      @dragover.prevent
      @drop.prevent="onDropImage"
    >
      <div class="flex-1 overflow-hidden">
        <div v-if="!hasImage && !loading" class="flex h-full items-center justify-center p-6">
          <div class="max-w-md text-center">
            <EmptyState
              :title="t('tools.imageStudioEmpty')"
              :description="t('tools.imageStudioDropHint')"
              :icon="ImageIcon"
            />
            <button
              type="button"
              data-testid="image-studio-open"
              class="fx-noise mt-4 rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90"
              @click="pickImage"
            >
              {{ t('tools.imageStudioOpen') }}
            </button>
          </div>
        </div>

        <div
          v-else-if="!hasImage && loading"
          class="flex h-full items-center justify-center gap-2 p-6 text-sm text-base-content/60"
        >
          <Spinner :size="18" />
          {{ t('tools.imageStudioLoading') }}
        </div>

        <div v-else class="flex h-full min-h-0">
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
              <canvas
                ref="canvasRef"
                data-testid="image-studio-canvas"
                :data-crop="`${Math.round(crop.x)},${Math.round(crop.y)},${Math.round(crop.w)},${Math.round(crop.h)}`"
                :data-image="`${orientedW},${orientedH}`"
                :data-output="`${Math.round(outputWidth)},${outputHeight}`"
                :data-annotation-count="annotations.length"
                :data-selected-width="selectedWidth ?? ''"
                class="max-h-full max-w-full rounded-box border border-hairline shadow-lg"
                :style="{ cursor: cropCursor }"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
              />
            </div>
            <div
              class="flex items-center gap-3 border-t border-hairline px-3 py-2 text-2xs text-base-content/60"
            >
              <span class="truncate" :title="sourcePath">{{ fileName(sourcePath) }}</span>
              <button
                type="button"
                data-testid="image-studio-replace"
                class="fx-noise shrink-0 rounded-field border border-hairline px-2 py-0.5 text-2xs hover:bg-base-content/10 disabled:cursor-wait disabled:opacity-60"
                :disabled="loading"
                @click="pickImage"
              >
                {{ t('tools.imageStudioChange') }}
              </button>
              <span>{{ sourceWidth }}×{{ sourceHeight }} · {{ sourceFormat }}</span>
              <span>{{ t('tools.imageStudioSourceSize') }}: {{ formatBytes(sourceBytes) }}</span>
              <span class="ml-auto"
                >{{ t('tools.imageStudioCrop') }}: {{ Math.round(crop.w) }}×{{
                  Math.round(crop.h)
                }}</span
              >
            </div>
          </div>

          <aside class="w-80 shrink-0 space-y-3 overflow-y-auto border-l border-hairline p-3">
            <ImageStudioCropPanel
              v-model:aspect="aspect"
              @apply="applyAspect"
              @rotate="rotateBy"
              @flip="toggleFlip"
            />

            <ImageStudioAdjustPanel
              v-model:brightness="adjust.brightness"
              v-model:contrast="adjust.contrast"
              v-model:saturation="adjust.saturation"
              v-model:temperature="adjust.temperature"
              v-model:sharpen="adjust.sharpen"
            />

            <ImageStudioAnnotationPanel
              v-model:tool="tool"
              v-model:text-value="textValue"
              v-model:color="color"
              v-model:stroke-width="strokeWidth"
              :annotation-count="annotations.length"
              :has-selection="!!selectedId"
              @undo="undoAnnotation"
              @remove="deleteSelected"
              @clear="clearAnnotations"
            />

            <ImageStudioOutputPanel
              v-model:output-format="outputFormat"
              v-model:quality="quality"
              v-model:output-width="outputWidth"
              v-model:output-path="outputPath"
              :output-height="outputHeight"
              :estimated-bytes="estimatedBytes"
              :estimating="estimating"
              :saved-path="savedPath"
              :saved-bytes="savedBytes"
              :error-message="errorMsg"
              @estimate="estimateSize"
              @browse="pickOutputDir"
            />

            <ImageStudioCoverPanel
              v-model:cover-audio-path="coverAudioPath"
              :saved-path="savedPath"
              :status="coverStatus"
              :ok="coverOk"
              @browse="pickCoverAudio"
              @apply="setAsCover"
            />
          </aside>
        </div>
      </div>
    </div>

    <template #footer>
      <p v-if="savedPath" class="mr-auto flex items-center gap-1 text-2xs text-success">
        <Check :size="12" />
        {{ t('tools.imageStudioSaved', { size: formatBytes(savedBytes) }) }}
      </p>
      <Button
        variant="solid"
        data-testid="image-studio-save"
        :disabled="saving || !outputPath.trim()"
        :loading="saving"
        @click="save"
      >
        <template #leading><Save :size="14" /></template>
        {{ saving ? t('tools.imageStudioSaving') : t('tools.imageStudioSave') }}
      </Button>
    </template>
  </ToolWindowShell>
</template>
