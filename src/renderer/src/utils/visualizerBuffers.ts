// Bufory robocze analizatora (bez alokacji per klatka).
let freqData: Uint8Array<ArrayBuffer> | null = null;
let smoothPrev: Uint8Array<ArrayBuffer> | null = null;
let smoothOut: Uint8Array<ArrayBuffer> | null = null;
let waveBuf: Uint8Array<ArrayBuffer> | null = null;

export function getFreqData(analyser: AnalyserNode, bufferLength: number): Uint8Array<ArrayBuffer> {
  if (!freqData || freqData.length !== bufferLength) freqData = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(freqData);
  return freqData;
}

// Nakłada obwiednię wygładzania wykładniczego; zwraca bufor, z którego rysować.
export function smoothData(
  data: Uint8Array<ArrayBuffer>,
  smoothing: number,
  bufferLength: number
): Uint8Array<ArrayBuffer> {
  if (smoothing <= 0) return data;
  if (!smoothPrev || smoothPrev.length !== bufferLength) smoothPrev = new Uint8Array(bufferLength);
  if (!smoothOut || smoothOut.length !== bufferLength) smoothOut = new Uint8Array(bufferLength);
  const prev = smoothPrev;
  const out = smoothOut;
  for (let i = 0; i < bufferLength; i++) {
    out[i] = Math.max(data[i], Math.round(prev[i] * smoothing));
  }
  // ping-pong: świeżo policzony bufor staje się bazą dla następnej klatki
  smoothPrev = out;
  smoothOut = prev;
  return out;
}

export function getWaveData(analyser: AnalyserNode, bufferLength: number): Uint8Array<ArrayBuffer> {
  if (!waveBuf || waveBuf.length !== bufferLength) waveBuf = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(waveBuf);
  return waveBuf;
}
