// Night schedule: downloads only start inside the configured hour window.
// `start === end` means "always allowed". A wrapping window (e.g. 22→6) covers
// [start, 24) ∪ [0, end).
export function isWithinWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
