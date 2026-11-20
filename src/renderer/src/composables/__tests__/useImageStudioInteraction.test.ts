import { describe, expect, it, vi } from 'vitest';
import { computed, reactive, ref } from 'vue';
import type { Annotation, Aspect, CropRect } from '@renderer/utils/imageStudio';
import { useImageStudioInteraction, type StudioTool } from '../useImageStudioInteraction';

// Wartości graniczne kadru są trudne do wywołania przez UI (wskaźnik jest
// przycinany do obrazu), ale funkcja jest publiczna — testujemy ją wprost.
function makeInteraction(options: { aspect?: Aspect; width?: number; height?: number } = {}) {
  const width = options.width ?? 1000;
  const height = options.height ?? 500;
  const crop = reactive<CropRect>({ x: 0, y: 0, w: width, h: height });
  const annotations = ref<Annotation[]>([]);
  const selectedId = ref<string | null>(null);
  const state = {
    canvasRef: ref<HTMLCanvasElement | null>(null),
    image: ref<HTMLImageElement | null>(null),
    crop,
    aspect: ref<Aspect>(options.aspect ?? '1:1'),
    annotations,
    tool: ref<StudioTool>('crop'),
    color: ref('#ff3b30'),
    strokeWidth: ref(8),
    textValue: ref(''),
    selectedId,
    orientedW: computed(() => width),
    orientedH: computed(() => height),
    previewScale: computed(() => 1),
    outputWidth: ref(0),
    renderPreview: vi.fn(),
    scheduleEstimate: vi.fn()
  };
  return {
    state,
    crop,
    annotations,
    selectedId,
    renderPreview: state.renderPreview,
    scheduleEstimate: state.scheduleEstimate,
    ...useImageStudioInteraction(state)
  };
}

describe('useImageStudioInteraction crop guards', () => {
  it('clamps an aspect-locked selection that starts left of the image', () => {
    const { updateCropFromDrag, crop } = makeInteraction();
    updateCropFromDrag(-50, 0, 100, 100);

    expect(crop.x).toBe(0);
    expect(crop.w).toBeGreaterThan(0);
    expect(crop.x + crop.w).toBeLessThanOrEqual(1000);
  });

  it('clamps an aspect-locked selection that starts above the image', () => {
    const { updateCropFromDrag, crop } = makeInteraction();
    updateCropFromDrag(0, -50, 100, 100);

    expect(crop.y).toBe(0);
    expect(crop.h).toBeGreaterThan(0);
    expect(crop.y + crop.h).toBeLessThanOrEqual(500);
  });

  it('pulls an overflowing selection back inside the right edge', () => {
    const { updateCropFromDrag, crop } = makeInteraction();
    updateCropFromDrag(950, 0, 1200, 100);

    expect(crop.x + crop.w).toBeLessThanOrEqual(1000);
    expect(crop.x).toBeGreaterThanOrEqual(0);
  });

  it('pulls an overflowing selection back inside the bottom edge', () => {
    const { updateCropFromDrag, crop } = makeInteraction();
    updateCropFromDrag(0, 450, 100, 600);

    expect(crop.y + crop.h).toBeLessThanOrEqual(500);
    expect(crop.y).toBeGreaterThanOrEqual(0);
  });

  it('keeps the raw rectangle without an aspect ratio', () => {
    const { updateCropFromDrag, crop } = makeInteraction({ aspect: 'free' });
    updateCropFromDrag(10, 20, 200, 120);

    expect(crop).toMatchObject({ x: 10, y: 20, w: 190, h: 100 });
  });
});

describe('useImageStudioInteraction selection', () => {
  it('reports draw when the canvas is not mounted', () => {
    const { hitCropHandle } = makeInteraction();
    expect(hitCropHandle({ clientX: 0, clientY: 0 } as PointerEvent)).toBe('draw');
  });

  it('deletes only the selected annotation and clears the selection', () => {
    const { deleteSelected, annotations, selectedId, scheduleEstimate } = makeInteraction();
    annotations.value = [
      { id: 'a', kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, color: '#000', width: 2 },
      { id: 'b', kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, color: '#000', width: 2 }
    ];
    selectedId.value = 'b';

    deleteSelected();

    expect(annotations.value.map((a) => a.id)).toEqual(['a']);
    expect(selectedId.value).toBeNull();
    expect(scheduleEstimate).toHaveBeenCalled();
  });

  it('does nothing when nothing is selected', () => {
    const { deleteSelected, annotations, renderPreview } = makeInteraction();
    const before = annotations.value;

    deleteSelected();

    expect(annotations.value).toBe(before);
    expect(renderPreview).not.toHaveBeenCalled();
  });

  it('undoes the last annotation and clears a matching selection', () => {
    const { undoAnnotation, annotations, selectedId, scheduleEstimate } = makeInteraction();
    annotations.value = [
      { id: 'a', kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, color: '#000', width: 2 }
    ];
    selectedId.value = 'a';

    undoAnnotation();

    expect(annotations.value).toEqual([]);
    expect(selectedId.value).toBeNull();
    expect(scheduleEstimate).toHaveBeenCalled();
  });
});
