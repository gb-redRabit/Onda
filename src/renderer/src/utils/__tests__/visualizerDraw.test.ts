import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  drawBars,
  drawCircle,
  drawRadial,
  drawRings,
  drawSplash,
  drawSpectrum,
  drawWave
} from '../visualizerDraw';

const state = vi.hoisted(() => ({
  bins: [0, 255] as number[],
  wave: [0, 128, 64, 255] as number[]
}));

vi.mock('@renderer/utils/visualizerBins', () => ({ binFreq: () => state.bins }));
vi.mock('@renderer/utils/visualizerGradients', () => ({
  barGradient: () => 'bar-gradient',
  spectrumGradient: () => 'spectrum-gradient'
}));
vi.mock('@renderer/utils/visualizerBuffers', () => ({ getWaveData: () => state.wave }));

function context() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn()
  };
}

function analyser(frequencyBinCount = 128) {
  return { frequencyBinCount } as AnalyserNode;
}

beforeEach(() => {
  state.bins = [0, 255];
  state.wave = [0, 128, 64, 255];
  vi.stubGlobal('performance', { now: () => 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('drawBars', () => {
  it('draws one bar per bin scaled by sensitivity', () => {
    const ctx = context();
    drawBars(
      analyser(),
      ctx as unknown as CanvasRenderingContext2D,
      100,
      50,
      '#a',
      '#b',
      1,
      new Uint8Array(),
      {
        barCount: 2
      }
    );

    expect(ctx.fillStyle).toBe('bar-gradient');
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 50, 48, 0);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 50, 0, 48, 50);
  });
});

describe('drawSpectrum', () => {
  it('mirrors bars around the vertical center', () => {
    const ctx = context();
    drawSpectrum(
      analyser(),
      ctx as unknown as CanvasRenderingContext2D,
      100,
      50,
      '#a',
      '#b',
      1,
      new Uint8Array(),
      { barCount: 2 }
    );

    expect(ctx.fillStyle).toBe('spectrum-gradient');
    expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 25, 48, 0);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 0, 25, 48, 0);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(3, 50, 0, 48, 25);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(4, 50, 25, 48, 25);
  });
});

describe('drawWave', () => {
  it('plots the waveform across the canvas', () => {
    const ctx = context();
    drawWave(analyser(), ctx as unknown as CanvasRenderingContext2D, 100, 50, '#wave', 4);

    expect(ctx.lineWidth).toBe(2);
    expect(ctx.strokeStyle).toBe('#wave');
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 25, 25);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 50, 12.5);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 75, (255 / 128) * 25);
    expect(ctx.stroke).toHaveBeenCalled();
  });
});

describe('drawRadial', () => {
  it('draws radial spokes around the center and restores alpha', () => {
    const ctx = context();
    drawRadial(
      ctx as unknown as CanvasRenderingContext2D,
      100,
      100,
      '#radial',
      2,
      new Uint8Array([255, 128, 64, 0]),
      4,
      { radialCount: 4 }
    );

    expect(ctx.lineWidth).toBe(2);
    expect(ctx.strokeStyle).toBe('#radial');
    expect(ctx.moveTo).toHaveBeenCalledTimes(4);
    expect(ctx.lineTo).toHaveBeenCalledTimes(4);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('drawSplash', () => {
  it('draws the pulsing ring with rounded bars', () => {
    const ctx = context();
    const data = new Uint8Array(64).fill(128);
    drawSplash(ctx as unknown as CanvasRenderingContext2D, 100, 100, '#splash', 1, data, 64, {
      radialCount: 64
    });

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineWidth).toBe(0.75);
    expect(ctx.strokeStyle).toBe('#splash');
    expect(ctx.moveTo).toHaveBeenCalledTimes(64);
    expect(ctx.lineTo).toHaveBeenCalledTimes(64);
    expect(ctx.arc).toHaveBeenCalledTimes(2);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fillStyle).toBe('#splash');
  });

  it('clamps the data index for short buffers', () => {
    const ctx = context();
    drawSplash(
      ctx as unknown as CanvasRenderingContext2D,
      50,
      50,
      '#s',
      0,
      new Uint8Array([255]),
      1,
      { radialCount: 64 }
    );
    expect(ctx.moveTo).toHaveBeenCalledTimes(64);
  });
});

describe('drawCircle', () => {
  it('draws circles scaled by the average level', () => {
    const ctx = context();
    drawCircle(
      ctx as unknown as CanvasRenderingContext2D,
      100,
      100,
      '#circle',
      1,
      new Uint8Array([255, 255, 255, 255]),
      4,
      { circleCount: 4 }
    );

    expect(ctx.fillStyle).toBe('#circle');
    expect(ctx.arc).toHaveBeenCalledTimes(4);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('drawRings', () => {
  it('draws alternating rings with level-dependent alpha', () => {
    const ctx = context();
    drawRings(
      ctx as unknown as CanvasRenderingContext2D,
      100,
      100,
      '#prim',
      '#sec',
      1,
      new Uint8Array([255, 128, 64, 32, 16, 8, 4, 2, 1, 0, 0, 0]),
      12
    );

    expect(ctx.arc).toHaveBeenCalledTimes(6);
    expect(ctx.stroke).toHaveBeenCalledTimes(6);
    expect(ctx.strokeStyle).toBe('#sec');
    expect(ctx.globalAlpha).toBe(1);
  });
});
