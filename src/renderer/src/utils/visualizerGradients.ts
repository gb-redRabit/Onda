// Gradient caches (rebuilt only when the canvas size or colors change).
let barGrad: CanvasGradient | null = null;
let barGradH = 0;
let barGradPrim = '';
let barGradSec = '';
let spectGrad: CanvasGradient | null = null;
let spectGradW = 0;
let spectGradPrim = '';
let spectGradSec = '';

export function barGradient(
  ctx: CanvasRenderingContext2D,
  ch: number,
  prim: string,
  sec: string
): CanvasGradient {
  if (!barGrad || barGradH !== ch || barGradPrim !== prim || barGradSec !== sec) {
    barGrad = ctx.createLinearGradient(0, 0, 0, ch);
    barGrad.addColorStop(0, prim);
    barGrad.addColorStop(1, sec);
    barGradH = ch;
    barGradPrim = prim;
    barGradSec = sec;
  }
  return barGrad;
}

export function spectrumGradient(
  ctx: CanvasRenderingContext2D,
  cw: number,
  prim: string,
  sec: string
): CanvasGradient {
  if (!spectGrad || spectGradW !== cw || spectGradPrim !== prim || spectGradSec !== sec) {
    spectGrad = ctx.createLinearGradient(0, 0, cw, 0);
    spectGrad.addColorStop(0, sec);
    spectGrad.addColorStop(0.5, prim);
    spectGrad.addColorStop(1, sec);
    spectGradW = cw;
    spectGradPrim = prim;
    spectGradSec = sec;
  }
  return spectGrad;
}

export function resetGradients(): void {
  barGrad = null;
  spectGrad = null;
}
