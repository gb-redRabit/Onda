/** Zmniejsza tablicę peaków do szerokości canvasu (max w każdym przedziale). */
export function downsamplePeaks(peaks: readonly number[], width: number): number[] {
  const target = Math.max(1, Math.floor(width));
  if (peaks.length <= target) return [...peaks];
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    const start = Math.floor((i * peaks.length) / target);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / target));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) max = Math.max(max, peaks[j]);
    out.push(max);
  }
  return out;
}

/** Kolor fali z aktywnego motywu (fallback: firmowy fiolet). */
export function waveformColor(): string {
  return cssColor('--color-base-content', '#8b7cf0');
}

/** Kolor odtwarzanej części fali (primary motywu). */
export function waveformPlayedColor(): string {
  return cssColor('--color-primary', '#605dff');
}

function cssColor(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}
