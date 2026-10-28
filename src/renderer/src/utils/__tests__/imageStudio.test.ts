import { describe, expect, it } from 'vitest';
import {
  annotationBounds,
  aspectRatioOf,
  computeAspectCrop,
  cropHandleCursor,
  extensionForFormat,
  fileNameOf,
  formatBytes,
  hitAnnotation,
  hitCropHandleAt,
  resizeCropRect,
  suggestOutputPath,
  type Annotation
} from '../imageStudio';

function rect(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'a',
    kind: 'rect',
    x1: 10,
    y1: 10,
    x2: 30,
    y2: 40,
    color: '#fff',
    width: 4,
    ...overrides
  };
}

describe('imageStudio — formatowanie', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(15 * 1024)).toBe('15 KB');
  });

  it('suggests an output path next to the source', () => {
    expect(fileNameOf('C:\\pics\\a.png')).toBe('a.png');
    expect(extensionForFormat('jpeg')).toBe('jpg');
    expect(extensionForFormat('webp')).toBe('webp');
    expect(suggestOutputPath('C:\\pics\\a.png', 'jpeg')).toBe('C:/pics/a-edited.jpg');
    expect(suggestOutputPath('/pics/a.png', 'avif')).toBe('/pics/a-edited.avif');
  });

  it('maps aspect presets to ratios and centered crops', () => {
    expect(aspectRatioOf('free')).toBe(0);
    expect(aspectRatioOf('1:1')).toBe(1);
    expect(aspectRatioOf('16:9')).toBeCloseTo(16 / 9);
    expect(computeAspectCrop('1:1', 200, 100)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
    expect(computeAspectCrop('16:9', 200, 200)).toEqual({
      x: 0,
      y: 43.75,
      w: 200,
      h: 112.5
    });
    expect(computeAspectCrop('free', 200, 100)).toBeNull();
    expect(computeAspectCrop('1:1', 0, 0)).toBeNull();
  });
});

describe('imageStudio — adnotacje', () => {
  it('computes rect and text bounds', () => {
    expect(annotationBounds(rect())).toEqual({ x: 10, y: 10, w: 20, h: 30 });
    const text = annotationBounds(rect({ kind: 'text', text: 'abc', width: 8 }));
    expect(text.x).toBe(10);
    expect(text.w).toBeCloseTo(3 * 16 * 0.6);
    expect(text.h).toBeCloseTo(16 * 1.2);
  });

  it('hits the top-most annotation and ignores empty space', () => {
    const first = rect({ id: 'first' });
    const second = rect({ id: 'second', x1: 12, y1: 12, x2: 20, y2: 20 });
    expect(hitAnnotation([first, second], { x: 15, y: 15 })?.id).toBe('second');
    expect(hitAnnotation([first], { x: 100, y: 100 })).toBeNull();
  });
});

describe('imageStudio — kadr', () => {
  const crop = { x: 10, y: 10, w: 100, h: 50 };

  it('detects handles and the move area', () => {
    expect(hitCropHandleAt(10, 10, crop, 1)).toBe('nw');
    expect(hitCropHandleAt(110, 10, crop, 1)).toBe('ne');
    expect(hitCropHandleAt(10, 60, crop, 1)).toBe('sw');
    expect(hitCropHandleAt(110, 60, crop, 1)).toBe('se');
    expect(hitCropHandleAt(50, 30, crop, 1)).toBe('move');
    expect(hitCropHandleAt(200, 200, crop, 1)).toBe('draw');
  });

  it('resizes from a handle and clamps to the image', () => {
    expect(resizeCropRect('se', { x: 0, y: 0, w: 100, h: 100 }, 10, 10, 200, 200, 0)).toEqual({
      x: 0,
      y: 0,
      w: 110,
      h: 110
    });
    expect(resizeCropRect('nw', { x: 0, y: 0, w: 100, h: 100 }, 10, 10, 200, 200, 0)).toEqual({
      x: 10,
      y: 10,
      w: 90,
      h: 90
    });
    expect(resizeCropRect('se', { x: 0, y: 0, w: 100, h: 100 }, 500, 0, 200, 200, 0)).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 100
    });
  });

  it('keeps the aspect ratio while resizing', () => {
    expect(resizeCropRect('se', { x: 0, y: 0, w: 100, h: 100 }, 20, 0, 200, 200, 1)).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 100
    });
  });

  it('maps handles to cursors', () => {
    expect(cropHandleCursor('move')).toBe('move');
    expect(cropHandleCursor('nw')).toBe('nwse-resize');
    expect(cropHandleCursor('ne')).toBe('nesw-resize');
    expect(cropHandleCursor('draw')).toBe('crosshair');
  });
});
