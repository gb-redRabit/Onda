import type { ImageOutputFormat } from '@shared/types/tools';

// Czysta geometria i formatowanie Image Studio. Wydzielone z widoku, żeby
// obrysy adnotacji, uchwyty kadru i ścieżki wyjściowe dały się testować bez DOM.

export const MAX_OUTPUT_DIMENSION = 4096;

export type Aspect = 'free' | '1:1' | '16:9' | '4:3';
export type AnnotationKind = 'rect' | 'arrow' | 'text' | 'blur' | 'pixelate';
export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'draw';

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  text?: string;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TargetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatBytes(bytes: number | null | undefined): string {
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

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function extensionForFormat(format: ImageOutputFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function suggestOutputPath(path: string, format: ImageOutputFormat): string {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  const dir = slash >= 0 ? normalized.slice(0, slash) : '.';
  const name = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  return `${dir}/${base}-edited.${extensionForFormat(format)}`;
}

export function aspectRatioOf(aspect: Aspect): number {
  if (aspect === '1:1') return 1;
  if (aspect === '16:9') return 16 / 9;
  if (aspect === '4:3') return 4 / 3;
  return 0;
}

/** Kadr wyśrodkowany dla wybranych proporcji; `null` dla trybu swobodnego. */
export function computeAspectCrop(aspect: Aspect, width: number, height: number): CropRect | null {
  if (!width || !height || aspect === 'free') return null;
  const ratio = aspectRatioOf(aspect);
  let w = width;
  let h = w / ratio;
  if (h > height) {
    h = height;
    w = h * ratio;
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** Obrys adnotacji w układzie obrazu (tekst ma rozmiar oszacowany z fontu). */
export function annotationBounds(annotation: Annotation): TargetRect {
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

export function hitAnnotation(
  annotations: Annotation[],
  point: { x: number; y: number }
): Annotation | null {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index];
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

/** Który uchwyt kadru jest pod punktem (w pikselach podglądu). */
export function hitCropHandleAt(
  px: number,
  py: number,
  crop: CropRect,
  scale: number,
  radius = 14
): CropHandle {
  const x = crop.x * scale;
  const y = crop.y * scale;
  const w = crop.w * scale;
  const h = crop.h * scale;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= radius;
  if (near(px, x) && near(py, y)) return 'nw';
  if (near(px, x + w) && near(py, y)) return 'ne';
  if (near(px, x) && near(py, y + h)) return 'sw';
  if (near(px, x + w) && near(py, y + h)) return 'se';
  if (px >= x && px <= x + w && py >= y && py <= y + h) return 'move';
  return 'draw';
}

/** Nowy kadr po przeciągnięciu uchwytu; `ratio > 0` wymusza proporcje. */
export function resizeCropRect(
  handle: CropHandle,
  origin: CropRect,
  dx: number,
  dy: number,
  width: number,
  height: number,
  ratio: number
): CropRect {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.w;
  let bottom = origin.y + origin.h;
  if (handle === 'nw') {
    left = clamp(left + dx, 0, right - 4);
    top = clamp(top + dy, 0, bottom - 4);
  } else if (handle === 'ne') {
    right = clamp(right + dx, left + 4, width);
    top = clamp(top + dy, 0, bottom - 4);
  } else if (handle === 'sw') {
    left = clamp(left + dx, 0, right - 4);
    bottom = clamp(bottom + dy, top + 4, height);
  } else if (handle === 'se') {
    right = clamp(right + dx, left + 4, width);
    bottom = clamp(bottom + dy, top + 4, height);
  }
  let w = right - left;
  let h = bottom - top;
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
  const x = clamp(left, 0, width - 4);
  const y = clamp(top, 0, height - 4);
  return {
    x,
    y,
    w: Math.max(4, Math.min(width - x, right - x)),
    h: Math.max(4, Math.min(height - y, bottom - y))
  };
}

export function cropHandleCursor(handle: CropHandle): string {
  if (handle === 'move') return 'move';
  if (handle === 'nw' || handle === 'se') return 'nwse-resize';
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  return 'crosshair';
}
