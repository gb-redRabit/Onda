import { ref, type ComputedRef, type Ref } from 'vue';
import {
  MAX_OUTPUT_DIMENSION,
  aspectRatioOf,
  clamp,
  cropHandleCursor,
  hitAnnotation as hitAnnotationIn,
  hitCropHandleAt,
  resizeCropRect,
  type Annotation,
  type AnnotationKind,
  type Aspect,
  type CropHandle,
  type CropRect
} from '@renderer/utils/imageStudio';

export type StudioTool = 'crop' | AnnotationKind;

type DragState =
  | { mode: 'crop'; handle: CropHandle; startX: number; startY: number; origin: CropRect }
  | { mode: 'annotation'; startX: number; startY: number; annotationId: string };

export interface ImageStudioInteractionState {
  canvasRef: Ref<HTMLCanvasElement | null>;
  image: Ref<HTMLImageElement | null>;
  crop: CropRect;
  aspect: Ref<Aspect>;
  annotations: Ref<Annotation[]>;
  tool: Ref<StudioTool>;
  color: Ref<string>;
  strokeWidth: Ref<number>;
  textValue: Ref<string>;
  selectedId: Ref<string | null>;
  orientedW: ComputedRef<number>;
  orientedH: ComputedRef<number>;
  previewScale: ComputedRef<number>;
  outputWidth: Ref<number>;
  renderPreview: () => void;
  scheduleEstimate: () => void;
}

/**
 * Interakcje wskaźnika w Image Studio: rysowanie/przesuwanie kadru, uchwyty,
 * zaznaczanie i rysowanie adnotacji. Wydzielone z widoku, ale nadal operują na
 * jego stanie przekazanym przez `state`.
 */
export function useImageStudioInteraction(state: ImageStudioInteractionState): {
  cropCursor: Ref<string>;
  pointerToImage: (event: PointerEvent) => { x: number; y: number };
  updateCropFromDrag: (sx: number, sy: number, ex: number, ey: number) => void;
  hitCropHandle: (event: PointerEvent) => CropHandle;
  resizeCrop: (handle: CropHandle, origin: CropRect, dx: number, dy: number) => void;
  updateCursor: (event: PointerEvent) => void;
  deleteSelected: () => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  undoAnnotation: () => void;
  clearAnnotations: () => void;
} {
  const { canvasRef, image, crop, aspect, annotations, tool, color, strokeWidth, textValue } =
    state;
  const { selectedId, orientedW, orientedH, previewScale, outputWidth } = state;
  const { renderPreview, scheduleEstimate } = state;

  const cropCursor = ref('crosshair');
  let drag: DragState | null = null;

  function pointerToImage(event: PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.value as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = ((event.clientX - rect.left) * scaleX) / previewScale.value;
    const y = ((event.clientY - rect.top) * scaleY) / previewScale.value;
    return {
      x: clamp(x, 0, orientedW.value),
      y: clamp(y, 0, orientedH.value)
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
    const ratio = aspectRatioOf(aspect.value);
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
    crop.x = clamp(x1, 0, width - 1);
    crop.y = clamp(y1, 0, height - 1);
    crop.w = Math.max(1, Math.min(width - crop.x, x2 - crop.x));
    crop.h = Math.max(1, Math.min(height - crop.y, y2 - crop.y));
    renderPreview();
  }

  function hitCropHandle(event: PointerEvent): CropHandle {
    const canvas = canvasRef.value;
    if (!canvas) return 'draw';
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return hitCropHandleAt(px, py, crop, previewScale.value);
  }

  function resizeCrop(handle: CropHandle, origin: CropRect, dx: number, dy: number): void {
    const next = resizeCropRect(
      handle,
      origin,
      dx,
      dy,
      orientedW.value,
      orientedH.value,
      aspectRatioOf(aspect.value)
    );
    crop.x = next.x;
    crop.y = next.y;
    crop.w = next.w;
    crop.h = next.h;
    renderPreview();
  }

  function updateCursor(event: PointerEvent): void {
    if (drag) return;
    if (tool.value !== 'crop') {
      cropCursor.value = 'crosshair';
      return;
    }
    cropCursor.value = cropHandleCursor(hitCropHandle(event));
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
      const hit = hitAnnotationIn(annotations.value, point);
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
        crop.x = clamp(
          current.origin.x + (point.x - current.startX),
          0,
          orientedW.value - current.origin.w
        );
        crop.y = clamp(
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
      outputWidth.value = clamp(
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

  return {
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
  };
}
