import type { AudioLayoutElement, AudioLayoutElementId } from '@renderer/types/settings';

// Pure audio-layout geometry extracted from
// `components/audio/AudioLayoutEditor.vue` (plan 2.8): per-element constraints,
// grid/snap math and element sanitising.

export const PREVIEW_W = 480;
export const PREVIEW_H = 320;

// ─── Ograniczenia per typ (sensowne rozmiary) ───
export const CONSTRAINTS: Record<
  AudioLayoutElementId,
  { minW?: number; minH?: number; maxH?: number; aspect?: number }
> = {
  visualization: { minW: 10, minH: 10 },
  cover: { minW: 15, aspect: 16 / 9 },
  progress: { minW: 20, minH: 2, maxH: 20 },
  controls: { minW: 30, minH: 6, maxH: 25 },
  trackInfo: { minW: 25, minH: 6 }
};

// height% -> width% tak, aby na kontenerze PREVIEW_W×PREVIEW_H krawędzie były w proporcji 16:9.
// h = w * (PREVIEW_W/PREVIEW_H) * (9/16)
export const COVER_H_FACTOR = (PREVIEW_W / PREVIEW_H) * (9 / 16);

export function clampNum(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function sanitizeElement(el: AudioLayoutElement): AudioLayoutElement {
  const c = CONSTRAINTS[el.id] ?? {};
  const minW = c.minW ?? 1;
  const minH = c.minH ?? 1;
  const width = clampNum(el.width, minW, 100);
  let height = clampNum(el.height, minH, c.maxH ?? 100);
  if (typeof c.aspect === 'number') {
    height = clampNum(Math.round(width * COVER_H_FACTOR * 100) / 100, minH, 100);
  }
  const x = clampNum(el.x, 0, 100 - width);
  const y = clampNum(el.y, 0, 100 - height);
  return { ...el, x, y, width, height };
}

// Zaokrąglanie do siatki 5% (Shift = precyzyjnie)
export function snapToGrid(v: number, e: { shiftKey: boolean }) {
  return e.shiftKey ? v : Math.round(v / 5) * 5;
}

// Snap do krawędzi/ośrodków innych elementów i kontenera + linie prowadzące.
export const SNAP_THRESHOLD = 2; // %

export function snapWithGuides(
  candX: number,
  candY: number,
  el: AudioLayoutElement,
  e: { shiftKey: boolean },
  others: AudioLayoutElement[]
): { x: number; y: number; guideX?: number; guideY?: number } {
  if (e.shiftKey) return { x: candX, y: candY };
  const w = el.width;
  const h = el.height;
  const refsX: number[] = [0, 50, 100];
  const refsY: number[] = [0, 50, 100];
  for (const o of others) {
    if (o.id === el.id || !o.visible) continue;
    refsX.push(o.x, o.x + o.width / 2, o.x + o.width);
    refsY.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  let snappedX: number | undefined;
  let snappedY: number | undefined;
  let guideX: number | undefined;
  let guideY: number | undefined;
  let bestX = Infinity;
  let bestY = Infinity;
  for (const ref of refsX) {
    for (const off of [0, -w / 2, -w]) {
      const candidate = ref + off;
      const d = Math.abs(candidate - candX);
      if (d <= SNAP_THRESHOLD && d < bestX && candidate >= 0 && candidate <= 100 - w) {
        bestX = d;
        snappedX = candidate;
        guideX = ref;
      }
    }
  }
  for (const ref of refsY) {
    for (const off of [0, -h / 2, -h]) {
      const candidate = ref + off;
      const d = Math.abs(candidate - candY);
      if (d <= SNAP_THRESHOLD && d < bestY && candidate >= 0 && candidate <= 100 - h) {
        bestY = d;
        snappedY = candidate;
        guideY = ref;
      }
    }
  }
  return { x: snappedX ?? candX, y: snappedY ?? candY, guideX, guideY };
}
