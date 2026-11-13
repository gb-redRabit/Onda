import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFreqData, getWaveData, smoothData } from '../visualizerBuffers';

function analyser(freq: number[], wave: number[] = []) {
  return {
    getByteFrequencyData: vi.fn((target: Uint8Array) => target.set(freq)),
    getByteTimeDomainData: vi.fn((target: Uint8Array) => target.set(wave))
  } as unknown as AnalyserNode;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getFreqData', () => {
  it('fills and reuses the buffer for the same length', () => {
    const node = analyser([1, 2, 3, 4]);

    const first = getFreqData(node, 4);
    const second = getFreqData(node, 4);

    expect(first).toBe(second);
    expect([...first]).toEqual([1, 2, 3, 4]);
    expect(node.getByteFrequencyData).toHaveBeenCalledTimes(2);
  });

  it('allocates a new buffer when the length changes', () => {
    const node = analyser([1, 2]);

    const first = getFreqData(node, 4);
    const second = getFreqData(node, 2);

    expect(second).not.toBe(first);
    expect(second).toHaveLength(2);
  });
});

describe('getWaveData', () => {
  it('fills and reuses the waveform buffer', () => {
    const node = analyser([], [128, 130, 120]);

    const first = getWaveData(node, 3);
    const second = getWaveData(node, 3);

    expect(first).toBe(second);
    expect([...first]).toEqual([128, 130, 120]);
  });

  it('allocates a new waveform buffer for a new length', () => {
    const node = analyser([], [1, 2]);
    const first = getWaveData(node, 2);
    const second = getWaveData(node, 3);

    expect(second).not.toBe(first);
    expect(second).toHaveLength(3);
  });
});

describe('smoothData', () => {
  it('returns the raw data without smoothing', () => {
    const data = new Uint8Array([1, 2, 3]);

    expect(smoothData(data, 0, 3)).toBe(data);
  });

  it('applies exponential smoothing across frames', () => {
    const first = smoothData(new Uint8Array([100, 50, 0]), 0.5, 3);
    expect([...first]).toEqual([100, 50, 0]);

    const second = smoothData(new Uint8Array([0, 0, 0]), 0.5, 3);
    expect([...second]).toEqual([50, 25, 0]);

    const third = smoothData(new Uint8Array([0, 0, 0]), 0.5, 3);
    expect([...third]).toEqual([25, 13, 0]);
  });

  it('keeps peaks above the smoothed envelope', () => {
    smoothData(new Uint8Array([10, 10, 10, 10]), 0.9, 4);

    const peaked = smoothData(new Uint8Array([200, 0, 0, 0]), 0.9, 4);

    expect([...peaked]).toEqual([200, 9, 9, 9]);
  });

  it('reuses buffers after a length change', () => {
    smoothData(new Uint8Array([10, 10]), 0.5, 2);
    const resized = smoothData(new Uint8Array([1, 1, 1]), 0.5, 3);

    expect(resized).toHaveLength(3);
    expect([...resized]).toEqual([1, 1, 1]);
  });
});
