import { describe, expect, it } from 'vitest';
import { createVizShim } from '../vizShim';

describe('createVizShim', () => {
  it('exposes frequencyBinCount and copies the latest bins', () => {
    const shim = createVizShim(4);
    expect(shim.node.frequencyBinCount).toBe(4);

    shim.setBins([10, 20, 300, -5]);
    const out = new Uint8Array(4);
    shim.node.getByteFrequencyData(out);

    expect(Array.from(out)).toEqual([10, 20, 255, 0]);
  });

  it('zero-fills a target larger than the buffer', () => {
    const shim = createVizShim(2);
    shim.setBins([7, 8]);
    const out = new Uint8Array(4).fill(99);
    shim.node.getByteFrequencyData(out);
    expect(Array.from(out)).toEqual([7, 8, 0, 0]);
  });
});
