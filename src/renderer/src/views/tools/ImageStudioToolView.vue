<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowUpRight,
  Check,
  Crop,
  Droplets,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Grid2x2,
  Image as ImageIcon,
  RotateCcw,
  RotateCw,
  Save,
  Square,
  Trash2,
  Type,
  Undo2
} from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import {
  IMAGE_OUTPUT_FORMATS,
  type ImageOutputFormat,
  type ImageStudioLoadResult
} from '@shared/types/tools';

type Aspect = 'free' | '1:1' | '16:9' | '4:3';
type Tool = 'crop' | 'rect' | 'arrow' | 'text' | 'blur' | 'pixelate';

interface Annotation {
  id: string;
  kind: Exclude<Tool, 'crop'>;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  text?: string;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TargetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_PREVIEW_W = 720;
const MAX_PREVIEW_H = 540;
const MAX_OUTPUT_DIMENSION = 4096;

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
const cropCursor = ref('crosshair');
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

const ASPECTS: Array<{ id: Aspect; key: string }> = [
  { id: 'free', key: 'imageStudioAspectFree' },
  { id: '1:1', key: 'imageStudioAspectSquare' },
  { id: '16:9', key: 'imageStudioAspectWide' },
  { id: '4:3', key: 'imageStudioAspectClassic' }
];

const TOOLS: Array<{ id: Tool; key: string; icon: Component }> = [
  { id: 'crop', key: 'imageStudioToolCrop', icon: Crop },
  { id: 'rect', key: 'imageStudioToolRect', icon: Square },
  { id: 'arrow', key: 'imageStudioToolArrow', icon: ArrowUpRight },
  { id: 'text', key: 'imageStudioToolText', icon: Type },
  { id: 'blur', key: 'imageStudioToolBlur', icon: Droplets },
  { id: 'pixelate', key: 'imageStudioToolPixelate', icon: Grid2x2 }
];

const ADJUST_FIELDS = [
  { id: 'brightness', label: 'imageStudioBrightness', min: 0, max: 200 },
  { id: 'contrast', label: 'imageStudioContrast', min: 0, max: 200 },
  { id: 'saturation', label: 'imageStudioSaturation', min: 0, max: 200 },
  { id: 'temperature', label: 'imageStudioTemperature', min: -100, max: 100 },
  { id: 'sharpen', label: 'imageStudioSharpen', min: 0, max: 100 }
] as const;

type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'draw';

let estimateTimer: ReturnType<typeof setTimeout> | null = null;
let drag:
  | {
      mode: 'crop';
      handle: CropHandle;
      startX: number;
      startY: number;
      origin: CropRect;
    }
  | { mode: 'annotation'; startX: number; startY: number; annotationId: string }
  | null = null;

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function extensionForFormat(format: ImageOutputFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

function suggestOutputPath(path: string, format: ImageOutputFormat): string {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  const dir = slash >= 0 ? normalized.slice(0, slash) : '.';
  const name = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  return `${dir}/${base}-edited.${extensionForFormat(format)}`;
}

function clampTag(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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
  if (aspect.value === 'free') {
    resetCropToFull();
  } else {
    const ratio = aspect.value === '1:1' ? 1 : aspect.value === '16:9' ? 16 / 9 : 4 / 3;
    let w = orientedW.value;
    let h = w / ratio;
    if (h > orientedH.value) {
      h = orientedH.value;
      w = h * ratio;
    }
    crop.x = (orientedW.value - w) / 2;
    crop.y = (orientedH.value - h) / 2;
    crop.w = w;
    crop.h = h;
    outputWidth.value = Math.min(Math.round(w), MAX_OUTPUT_DIMENSION);
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

function buildBaseCanvas(maxDimension?: number): HTMLCanvasElement {
  const img = image.value as HTMLImageElement;
  const width = orientedW.value;
  const height = orientedH.value;
  const scale = maxDimension ? Math.min(1, maxDimension / Math.max(width, height)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.filter = `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%)`;
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rotation.value * Math.PI) / 180);
  ctx.scale(flipH.value ? -1 : 1, flipV.value ? -1 : 1);
  ctx.translate(-sourceWidth.value / 2, -sourceHeight.value / 2);
  ctx.drawImage(img, 0, 0, sourceWidth.value, sourceHeight.value);
  ctx.restore();

  if (adjust.temperature !== 0) {
    const strength = clampTag(Math.abs(adjust.temperature) / 100, 0, 1) * 0.6;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle =
      adjust.temperature > 0
        ? `rgba(255, 170, 80, ${strength})`
        : `rgba(80, 160, 255, ${strength})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  if (adjust.sharpen > 0) sharpenCanvas(canvas, adjust.sharpen / 100);
  return canvas;
}

function sharpenCanvas(canvas: HTMLCanvasElement, amount: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  if (width < 3 || height < 3) return;
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const src = new Uint8ClampedArray(data.data);
  const dst = data.data;
  const center = 1 + 4 * amount;
  const row = width * 4;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c += 1) {
        dst[i + c] =
          center * src[i + c] -
          amount * (src[i - 4 + c] + src[i + 4 + c] + src[i - row + c] + src[i + row + c]);
      }
    }
  }
  ctx.putImageData(data, 0, 0);
}

function drawEffectRegion(
  ctx: CanvasRenderingContext2D,
  base: HTMLCanvasElement,
  annotation: Annotation,
  baseScale: number,
  target: TargetRect
): void {
  const sx = annotation.x1 * baseScale;
  const sy = annotation.y1 * baseScale;
  const sw = Math.max(1, (annotation.x2 - annotation.x1) * baseScale);
  const sh = Math.max(1, (annotation.y2 - annotation.y1) * baseScale);
  const w = Math.max(1, Math.round(target.w));
  const h = Math.max(1, Math.round(target.h));
  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const tctx = temp.getContext('2d');
  if (!tctx) return;
  if (annotation.kind === 'blur') {
    tctx.filter = `blur(${Math.max(2, Math.round(Math.min(w, h) * 0.08))}px)`;
    tctx.drawImage(base, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    const pixel = Math.max(2, Math.round(Math.min(w, h) * 0.05));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(w / pixel));
    small.height = Math.max(1, Math.round(h / pixel));
    const sctx = small.getContext('2d');
    if (!sctx) return;
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(base, sx, sy, sw, sh, 0, 0, small.width, small.height);
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(target.x, target.y, w, h);
  ctx.clip();
  ctx.drawImage(temp, target.x, target.y, w, h);
  ctx.restore();
}

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  base: HTMLCanvasElement,
  baseScale: number,
  toTarget: (annotation: Annotation) => TargetRect,
  scale: number
): void {
  for (const annotation of annotations.value) {
    const target = toTarget(annotation);
    if (annotation.kind === 'blur' || annotation.kind === 'pixelate') {
      drawEffectRegion(ctx, base, annotation, baseScale, target);
    } else {
      ctx.save();
      ctx.strokeStyle = annotation.color;
      ctx.fillStyle = annotation.color;
      ctx.lineWidth = Math.max(1.5, annotation.width * scale);
      ctx.lineCap = 'round';
      if (annotation.kind === 'rect') {
        ctx.strokeRect(target.x, target.y, target.w, target.h);
      } else if (annotation.kind === 'arrow') {
        const x2 = target.x + target.w;
        const y2 = target.y + target.h;
        ctx.beginPath();
        ctx.moveTo(target.x, target.y);
        ctx.lineTo(x2, y2);
        const angle = Math.atan2(target.h, target.w);
        const head = Math.max(8, annotation.width * scale * 2.5);
        ctx.lineTo(
          x2 - head * Math.cos(angle - Math.PI / 6),
          y2 - head * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - head * Math.cos(angle + Math.PI / 6),
          y2 - head * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      } else if (annotation.kind === 'text' && annotation.text) {
        const fontSize = Math.max(10, annotation.width * scale * 2);
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        const lines = annotation.text.split('\n');
        lines.forEach((line, index) => {
          ctx.fillText(line, target.x, target.y + index * fontSize * 1.2);
        });
      }
      ctx.restore();
    }
    if (annotation.id === selectedId.value) {
      const bounds = annotationBounds(annotation);
      const outline = toTarget({
        ...annotation,
        x1: bounds.x,
        y1: bounds.y,
        x2: bounds.x + bounds.w,
        y2: bounds.y + bounds.h
      });
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        outline.x - 3,
        outline.y - 3,
        Math.max(4, outline.w) + 6,
        Math.max(4, outline.h) + 6
      );
      ctx.restore();
    }
  }
}

function drawCropOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const scale = previewScale.value;
  const x = crop.x * scale;
  const y = crop.y * scale;
  const w = crop.w * scale;
  const h = crop.h * scale;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, y);
  ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, canvas.width - x - w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  for (let i = 1; i < 3; i += 1) {
    ctx.moveTo(x + (w * i) / 3, y);
    ctx.lineTo(x + (w * i) / 3, y + h);
    ctx.moveTo(x, y + (h * i) / 3);
    ctx.lineTo(x + w, y + (h * i) / 3);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  const corners: Array<[number, number]> = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h]
  ];
  for (const [cornerX, cornerY] of corners) {
    ctx.beginPath();
    ctx.rect(cornerX - 5, cornerY - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
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
  if (tool.value === 'crop') drawCropOverlay(ctx, canvas);
}

function pointerToImage(event: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = ((event.clientX - rect.left) * scaleX) / previewScale.value;
  const y = ((event.clientY - rect.top) * scaleY) / previewScale.value;
  return {
    x: clampTag(x, 0, orientedW.value),
    y: clampTag(y, 0, orientedH.value)
  };
}

function updateCropFromDrag(sx: number, sy: number, ex: number, ey: number): void {
  const width = orientedW.value;
  const height = orientedH.value;
  let x1 = Math.min(sx, ex);
  let y1 = Math.min(sy, ey);
  let x2 = Math.max(sx, ex);
  let y2 = Math.max(sy, ey);
  let w = Math.max(1, x2 - x1);
  let h = Math.max(1, y2 - y1);
  const ratio =
    aspect.value === '1:1'
      ? 1
      : aspect.value === '16:9'
        ? 16 / 9
        : aspect.value === '4:3'
          ? 4 / 3
          : 0;
  if (ratio > 0) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    x1 = ex >= sx ? sx : sx - w;
    y1 = ey >= sy ? sy : sy - h;
    x2 = x1 + w;
    y2 = y1 + h;
    if (x1 < 0) {
      x1 = 0;
      x2 = Math.min(width, w);
    }
    if (y1 < 0) {
      y1 = 0;
      y2 = Math.min(height, h);
    }
    if (x2 > width) {
      x2 = width;
      x1 = Math.max(0, width - w);
    }
    if (y2 > height) {
      y2 = height;
      y1 = Math.max(0, height - h);
    }
  }
  crop.x = clampTag(x1, 0, width - 1);
  crop.y = clampTag(y1, 0, height - 1);
  crop.w = Math.max(1, Math.min(width - crop.x, x2 - crop.x));
  crop.h = Math.max(1, Math.min(height - crop.y, y2 - crop.y));
  renderPreview();
}

function aspectRatio(): number {
  if (aspect.value === '1:1') return 1;
  if (aspect.value === '16:9') return 16 / 9;
  if (aspect.value === '4:3') return 4 / 3;
  return 0;
}

/** Obrys adnotacji w układzie obrazu (tekst ma rozmiar oszacowany z fontu). */
function annotationBounds(annotation: Annotation): TargetRect {
  const x = Math.min(annotation.x1, annotation.x2);
  const y = Math.min(annotation.y1, annotation.y2);
  if (annotation.kind === 'text' && annotation.text) {
    const fontSize = Math.max(8, annotation.width * 2);
    const lines = annotation.text.split('\n');
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
    return {
      x,
      y,
      w: Math.max(1, longest * fontSize * 0.6),
      h: Math.max(1, lines.length * fontSize * 1.2)
    };
  }
  return {
    x,
    y,
    w: Math.max(1, Math.abs(annotation.x2 - annotation.x1)),
    h: Math.max(1, Math.abs(annotation.y2 - annotation.y1))
  };
}

function hitAnnotation(point: { x: number; y: number }): Annotation | null {
  for (let index = annotations.value.length - 1; index >= 0; index -= 1) {
    const annotation = annotations.value[index];
    const bounds = annotationBounds(annotation);
    const pad = Math.max(6, annotation.width);
    if (
      point.x >= bounds.x - pad &&
      point.x <= bounds.x + bounds.w + pad &&
      point.y >= bounds.y - pad &&
      point.y <= bounds.y + bounds.h + pad
    ) {
      return annotation;
    }
  }
  return null;
}

function hitCropHandle(event: PointerEvent): CropHandle {
  const canvas = canvasRef.value;
  if (!canvas) return 'draw';
  const rect = canvas.getBoundingClientRect();
  const px = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const py = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const scale = previewScale.value;
  const x = crop.x * scale;
  const y = crop.y * scale;
  const w = crop.w * scale;
  const h = crop.h * scale;
  const radius = 14;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= radius;
  if (near(px, x) && near(py, y)) return 'nw';
  if (near(px, x + w) && near(py, y)) return 'ne';
  if (near(px, x) && near(py, y + h)) return 'sw';
  if (near(px, x + w) && near(py, y + h)) return 'se';
  if (px >= x && px <= x + w && py >= y && py <= y + h) return 'move';
  return 'draw';
}

function resizeCrop(handle: CropHandle, origin: CropRect, dx: number, dy: number): void {
  const width = orientedW.value;
  const height = orientedH.value;
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.w;
  let bottom = origin.y + origin.h;
  if (handle === 'nw') {
    left = clampTag(left + dx, 0, right - 4);
    top = clampTag(top + dy, 0, bottom - 4);
  } else if (handle === 'ne') {
    right = clampTag(right + dx, left + 4, width);
    top = clampTag(top + dy, 0, bottom - 4);
  } else if (handle === 'sw') {
    left = clampTag(left + dx, 0, right - 4);
    bottom = clampTag(bottom + dy, top + 4, height);
  } else if (handle === 'se') {
    right = clampTag(right + dx, left + 4, width);
    bottom = clampTag(bottom + dy, top + 4, height);
  }
  let w = right - left;
  let h = bottom - top;
  const ratio = aspectRatio();
  if (ratio > 0) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    if (handle === 'nw' || handle === 'sw') left = right - w;
    else right = left + w;
    if (handle === 'nw' || handle === 'ne') top = bottom - h;
    else bottom = top + h;
    if (left < 0) {
      left = 0;
      right = w;
    }
    if (top < 0) {
      top = 0;
      bottom = h;
    }
    if (right > width) {
      right = width;
      left = width - w;
    }
    if (bottom > height) {
      bottom = height;
      top = height - h;
    }
  }
  crop.x = clampTag(left, 0, width - 4);
  crop.y = clampTag(top, 0, height - 4);
  crop.w = Math.max(4, Math.min(width - crop.x, right - crop.x));
  crop.h = Math.max(4, Math.min(height - crop.y, bottom - crop.y));
  renderPreview();
}

function updateCursor(event: PointerEvent): void {
  if (drag) return;
  if (tool.value !== 'crop') {
    cropCursor.value = 'crosshair';
    return;
  }
  const handle = hitCropHandle(event);
  cropCursor.value =
    handle === 'move'
      ? 'move'
      : handle === 'nw' || handle === 'se'
        ? 'nwse-resize'
        : handle === 'ne' || handle === 'sw'
          ? 'nesw-resize'
          : 'crosshair';
}

function deleteSelected(): void {
  if (!selectedId.value) return;
  annotations.value = annotations.value.filter((item) => item.id !== selectedId.value);
  selectedId.value = null;
  renderPreview();
  scheduleEstimate();
}

function onPointerDown(event: PointerEvent): void {
  if (!image.value) return;
  const point = pointerToImage(event);
  if (tool.value === 'crop') {
    const handle = hitCropHandle(event);
    drag = { mode: 'crop', handle, startX: point.x, startY: point.y, origin: { ...crop } };
    if (handle === 'draw') {
      crop.x = point.x;
      crop.y = point.y;
      crop.w = 1;
      crop.h = 1;
    }
  } else {
    // Klik w istniejącą adnotację = zaznaczenie (kolor/rozmiar edytują ją na żywo),
    // a nie rysowanie kolejnej.
    const hit = hitAnnotation(point);
    if (hit) {
      selectedId.value = hit.id;
      renderPreview();
      return;
    }
    if (tool.value === 'text') {
      if (!textValue.value.trim()) return;
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        kind: 'text',
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
        color: color.value,
        width: strokeWidth.value,
        text: textValue.value
      };
      annotations.value.push(annotation);
      selectedId.value = annotation.id;
      renderPreview();
      scheduleEstimate();
      return;
    }
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      kind: tool.value,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      color: color.value,
      width: strokeWidth.value
    };
    annotations.value.push(annotation);
    selectedId.value = annotation.id;
    drag = { mode: 'annotation', startX: point.x, startY: point.y, annotationId: annotation.id };
  }
  canvasRef.value?.setPointerCapture(event.pointerId);
  renderPreview();
}

function onPointerMove(event: PointerEvent): void {
  const current = drag;
  if (!current) {
    updateCursor(event);
    return;
  }
  const point = pointerToImage(event);
  if (current.mode === 'crop') {
    if (current.handle === 'move') {
      crop.x = clampTag(
        current.origin.x + (point.x - current.startX),
        0,
        orientedW.value - current.origin.w
      );
      crop.y = clampTag(
        current.origin.y + (point.y - current.startY),
        0,
        orientedH.value - current.origin.h
      );
      crop.w = current.origin.w;
      crop.h = current.origin.h;
      renderPreview();
    } else if (current.handle === 'draw') {
      updateCropFromDrag(current.startX, current.startY, point.x, point.y);
    } else {
      resizeCrop(
        current.handle,
        current.origin,
        point.x - current.startX,
        point.y - current.startY
      );
    }
    return;
  }
  const annotation = annotations.value.find((item) => item.id === current.annotationId);
  if (annotation) {
    annotation.x2 = point.x;
    annotation.y2 = point.y;
    renderPreview();
  }
}

function onPointerUp(event: PointerEvent): void {
  const current = drag;
  if (!current) return;
  const point = pointerToImage(event);
  if (current.mode === 'crop') {
    if (current.handle === 'draw') {
      updateCropFromDrag(current.startX, current.startY, point.x, point.y);
    }
    if (crop.w < 4 || crop.h < 4) {
      crop.x = current.origin.x;
      crop.y = current.origin.y;
      crop.w = current.origin.w;
      crop.h = current.origin.h;
    }
    outputWidth.value = clampTag(
      Math.round(Math.min(outputWidth.value || crop.w, crop.w)),
      1,
      MAX_OUTPUT_DIMENSION
    );
  } else if (current.annotationId) {
    const annotation = annotations.value.find((item) => item.id === current.annotationId);
    if (
      annotation &&
      annotation.kind !== 'text' &&
      Math.abs(annotation.x2 - annotation.x1) < 4 &&
      Math.abs(annotation.y2 - annotation.y1) < 4
    ) {
      annotations.value = annotations.value.filter((item) => item.id !== annotation.id);
      if (selectedId.value === annotation.id) selectedId.value = null;
    }
  }
  drag = null;
  renderPreview();
  scheduleEstimate();
}

function undoAnnotation(): void {
  const removed = annotations.value[annotations.value.length - 1];
  annotations.value = annotations.value.slice(0, -1);
  if (removed && selectedId.value === removed.id) selectedId.value = null;
  renderPreview();
  scheduleEstimate();
}

function clearAnnotations(): void {
  annotations.value = [];
  selectedId.value = null;
  renderPreview();
  scheduleEstimate();
}

function renderExportCanvas(): HTMLCanvasElement | null {
  if (!image.value || !crop.w || !crop.h || !outputWidth.value) return null;
  const outW = clampTag(Math.round(outputWidth.value), 1, MAX_OUTPUT_DIMENSION);
  const outH = Math.max(1, Math.round((outW * crop.h) / crop.w));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const base = buildBaseCanvas();
  const baseScale = base.width / orientedW.value;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    base,
    crop.x * baseScale,
    crop.y * baseScale,
    crop.w * baseScale,
    crop.h * baseScale,
    0,
    0,
    outW,
    outH
  );
  const exportScale = outW / crop.w;
  drawAnnotations(
    ctx,
    base,
    baseScale,
    (annotation) => ({
      x: (annotation.x1 - crop.x) * exportScale,
      y: (annotation.y1 - crop.y) * exportScale,
      w: (annotation.x2 - annotation.x1) * exportScale,
      h: (annotation.y2 - annotation.y1) * exportScale
    }),
    exportScale
  );
  return canvas;
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
    const path =
      ctx && ctx.params && typeof ctx.params.path === 'string' ? (ctx.params.path as string) : '';
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
        <div v-if="!hasImage" class="flex h-full items-center justify-center p-6">
          <div class="max-w-md text-center">
            <EmptyState
              :title="t('tools.imageStudioEmpty')"
              :description="t('tools.imageStudioDropHint')"
              :icon="ImageIcon"
            />
            <button
              data-testid="image-studio-open"
              class="fx-noise mt-4 rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90"
              :disabled="loading"
              @click="pickImage"
            >
              {{ loading ? t('tools.imageStudioLoading') : t('tools.imageStudioOpen') }}
            </button>
          </div>
        </div>

        <div v-else class="flex h-full min-h-0">
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
              <canvas
                ref="canvasRef"
                data-testid="image-studio-canvas"
                :data-crop="`${Math.round(crop.x)},${Math.round(crop.y)},${Math.round(crop.w)},${Math.round(crop.h)}`"
                :data-image="`${orientedW},${orientedH}`"
                :data-annotation-count="annotations.length"
                :data-selected-width="selectedWidth ?? ''"
                class="max-h-full max-w-full rounded-box border border-base-300 shadow-lg"
                :style="{ cursor: cropCursor }"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
              />
            </div>
            <div
              class="flex items-center gap-3 border-t border-base-300 px-3 py-2 text-[11px] text-base-content/60"
            >
              <span class="truncate" :title="sourcePath">{{ fileName(sourcePath) }}</span>
              <span>{{ sourceWidth }}×{{ sourceHeight }} · {{ sourceFormat }}</span>
              <span>{{ t('tools.imageStudioSourceSize') }}: {{ formatBytes(sourceBytes) }}</span>
              <span class="ml-auto"
                >{{ t('tools.imageStudioCrop') }}: {{ Math.round(crop.w) }}×{{
                  Math.round(crop.h)
                }}</span
              >
            </div>
          </div>

          <aside class="w-80 shrink-0 space-y-3 overflow-y-auto border-l border-base-300 p-3">
            <section class="space-y-2 rounded-box border border-base-300 bg-base-100/70 p-3">
              <div class="text-xs font-semibold">{{ t('tools.imageStudioCrop') }}</div>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="item in ASPECTS"
                  :key="item.id"
                  :data-testid="`image-studio-aspect-${item.id}`"
                  class="rounded-field border px-2 py-1 text-[11px] transition-colors"
                  :class="
                    aspect === item.id
                      ? 'border-primary bg-primary/10 text-primary-text'
                      : 'border-base-300 text-base-content/60 hover:bg-base-content/10'
                  "
                  @click="
                    aspect = item.id;
                    applyAspect();
                  "
                >
                  {{ t(`tools.${item.key}`) }}
                </button>
              </div>
              <p class="text-[10px] text-base-content/50">
                {{ t('tools.imageStudioCropHint') }}
              </p>
              <div class="flex gap-1">
                <button
                  data-testid="image-studio-rotate-left"
                  class="fx-noise flex-1 rounded-field border border-base-300 p-1.5 hover:bg-base-content/10"
                  :title="t('tools.imageStudioRotateLeft')"
                  :aria-label="t('tools.imageStudioRotateLeft')"
                  @click="rotateBy(-1)"
                >
                  <RotateCcw :size="14" class="mx-auto" />
                </button>
                <button
                  data-testid="image-studio-rotate-right"
                  class="fx-noise flex-1 rounded-field border border-base-300 p-1.5 hover:bg-base-content/10"
                  :title="t('tools.imageStudioRotateRight')"
                  :aria-label="t('tools.imageStudioRotateRight')"
                  @click="rotateBy(1)"
                >
                  <RotateCw :size="14" class="mx-auto" />
                </button>
                <button
                  data-testid="image-studio-flip-h"
                  class="fx-noise flex-1 rounded-field border border-base-300 p-1.5 hover:bg-base-content/10"
                  :title="t('tools.imageStudioFlipH')"
                  :aria-label="t('tools.imageStudioFlipH')"
                  @click="toggleFlip('h')"
                >
                  <FlipHorizontal2 :size="14" class="mx-auto" />
                </button>
                <button
                  data-testid="image-studio-flip-v"
                  class="fx-noise flex-1 rounded-field border border-base-300 p-1.5 hover:bg-base-content/10"
                  :title="t('tools.imageStudioFlipV')"
                  :aria-label="t('tools.imageStudioFlipV')"
                  @click="toggleFlip('v')"
                >
                  <FlipVertical2 :size="14" class="mx-auto" />
                </button>
              </div>
            </section>

            <section class="space-y-2 rounded-box border border-base-300 bg-base-100/70 p-3">
              <div class="text-xs font-semibold">{{ t('tools.imageStudioAdjust') }}</div>
              <label v-for="field in ADJUST_FIELDS" :key="field.id" class="block">
                <span class="flex justify-between text-[11px] text-base-content/60">
                  <span>{{ t(`tools.${field.label}`) }}</span>
                  <span>{{ adjust[field.id] }}</span>
                </span>
                <input
                  v-model.number="adjust[field.id]"
                  type="range"
                  :min="field.min"
                  :max="field.max"
                  class="w-full accent-primary"
                />
              </label>
            </section>

            <section class="space-y-2 rounded-box border border-base-300 bg-base-100/70 p-3">
              <div class="text-xs font-semibold">{{ t('tools.imageStudioAnnotations') }}</div>
              <div class="grid grid-cols-3 gap-1">
                <button
                  v-for="item in TOOLS"
                  :key="item.id"
                  :data-testid="`image-studio-tool-${item.id}`"
                  class="flex flex-col items-center gap-1 rounded-field border px-1 py-1.5 text-[10px] transition-colors"
                  :class="
                    tool === item.id
                      ? 'border-primary bg-primary/10 text-primary-text'
                      : 'border-base-300 text-base-content/60 hover:bg-base-content/10'
                  "
                  @click="tool = item.id"
                >
                  <component :is="item.icon" :size="14" />
                  {{ t(`tools.${item.key}`) }}
                </button>
              </div>
              <div v-if="tool === 'text'" class="space-y-1">
                <input
                  v-model="textValue"
                  type="text"
                  :placeholder="t('tools.imageStudioTextPlaceholder')"
                  class="w-full rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs"
                />
                <p class="text-[10px] text-base-content/50">{{ t('tools.imageStudioTextHint') }}</p>
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model="color"
                  type="color"
                  class="h-7 w-9 rounded border border-base-300 bg-base-100"
                />
                <label class="flex flex-1 items-center gap-2 text-[11px] text-base-content/60">
                  <span class="shrink-0"
                    >{{ t('tools.imageStudioStroke') }}: {{ strokeWidth }}</span
                  >
                  <input
                    v-model.number="strokeWidth"
                    data-testid="image-studio-stroke"
                    type="range"
                    min="2"
                    max="40"
                    class="flex-1 accent-primary"
                  />
                </label>
              </div>
              <p class="text-[10px] text-base-content/50">
                {{ t('tools.imageStudioAnnotationHint') }}
              </p>
              <div class="flex gap-1">
                <button
                  class="fx-noise flex-1 rounded-field border border-base-300 px-2 py-1 text-[11px] hover:bg-base-content/10 disabled:opacity-40"
                  :disabled="annotations.length === 0"
                  @click="undoAnnotation"
                >
                  <Undo2 :size="12" class="mr-1 inline" />{{ t('tools.imageStudioUndo') }}
                </button>
                <button
                  data-testid="image-studio-delete"
                  class="fx-noise flex-1 rounded-field border border-base-300 px-2 py-1 text-[11px] hover:bg-base-content/10 disabled:opacity-40"
                  :disabled="!selectedId"
                  @click="deleteSelected"
                >
                  <Trash2 :size="12" class="mr-1 inline" />{{ t('tools.imageStudioDelete') }}
                </button>
                <button
                  class="fx-noise flex-1 rounded-field border border-base-300 px-2 py-1 text-[11px] hover:bg-base-content/10 disabled:opacity-40"
                  :disabled="annotations.length === 0"
                  @click="clearAnnotations"
                >
                  {{ t('tools.imageStudioClear') }}
                </button>
              </div>
            </section>

            <section class="space-y-2 rounded-box border border-base-300 bg-base-100/70 p-3">
              <div class="text-xs font-semibold">{{ t('tools.imageStudioOutput') }}</div>
              <label class="block">
                <span class="text-[11px] text-base-content/60">{{
                  t('tools.imageStudioFormat')
                }}</span>
                <select
                  v-model="outputFormat"
                  data-testid="image-studio-format"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs"
                >
                  <option v-for="format in IMAGE_OUTPUT_FORMATS" :key="format" :value="format">
                    {{ format.toUpperCase() }}
                  </option>
                </select>
              </label>
              <label v-if="outputFormat !== 'png'" class="block">
                <span class="flex justify-between text-[11px] text-base-content/60">
                  <span>{{ t('tools.imageStudioQuality') }}</span>
                  <span>{{ quality }}</span>
                </span>
                <input
                  v-model.number="quality"
                  type="range"
                  min="1"
                  max="100"
                  class="w-full accent-primary"
                />
              </label>
              <label class="block">
                <span class="text-[11px] text-base-content/60">{{
                  t('tools.imageStudioWidth')
                }}</span>
                <div class="mt-1 flex items-center gap-2">
                  <input
                    v-model.number="outputWidth"
                    data-testid="image-studio-width"
                    type="number"
                    min="1"
                    :max="MAX_OUTPUT_DIMENSION"
                    class="w-24 rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs"
                  />
                  <span class="text-[11px] text-base-content/50">→ {{ outputHeight }} px</span>
                </div>
              </label>
              <div class="flex items-center justify-between text-[11px] text-base-content/60">
                <span
                  >{{ t('tools.imageStudioEstimated') }}:
                  {{ estimating ? '…' : formatBytes(estimatedBytes) }}</span
                >
                <button
                  data-testid="image-studio-estimate"
                  class="rounded-field border border-base-300 px-2 py-0.5 hover:bg-base-content/10"
                  :disabled="estimating"
                  @click="estimateSize"
                >
                  {{ t('tools.imageStudioCheckSize') }}
                </button>
              </div>
              <label class="block">
                <span class="text-[11px] text-base-content/60">{{
                  t('tools.imageStudioPath')
                }}</span>
                <div class="mt-1 flex items-center gap-1.5">
                  <input
                    v-model="outputPath"
                    data-testid="image-studio-output-path"
                    type="text"
                    class="min-w-0 flex-1 rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs"
                  />
                  <button
                    class="fx-noise shrink-0 rounded-field border border-base-300 p-2 hover:bg-base-content/10"
                    :title="t('tools.chooseFolder')"
                    :aria-label="t('tools.chooseFolder')"
                    @click="pickOutputDir"
                  >
                    <FolderOpen :size="13" />
                  </button>
                </div>
              </label>
              <button
                data-testid="image-studio-save"
                class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field bg-primary px-3 py-2 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
                :disabled="saving || !outputPath.trim()"
                @click="save"
              >
                <Save :size="14" />
                {{ saving ? t('tools.imageStudioSaving') : t('tools.imageStudioSave') }}
              </button>
              <p
                v-if="savedPath"
                data-testid="image-studio-saved"
                class="flex items-center gap-1 text-[11px] text-success"
              >
                <Check :size="12" />
                {{ t('tools.imageStudioSaved', { size: formatBytes(savedBytes) }) }}
              </p>
              <p v-if="errorMsg" class="text-[11px] text-error">{{ errorMsg }}</p>
            </section>

            <section class="space-y-2 rounded-box border border-base-300 bg-base-100/70 p-3">
              <div class="text-xs font-semibold">{{ t('tools.imageStudioCover') }}</div>
              <div class="flex items-center gap-1.5">
                <input
                  v-model="coverAudioPath"
                  type="text"
                  :placeholder="t('tools.imageStudioCoverPick')"
                  class="min-w-0 flex-1 rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs"
                />
                <button
                  class="fx-noise shrink-0 rounded-field border border-base-300 p-2 hover:bg-base-content/10"
                  :title="t('tools.imageStudioCoverPick')"
                  :aria-label="t('tools.imageStudioCoverPick')"
                  @click="pickCoverAudio"
                >
                  <FolderOpen :size="13" />
                </button>
              </div>
              <button
                data-testid="image-studio-cover-set"
                class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field border border-base-300 px-3 py-2 text-xs font-medium hover:bg-base-content/10 disabled:opacity-40"
                :disabled="!savedPath || !coverAudioPath"
                @click="setAsCover"
              >
                {{ t('tools.imageStudioCoverSetButton') }}
              </button>
              <p
                v-if="coverStatus"
                class="text-[11px]"
                :class="coverOk ? 'text-success' : 'text-error'"
              >
                {{ coverStatus }}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  </ToolWindowShell>
</template>
