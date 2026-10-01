// Bufor roboczy używany ponownie między klatkami (bez alokacji per klatka).
let binScratch: number[] = [];

// Downsample'uje dane częstotliwości analizatora do `count` uśrednionych binów.
export function binFreq(freqBinCount: number, data: Uint8Array, count: number): number[] {
  const len = freqBinCount;
  const binSize = Math.floor(len / count);
  if (binScratch.length !== count) binScratch = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const start = i * binSize;
    const end = Math.min(start + binSize, len);
    for (let j = start; j < end; j++) sum += data[j];
    binScratch[i] = Math.round(sum / (end - start));
  }
  return binScratch;
}
