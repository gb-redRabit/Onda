export function getFrequencyBins(
  analyser: AnalyserNode | null | undefined,
  count: number
): number[] {
  try {
    if (!analyser) return [];
    const len = analyser.frequencyBinCount;
    const raw = new Uint8Array(len);
    analyser.getByteFrequencyData(raw);
    const bins: number[] = [];
    const binSize = Math.floor(len / count);
    // Za mało danych na żądaną liczbę koszy — dzielenie przez zero dałoby NaN.
    if (binSize < 1) return [];
    for (let i = 0; i < count; i++) {
      let sum = 0;
      const start = i * binSize;
      const end = Math.min(start + binSize, len);
      for (let j = start; j < end; j++) sum += raw[j];
      bins.push(Math.round(sum / (end - start)));
    }
    return bins;
  } catch {
    return [];
  }
}
