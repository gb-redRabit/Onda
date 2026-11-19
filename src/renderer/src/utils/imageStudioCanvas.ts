import {
  annotationBounds,
  clamp,
  type Annotation,
  type CropRect,
  type TargetRect
} from '@renderer/utils/imageStudio';

/**
 * Czyste operacje na canvasie dla Image Studio. Trzymają się z dala od stanu
 * komponentu, więc można je testować bez montowania widoku.
 */
export function sharpenCanvas(canvas: HTMLCanvasElement, amount: number): void {
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

/**
 * Rysuje bazowy obraz (obrót, odbicie, korekty) na nowy canvas. Opcjonalny
 * `maxDimension` skaluje wynik w dół — podgląd nie potrzebuje pełnej rozdzielczości.
 */
export function renderBaseCanvas(input: {
  image: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  orientedWidth: number;
  orientedHeight: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  adjust: {
    brightness: number;
    contrast: number;
    saturation: number;
    temperature: number;
    sharpen: number;
  };
  maxDimension?: number;
}): HTMLCanvasElement {
  const {
    image,
    sourceWidth,
    sourceHeight,
    orientedWidth,
    orientedHeight,
    rotation,
    flipH,
    flipV,
    adjust,
    maxDimension
  } = input;
  const scale = maxDimension
    ? Math.min(1, maxDimension / Math.max(orientedWidth, orientedHeight))
    : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(orientedWidth * scale));
  canvas.height = Math.max(1, Math.round(orientedHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.filter = `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%)`;
  ctx.translate(orientedWidth / 2, orientedHeight / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.translate(-sourceWidth / 2, -sourceHeight / 2);
  ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  ctx.restore();

  if (adjust.temperature !== 0) {
    const strength = clamp(Math.abs(adjust.temperature) / 100, 0, 1) * 0.6;
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

/**
 * Rysuje finalny obraz do eksportu: kadr `crop` z bazowego canvasu + adnotacje
 * przeskalowane do rozmiaru wyjścia. `base` jest wołany leniwie, dopiero gdy
 * istnieje kontekst 2D — bez niego nie ma sensu liczyć całego obrazu bazowego.
 * Zwraca `null`, gdy kontekstu brak.
 */
export function renderExportCanvas(input: {
  base: () => HTMLCanvasElement;
  orientedWidth: number;
  crop: CropRect;
  outputWidth: number;
  annotations: Annotation[];
  selectedId: string | null;
  maxDimension: number;
}): HTMLCanvasElement | null {
  const { orientedWidth, crop, outputWidth, annotations, selectedId, maxDimension } = input;
  if (crop.w <= 0 || crop.h <= 0) return null;
  const outW = clamp(Math.round(outputWidth), 1, maxDimension);
  const outH = Math.max(1, Math.round((outW * crop.h) / crop.w));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const base = input.base();
  const baseScale = base.width / orientedWidth;
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
    annotations,
    selectedId,
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

export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  selectedId: string | null,
  base: HTMLCanvasElement,
  baseScale: number,
  toTarget: (annotation: Annotation) => TargetRect,
  scale: number
): void {
  for (const annotation of annotations) {
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
    if (annotation.id === selectedId) {
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

export function drawCropOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  crop: CropRect,
  scale: number
): void {
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
