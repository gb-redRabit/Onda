// Czysta matematyka osi czasu i formatowanie dla Video Clippera. Wydzielone z
// widoku, żeby dało się to testować bez montowania komponentu i DOM.

export const TRACK_PAD_PCT = 8;
export const TRACK_SPAN_PCT = 84;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 256;
export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];
export const FRAME_STRIP_MIN_PX = 6;
export const FRAME_STRIP_MAX = 120;
export const MIN_THUMBNAILS = 10;
export const MAX_THUMBNAILS = 120;
export const THUMB_TARGET_WIDTH = 150;
export const SNAP_PX = 8;
export const TICK_STEPS = [
  1 / 120,
  1 / 60,
  1 / 30,
  1 / 15,
  0.05,
  1 / 10,
  0.2,
  0.5,
  1,
  2,
  5,
  10,
  15,
  30,
  60,
  120,
  300,
  600,
  900,
  1800,
  3600
];

export function percentageOf(seconds: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.min(100, Math.max(0, (seconds / duration) * 100));
}

export function trackPctOf(value: number): number {
  return TRACK_PAD_PCT + (value * TRACK_SPAN_PCT) / 100;
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function formatClipTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatTimecode(seconds: number, fpsValue: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00:00';
  const fps = Math.max(1, Math.round(fpsValue || 30));
  const totalFrames = Math.max(0, Math.round(seconds * fps));
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const secs = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    secs
  ).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export function formatRulerTime(seconds: number, step: number): string {
  if (step < 0.1) {
    const hundredths = Math.round(seconds * 100);
    return `${formatClipTime(Math.floor(hundredths / 100))}.${String(hundredths % 100).padStart(2, '0')}`;
  }
  if (step < 1) {
    const tenths = Math.round(seconds * 10);
    return `${formatClipTime(Math.floor(tenths / 10))}.${tenths % 10}`;
  }
  return formatClipTime(seconds);
}

export function extensionOf(path: string): string {
  const name = fileNameOf(path);
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export type SnapTarget = 'playhead' | 'start' | 'end' | null;

export interface SnapTimeOptions {
  duration: number;
  fps: number;
  enabled: boolean;
  pixelsPerSecond: number;
  targets: { start: number; end: number; playhead: number };
  exclude?: SnapTarget;
}

export function snapTimeToTargets(value: number, options: SnapTimeOptions): number {
  const fps = Math.max(1, options.fps || 30);
  let snapped = Math.max(0, Math.min(options.duration, Math.round(value * fps) / fps));
  if (!options.enabled) return snapped;
  const threshold = options.pixelsPerSecond > 0 ? SNAP_PX / options.pixelsPerSecond : 0.05;
  const candidates: number[] = [];
  if (options.exclude !== 'start') candidates.push(options.targets.start);
  if (options.exclude !== 'end') candidates.push(options.targets.end);
  if (options.exclude !== 'playhead') candidates.push(options.targets.playhead);
  for (const target of candidates) {
    if (Math.abs(snapped - target) <= threshold) {
      snapped = Math.max(0, Math.min(options.duration, Math.round(target * fps) / fps));
      break;
    }
  }
  return snapped;
}

/** Czas (s) odpowiadający procentowi szerokości treści osi. */
export function timeAtPercent(percent: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.min(duration, Math.max(0, ((percent - TRACK_PAD_PCT) / TRACK_SPAN_PCT) * duration));
}

/** Czas (s) odpowiadający przesunięciu w px względem pełnej szerokości osi. */
export function timeAtPx(px: number, widthPx: number, duration: number): number {
  if (widthPx <= 0) return 0;
  return timeAtPercent((px / widthPx) * 100, duration);
}

export function chooseTickStep(pixelsPerSecondValue: number, minSpacingPx: number): number {
  return (
    TICK_STEPS.find((step) => step * pixelsPerSecondValue >= minSpacingPx) ??
    TICK_STEPS[TICK_STEPS.length - 1]
  );
}

export interface TimelineTick {
  left: number;
  label?: string;
  kind: 'major' | 'minor' | 'frame';
}

export interface TimelineTicksOptions {
  duration: number;
  widthPx: number;
  pixelsPerSecond: number;
  zoom: number;
  frameWidthPx: number;
  frameDuration: number;
  scrollLeft: number;
  viewportWidth: number;
}

export function buildTimelineTicks(options: TimelineTicksOptions): TimelineTick[] {
  const { duration, widthPx, pixelsPerSecond, zoom, frameWidthPx, frameDuration } = options;
  if (duration <= 0 || widthPx <= 0 || pixelsPerSecond <= 0) return [];
  const majorStep = chooseTickStep(pixelsPerSecond, zoom >= 32 ? 120 : 64);
  const minorStep = majorStep / 5;
  const showFrames = frameWidthPx >= 3;
  const visibleStart = timeAtPercent((options.scrollLeft / widthPx) * 100, duration);
  const visibleEnd = timeAtPercent(
    ((options.scrollLeft + options.viewportWidth) / widthPx) * 100,
    duration
  );
  const from = Math.max(0, visibleStart - majorStep * 2);
  const to = Math.min(duration, visibleEnd + majorStep * 2);
  const ticks: TimelineTick[] = [];
  const seen = new Set<string>();

  const push = (seconds: number, kind: TickKind, label?: string): void => {
    if (seconds < 0 || seconds > duration) return;
    const key = seconds.toFixed(6);
    if (seen.has(key)) return;
    seen.add(key);
    ticks.push({ left: (seconds / duration) * 100, label, kind });
  };

  const majorStart = Math.ceil(from / majorStep - 1e-9) * majorStep;
  for (let time = majorStart; time <= to + 1e-6; time += majorStep) {
    push(time, 'major', formatRulerTime(time, majorStep));
  }
  if (!showFrames && minorStep > 0) {
    const minorStart = Math.ceil(from / minorStep - 1e-9) * minorStep;
    for (let time = minorStart; time <= to + 1e-6; time += minorStep) {
      push(time, 'minor');
    }
  }
  if (showFrames) {
    const step = frameDuration;
    const frameStart = Math.ceil(from / step - 1e-9) * step;
    for (let time = frameStart; time <= to + 1e-6; time += step) {
      ticks.push({ left: (time / duration) * 100, kind: 'frame' });
    }
  }
  return ticks;
}

type TickKind = 'major' | 'minor' | 'frame';

export interface FrameStripCoversOptions {
  strip: { startSec: number; stepSec: number; frames: string[] } | null;
  duration: number;
  widthPx: number;
  scrollLeft: number;
  viewportWidth: number;
}

export function frameStripCovers(options: FrameStripCoversOptions): boolean {
  const { strip, duration, widthPx } = options;
  if (!strip || strip.frames.length === 0 || !duration || widthPx <= 0) return false;
  const viewStart = timeAtPx(options.scrollLeft, widthPx, duration);
  const viewEnd = timeAtPx(options.scrollLeft + options.viewportWidth, widthPx, duration);
  const stripStart = strip.startSec;
  const stripEnd = strip.startSec + strip.frames.length * strip.stepSec;
  const margin = strip.stepSec * 2;
  return viewStart >= stripStart - margin && viewEnd <= stripEnd + margin;
}

/** Ile miniatur pobrać dla danej szerokości okna i zoomu. */
export function desiredThumbnailCount(viewportWidth: number, zoom: number): number {
  const width = viewportWidth || 0;
  const contentWidth = Math.max(width, 320) * zoom;
  return Math.min(
    MAX_THUMBNAILS,
    Math.max(MIN_THUMBNAILS, Math.ceil(contentWidth / THUMB_TARGET_WIDTH))
  );
}

export interface FrameStripWindow {
  start: number;
  end: number;
  count: number;
  stepSec: number;
}

/** Okno klatek do pobrania dla aktualnie widocznego fragmentu osi. */
export function computeFrameStripWindow(options: {
  duration: number;
  widthPx: number;
  scrollLeft: number;
  viewportWidth: number;
  fps: number;
}): FrameStripWindow | null {
  const { duration, widthPx, fps } = options;
  if (duration <= 0 || widthPx <= 0) return null;
  const visibleStart = timeAtPx(options.scrollLeft, widthPx, duration);
  const visibleEnd = timeAtPx(options.scrollLeft + options.viewportWidth, widthPx, duration);
  const safeFps = Math.max(1, fps);
  const frameStep = 1 / safeFps;
  const visibleCount = Math.min(
    FRAME_STRIP_MAX,
    Math.max(1, Math.ceil((visibleEnd - visibleStart) / frameStep))
  );
  const extra = Math.max(0, FRAME_STRIP_MAX - visibleCount);
  const padCount = Math.min(Math.floor(visibleCount * 0.75), Math.floor(extra / 2));
  const count = Math.min(FRAME_STRIP_MAX, visibleCount + padCount * 2);
  const start = Math.max(
    0,
    Math.floor((visibleStart - padCount * frameStep) / frameStep) * frameStep
  );
  const end = Math.min(duration, start + count * frameStep);
  const stepSec = (end - start) / count;
  return { start, end, count, stepSec };
}
