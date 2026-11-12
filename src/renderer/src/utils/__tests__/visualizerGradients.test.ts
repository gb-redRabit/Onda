import { beforeEach, describe, expect, it, vi } from 'vitest';

import { barGradient, resetGradients, spectrumGradient } from '../visualizerGradients';

type Stops = { addColorStop: ReturnType<typeof vi.fn> };

function context() {
  return {
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() }) as unknown as CanvasGradient)
  } as unknown as CanvasRenderingContext2D & {
    createLinearGradient: ReturnType<typeof vi.fn>;
  };
}

function stops(gradient: CanvasGradient): Stops {
  return gradient as unknown as Stops;
}

beforeEach(() => {
  resetGradients();
});

describe('barGradient', () => {
  it('creates a vertical gradient with both colour stops', () => {
    const ctx = context();

    const gradient = barGradient(ctx, 120, '#111', '#222');

    expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, 0, 0, 120);
    expect(stops(gradient).addColorStop).toHaveBeenNthCalledWith(1, 0, '#111');
    expect(stops(gradient).addColorStop).toHaveBeenNthCalledWith(2, 1, '#222');
  });

  it('reuses the cache until height or colours change', () => {
    const ctx = context();

    const first = barGradient(ctx, 100, '#111', '#222');
    expect(barGradient(ctx, 100, '#111', '#222')).toBe(first);
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(1);

    barGradient(ctx, 101, '#111', '#222');
    barGradient(ctx, 101, '#333', '#222');
    barGradient(ctx, 101, '#333', '#444');

    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(4);
  });
});

describe('spectrumGradient', () => {
  it('creates a horizontal three-stop gradient', () => {
    const ctx = context();

    const gradient = spectrumGradient(ctx, 300, '#abc', '#def');

    expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, 0, 300, 0);
    expect(stops(gradient).addColorStop).toHaveBeenNthCalledWith(1, 0, '#def');
    expect(stops(gradient).addColorStop).toHaveBeenNthCalledWith(2, 0.5, '#abc');
    expect(stops(gradient).addColorStop).toHaveBeenNthCalledWith(3, 1, '#def');
  });

  it('keeps an independent cache from the bar gradient', () => {
    const ctx = context();

    const bar = barGradient(ctx, 100, '#111', '#222');
    const spectrum = spectrumGradient(ctx, 300, '#333', '#444');

    expect(spectrum).not.toBe(bar);
    expect(spectrumGradient(ctx, 300, '#333', '#444')).toBe(spectrum);
    expect(barGradient(ctx, 100, '#111', '#222')).toBe(bar);
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(2);
  });

  it('rebuilds after width or colour changes', () => {
    const ctx = context();
    spectrumGradient(ctx, 300, '#a', '#b');

    spectrumGradient(ctx, 301, '#a', '#b');
    spectrumGradient(ctx, 301, '#c', '#b');
    spectrumGradient(ctx, 301, '#c', '#d');

    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(4);
  });
});

describe('resetGradients', () => {
  it('forgets both cached gradients', () => {
    const ctx = context();
    barGradient(ctx, 100, '#111', '#222');
    spectrumGradient(ctx, 300, '#333', '#444');

    resetGradients();

    barGradient(ctx, 100, '#111', '#222');
    spectrumGradient(ctx, 300, '#333', '#444');
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(4);
  });
});
