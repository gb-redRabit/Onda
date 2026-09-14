import { binFreq } from '@renderer/utils/visualizerBins';
import { barGradient, spectrumGradient } from '@renderer/utils/visualizerGradients';
import { getWaveData } from '@renderer/utils/visualizerBuffers';

export function drawBars(
  analyser: AnalyserNode,
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sec: string,
  sens: number,
  data: Uint8Array,
  quality: { barCount: number }
) {
  const barCount = quality.barCount;
  const gap = 2;
  const barWidth = cw / barCount - gap;
  const bins = binFreq(analyser.frequencyBinCount, data, barCount);
  ctx.fillStyle = barGradient(ctx, ch, prim, sec);
  for (let i = 0; i < barCount; i++) {
    const val = bins[i] / 255;
    const barH = val * ch * sens;
    ctx.fillRect(i * (barWidth + gap), ch - barH, barWidth, barH);
  }
}

export function drawSpectrum(
  analyser: AnalyserNode,
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sec: string,
  sens: number,
  data: Uint8Array,
  quality: { barCount: number }
) {
  const barCount = quality.barCount;
  const gap = 2;
  const barWidth = cw / barCount - gap;
  const bins = binFreq(analyser.frequencyBinCount, data, barCount);
  ctx.fillStyle = spectrumGradient(ctx, cw, prim, sec);
  const centerY = ch / 2;
  for (let i = 0; i < barCount; i++) {
    const val = bins[i] / 255;
    const barH = (val * ch * sens) / 2;
    const x = i * (barWidth + gap);
    ctx.fillRect(x, centerY - barH, barWidth, barH);
    ctx.fillRect(x, centerY, barWidth, barH);
  }
}

export function drawWave(
  analyser: AnalyserNode,
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  bufferLength: number
) {
  const wave = getWaveData(analyser, bufferLength);
  ctx.lineWidth = 2;
  ctx.strokeStyle = prim;
  ctx.beginPath();
  const sliceWidth = cw / bufferLength;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = wave[i] / 128.0;
    const y = (v * ch) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();
}

export function drawRadial(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sens: number,
  data: Uint8Array,
  bufferLength: number,
  quality: { radialCount: number }
) {
  const cx = cw / 2;
  const cy = ch / 2;
  const radius = Math.min(cx, cy) * 0.4;
  const count = quality.radialCount;
  ctx.lineWidth = 2;
  ctx.strokeStyle = prim;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const val = data[Math.floor((i * bufferLength) / count)] / 255;
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const len = val * radius * 1.5 * sens + 4;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + len);
    const y2 = cy + Math.sin(angle) * (radius + len);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawCircle(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sens: number,
  data: Uint8Array,
  bufferLength: number,
  quality: { circleCount: number }
) {
  const cx = cw / 2;
  const cy = ch / 2;
  const baseR = Math.min(cx, cy) * 0.35;
  const count = quality.circleCount;
  const avg = data.reduce((a, b) => a + b, 0) / bufferLength / 255;
  const pulse = 1 + avg * 0.3 * sens;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const val = data[Math.floor((i * bufferLength) / count)] / 255;
    const angle = (i / count) * Math.PI * 2;
    const r = baseR * pulse + val * baseR * 0.6 * sens;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const radius = Math.max(1.5, val * 4);
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.fillStyle = prim;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawRings(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sec: string,
  sens: number,
  data: Uint8Array,
  bufferLength: number
) {
  const cx = cw / 2;
  const cy = ch / 2;
  const maxRadius = Math.min(cx, cy) * 0.85;
  const ringCount = 6;
  const binSize = Math.floor(bufferLength / ringCount);
  for (let r = 0; r < ringCount; r++) {
    const start = r * binSize;
    const end = Math.min(start + binSize, bufferLength);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    const val = sum / (end - start) / 255;
    const radius = (maxRadius / ringCount) * (r + 1);
    const lineWidth = 2 + val * 4 * sens;
    const progress = r / ringCount;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = progress < 0.5 ? prim : sec;
    ctx.globalAlpha = 0.3 + val * 0.7;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
