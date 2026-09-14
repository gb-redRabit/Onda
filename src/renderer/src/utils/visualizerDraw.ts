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
