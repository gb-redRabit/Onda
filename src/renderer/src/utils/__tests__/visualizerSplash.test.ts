import { describe, expect, it } from 'vitest';
import { nextVizMode, VIZ_CYCLES } from '../audioVisualizer';
import { drawSplash } from '../visualizerDraw';

function fakeCtx() {
  const calls = { stroke: 0, fill: 0, arc: 0 };
  const ctx = {
    globalAlpha: 1,
    lineCap: 'butt',
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      calls.stroke += 1;
    },
    arc() {
      calls.arc += 1;
    },
    fill() {
      calls.fill += 1;
    }
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('splash visualization', () => {
  it('is the first mode in the cycle (default)', () => {
    expect(VIZ_CYCLES[0]).toBe('splash');
    expect(nextVizMode('splash')).toBe('bars');
  });

  it('draws one bar per radial bucket plus the pulsing disc', () => {
    const { ctx, calls } = fakeCtx();
    drawSplash(ctx, 800, 600, '#8b7cf0', 0.5, new Uint8Array(128).fill(128), 128, {
      radialCount: 64
    });

    expect(calls.stroke).toBe(65);
    expect(calls.arc).toBe(2);
    expect(calls.fill).toBe(1);
  });
});
