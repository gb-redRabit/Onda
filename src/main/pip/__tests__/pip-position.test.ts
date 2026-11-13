import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  workArea: { x: 0, y: 0, width: 1000, height: 800 }
}));

vi.mock('electron', () => ({
  screen: {
    getPrimaryDisplay: () => ({ workArea: h.workArea })
  }
}));

import { computePipPosition } from '../pip-position';

beforeEach(() => {
  h.workArea = { x: 0, y: 0, width: 1000, height: 800 };
});

describe('computePipPosition', () => {
  it('defaults to the bottom-right corner', () => {
    expect(computePipPosition({ width: 300, height: 80 })).toEqual({
      x: 680,
      y: 700,
      width: 300,
      height: 80
    });
  });

  it('computes every corner and edge', () => {
    const size = { width: 300, height: 80 };

    expect(computePipPosition({ ...size, position: 'bottom-left' })).toMatchObject({
      x: 20,
      y: 700
    });
    expect(computePipPosition({ ...size, position: 'top-right' })).toMatchObject({ x: 680, y: 20 });
    expect(computePipPosition({ ...size, position: 'top-left' })).toMatchObject({ x: 20, y: 20 });
    expect(computePipPosition({ ...size, position: 'right' })).toMatchObject({ x: 700, y: 360 });
    expect(computePipPosition({ ...size, position: 'left' })).toMatchObject({ x: 0, y: 360 });
    expect(computePipPosition({ ...size, position: 'top' })).toMatchObject({ x: 350, y: 20 });
    expect(computePipPosition({ ...size, position: 'bottom' })).toMatchObject({ x: 350, y: 700 });
  });

  it('snaps full-width bottom and top docks to the edges', () => {
    expect(computePipPosition({ width: 1000, height: 80, position: 'bottom' })).toMatchObject({
      x: 0,
      y: 720
    });
    expect(computePipPosition({ width: 1000, height: 80, position: 'top' })).toMatchObject({
      x: 0,
      y: 0
    });
  });

  it('centers side docks vertically unless they are full height', () => {
    expect(computePipPosition({ width: 300, height: 800, position: 'left' })).toMatchObject({
      x: 0,
      y: 0
    });
    expect(computePipPosition({ width: 300, height: 800, position: 'right' })).toMatchObject({
      x: 700,
      y: 0
    });
  });

  it('uses a supplied work area and rounds fractional values', () => {
    expect(
      computePipPosition({
        width: 300.4,
        height: 80.6,
        workArea: { x: 100, y: 50, width: 500, height: 400 }
      })
    ).toEqual({ x: 280, y: 349, width: 300, height: 81 });
  });

  it('treats unknown positions as bottom-right', () => {
    expect(computePipPosition({ width: 300, height: 80, position: 'mystery' })).toMatchObject({
      x: 680,
      y: 700
    });
  });
});
