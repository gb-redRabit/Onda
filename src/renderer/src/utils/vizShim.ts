/**
 * Namiastka AnalyserNode dla shellu. Shell nie ma lokalnego grafu audio, więc
 * `getByteFrequencyData` czyta bufor uzupełniany przez `core:viz` z Core.
 * Dzięki temu komponenty wizualizatora działają bez zmian.
 */
export interface VizShim {
  node: AnalyserNode;
  setBins(bins: ArrayLike<number>): void;
}

export function createVizShim(binCount = 256): VizShim {
  const data = new Uint8Array(binCount);
  const node = {
    frequencyBinCount: binCount,
    getByteFrequencyData(target: Uint8Array) {
      const length = Math.min(target.length, binCount);
      target.set(data.subarray(0, length));
      if (target.length > length) target.fill(0, length);
    }
  } as unknown as AnalyserNode;

  return {
    node,
    setBins(bins: ArrayLike<number>) {
      const length = Math.min(binCount, bins.length);
      data.fill(0);
      for (let i = 0; i < length; i += 1) {
        const value = Math.round(Number(bins[i]) || 0);
        data[i] = Math.max(0, Math.min(255, value));
      }
    }
  };
}
