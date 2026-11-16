import { describe, expect, it } from 'vitest';
import type { AudioLayoutElement } from '@renderer/types/settings';
import {
  COVER_H_FACTOR,
  clampNum,
  sanitizeElement,
  snapToGrid,
  snapWithGuides
} from '../audioLayout';

function element(overrides: Partial<AudioLayoutElement> = {}): AudioLayoutElement {
  return {
    id: 'cover',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    opacity: 100,
    layer: 1,
    visible: true,
    ...overrides
  } as AudioLayoutElement;
}

describe('clampNum', () => {
  it('clamps to the given range', () => {
    expect(clampNum(5, 0, 10)).toBe(5);
    expect(clampNum(-5, 0, 10)).toBe(0);
    expect(clampNum(15, 0, 10)).toBe(10);
  });
});

describe('sanitizeElement', () => {
  it('clamps position and size to the element constraints', () => {
    const result = sanitizeElement(element({ x: 95, y: 95, width: 2, height: 2 }));
    const height = Math.round(15 * COVER_H_FACTOR * 100) / 100;

    expect(result.width).toBe(15);
    expect(result.height).toBeCloseTo(height, 2);
    expect(result.x).toBe(85);
    expect(result.y).toBeCloseTo(100 - height, 2);
  });

  it('derives the cover height from the 16:9 aspect', () => {
    const result = sanitizeElement(element({ width: 50, height: 90 }));

    expect(result.height).toBeCloseTo(50 * COVER_H_FACTOR, 2);
  });

  it('falls back to defaults for unknown element ids', () => {
    const result = sanitizeElement(element({ id: 'ghost' as never, width: 0, height: 0 }));

    expect(result).toMatchObject({ width: 1, height: 1, x: 0, y: 0 });
  });

  it('clamps heights above the element maximum', () => {
    const result = sanitizeElement(element({ id: 'progress', width: 30, height: 90 }));

    expect(result.height).toBe(20);
  });
});

describe('snapToGrid', () => {
  it('rounds to the 5% grid unless shift is held', () => {
    expect(snapToGrid(12, { shiftKey: false })).toBe(10);
    expect(snapToGrid(13, { shiftKey: false })).toBe(15);
    expect(snapToGrid(13, { shiftKey: true })).toBe(13);
  });
});

describe('snapWithGuides', () => {
  it('returns the raw position while shift is held', () => {
    expect(snapWithGuides(12, 13, element(), { shiftKey: true }, [])).toEqual({ x: 12, y: 13 });
  });

  it('snaps to visible guides and reports them', () => {
    const result = snapWithGuides(49, 51, element(), { shiftKey: false }, [
      element({ id: 'progress', x: 50, y: 50, width: 10, height: 10 })
    ]);

    expect(result).toMatchObject({ x: 50, y: 50, guideX: 50, guideY: 50 });
  });

  it('ignores the dragged element and hidden neighbours', () => {
    const result = snapWithGuides(10, 10, element(), { shiftKey: false }, [
      element({ x: 10, y: 10 }),
      element({ id: 'progress', x: 10, y: 10, visible: false })
    ]);

    expect(result).toMatchObject({ x: 10, y: 10 });
  });

  it('keeps raw coordinates when no guide is close enough', () => {
    const result = snapWithGuides(30, 30, element({ width: 10, height: 10 }), { shiftKey: false }, [
      element({ id: 'progress', x: 80, y: 80, width: 5, height: 5 })
    ]);

    expect(result).toEqual({ x: 30, y: 30, guideX: undefined, guideY: undefined });
  });
});
