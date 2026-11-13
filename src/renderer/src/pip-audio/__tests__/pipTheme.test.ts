import { describe, expect, it } from 'vitest';

import {
  EDGE_BORDER,
  ROOT_BG,
  pipPeekAlign,
  pipPeekFillGeom,
  pipPeekFillState,
  pipPeekTrackGeom,
  pipRootClass
} from '../pipTheme';

describe('pipRootClass', () => {
  it('is transparent while peeked at an edge', () => {
    expect(pipRootClass('top', true, 'top')).toBe('border-0 bg-transparent');
  });

  it('uses the edge-specific border sides', () => {
    expect(pipRootClass('top', false, null)).toContain('border-b-[length:var(--border)]');
    expect(pipRootClass('bottom', false, null)).toContain('border-t-[length:var(--border)]');
    expect(pipRootClass('left', false, null)).toContain('border-r-[length:var(--border)]');
    expect(pipRootClass('right', false, null)).toContain('border-l-[length:var(--border)]');
  });

  it('uses the box radius for corner docks', () => {
    const result = pipRootClass('bottom-right', false, null);

    expect(result).toContain(ROOT_BG);
    expect(result).toContain(EDGE_BORDER);
    expect(result).toContain('rounded-[var(--radius-box)]');
  });

  it('ignores peek state without an edge', () => {
    expect(pipRootClass(null, true, null)).toContain('rounded-[var(--radius-box)]');
  });
});

describe('pipPeekAlign', () => {
  it('maps each edge to its alignment', () => {
    expect(pipPeekAlign('top')).toBe('items-end');
    expect(pipPeekAlign('bottom')).toBe('items-start');
    expect(pipPeekAlign('left')).toBe('justify-end');
    expect(pipPeekAlign('right')).toBe('justify-start');
    expect(pipPeekAlign(null)).toBe('');
  });
});

describe('peek geometry', () => {
  it('orients the track and fill for horizontal and vertical edges', () => {
    expect(pipPeekTrackGeom('left')).toBe('h-full w-[5px]');
    expect(pipPeekTrackGeom('right')).toBe('h-full w-[5px]');
    expect(pipPeekTrackGeom('top')).toBe('h-[5px] w-full');
    expect(pipPeekTrackGeom(null)).toBe('h-[5px] w-full');

    expect(pipPeekFillGeom('left')).toBe('absolute bottom-0 left-0 w-full');
    expect(pipPeekFillGeom('right')).toBe('absolute bottom-0 left-0 w-full');
    expect(pipPeekFillGeom('bottom')).toBe('h-full');
  });

  it('glows while playing and dims when paused', () => {
    expect(pipPeekFillState(true)).toContain('shadow-');
    expect(pipPeekFillState(false)).toBe('opacity-45');
  });
});
