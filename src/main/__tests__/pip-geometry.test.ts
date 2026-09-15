import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) }
}));

import { computeEdgePeekBounds } from '../pip-edge-position';
import { computePipPosition } from '../pip-position';
import { getAudioPipSize, isAudioPipEdgeDock, audioPipLayoutKind } from '../../shared/types/pip';

const workArea = { x: 100, y: 50, width: 1000, height: 800 };
const size = { width: 300, height: 68 };

describe('computeEdgePeekBounds', () => {
  it('tucks a top-docked window above the work area when peeked', () => {
    expect(
      computeEdgePeekBounds({ dock: 'top', peeked: false, sliver: 5, workArea, size })
    ).toEqual({ x: 100, y: 50, width: 300, height: 68 });
    expect(computeEdgePeekBounds({ dock: 'top', peeked: true, sliver: 5, workArea, size })).toEqual(
      {
        x: 100,
        y: 50 - (68 - 5),
        width: 300,
        height: 68
      }
    );
  });

  it('leaves only a sliver of a bottom-docked window', () => {
    expect(
      computeEdgePeekBounds({ dock: 'bottom', peeked: false, sliver: 5, workArea, size })
    ).toEqual({ x: 100, y: 50 + 800 - 68, width: 300, height: 68 });
    expect(
      computeEdgePeekBounds({ dock: 'bottom', peeked: true, sliver: 5, workArea, size })
    ).toEqual({ x: 100, y: 50 + 800 - 5, width: 300, height: 68 });
  });

  it('handles the left and right edges symmetrically', () => {
    expect(
      computeEdgePeekBounds({ dock: 'left', peeked: true, sliver: 5, workArea, size })
    ).toEqual({ x: 100 - (300 - 5), y: 50, width: 300, height: 68 });
    expect(
      computeEdgePeekBounds({ dock: 'right', peeked: true, sliver: 5, workArea, size })
    ).toEqual({ x: 100 + 1000 - 5, y: 50, width: 300, height: 68 });
    expect(
      computeEdgePeekBounds({ dock: 'right', peeked: false, sliver: 5, workArea, size })
    ).toEqual({ x: 100 + 1000 - 300, y: 50, width: 300, height: 68 });
  });
});

describe('computePipPosition', () => {
  it('keeps the default margin away from the work-area corner', () => {
    expect(computePipPosition({ position: 'bottom-right', ...size, workArea })).toEqual({
      x: 100 + 1000 - 300 - 20,
      y: 50 + 800 - 68 - 20,
      width: 300,
      height: 68
    });
    expect(computePipPosition({ position: 'top-left', ...size, workArea })).toEqual({
      x: 120,
      y: 70,
      width: 300,
      height: 68
    });
  });

  it('centers full-width bars and pins them to the edge', () => {
    const full = { width: 1000, height: 52 };
    expect(computePipPosition({ position: 'bottom', ...full, workArea })).toEqual({
      x: 100,
      y: 50 + 800 - 52,
      width: 1000,
      height: 52
    });
  });

  it('centers non-full dock bars with the minimum margin', () => {
    expect(computePipPosition({ position: 'top', ...size, workArea })).toEqual({
      x: 100 + Math.max(20, Math.round((1000 - 300) / 2)),
      y: 70,
      width: 300,
      height: 68
    });
  });
});

describe('getAudioPipSize', () => {
  it('classifies docks', () => {
    expect(isAudioPipEdgeDock('top')).toBe(true);
    expect(isAudioPipEdgeDock('bottom-right')).toBe(false);
    expect(audioPipLayoutKind('left')).toBe('bar-v');
    expect(audioPipLayoutKind('top')).toBe('bar-h');
    expect(audioPipLayoutKind('bottom-right')).toBe('card');
  });

  it('grows corner cards with their elements', () => {
    const bare = getAudioPipSize('bottom-right', ['trackInfo'], workArea);
    const rich = getAudioPipSize('bottom-right', ['cover', 'trackInfo', 'volume', 'viz'], workArea);
    expect(rich.width).toBeGreaterThan(bare.width);
    expect(rich.height).toBeGreaterThan(bare.height);
  });

  it('spans the full work area width for horizontal edge docks', () => {
    const bar = getAudioPipSize('top', ['trackInfo'], workArea);
    expect(bar.width).toBe(workArea.width);
    expect(bar.height).toBeLessThanOrEqual(132);
  });

  it('spans the full work area height for vertical edge docks', () => {
    const bar = getAudioPipSize('right', ['trackInfo', 'controls'], workArea);
    expect(bar.height).toBe(workArea.height);
    expect(bar.width).toBeLessThanOrEqual(132);
  });
});
