// Scratch buffer reused across frames (no per-frame allocation).
let binScratch: number[] = [];

// Downsamples the analyser frequency data into `count` averaged bins.
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
