/** @deprecated Używane tylko do migracji starych ustawień. */
export type PipMode = 'minimal' | 'medium' | 'max' | 'wide';
/** @deprecated Używane tylko do migracji starych ustawień. */
export type PipPosition =
  'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'top' | 'bottom' | 'left' | 'right';

/** Dokowanie adaptacyjnego PiP audio: 4 rogi + 4 krawędzie (pełna długość). */
export type AudioPipDock =
  'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Pojedynczy element zawartości PiP. Rozmiar okna wynika z liczby elementów. */
export type AudioPipElementId =
  'cover' | 'trackInfo' | 'controls' | 'progress' | 'volume' | 'viz' | 'nextTrack' | 'eq';

export type AudioPipLayoutKind = 'card' | 'bar-h' | 'bar-v';

export function isAudioPipEdgeDock(dock: AudioPipDock): boolean {
  return dock === 'top' || dock === 'bottom' || dock === 'left' || dock === 'right';
}

export function audioPipLayoutKind(dock: AudioPipDock): AudioPipLayoutKind {
  if (dock === 'left' || dock === 'right') return 'bar-v';
  if (dock === 'top' || dock === 'bottom') return 'bar-h';
  return 'card';
}

/** Czysta funkcja rozmiaru — to samo liczy main, preview i podpowiedź w ustawieniach. */
export function getAudioPipSize(
  dock: AudioPipDock,
  elements: readonly AudioPipElementId[],
  workArea?: { width: number; height: number }
): { width: number; height: number } {
  const has = (id: AudioPipElementId): boolean => elements.includes(id);
  const w = workArea && workArea.width > 0 ? Math.round(workArea.width) : 1280;

  if (dock === 'top' || dock === 'bottom') {
    let h = 52;
    if (has('viz')) h += 26;
    if (has('nextTrack')) h += 16;
    if (has('eq')) h += 24;
    if (!has('cover') && !has('trackInfo')) h = Math.min(h, 56);
    return { width: w, height: Math.min(132, h) };
  }
  if (dock === 'left' || dock === 'right') {
    let ww = 76;
    if (has('cover')) ww += 10;
    if (has('volume')) ww += 8;
    if (has('viz') || has('eq') || has('nextTrack')) ww += 14;
    return {
      width: Math.min(132, ww),
      height: workArea && workArea.height > 0 ? Math.round(workArea.height) : 720
    };
  }
  let cw = 300;
  let ch = 68;
  if (has('cover')) cw += 24;
  if (has('volume')) {
    cw += 24;
    ch += 6;
  }
  if (has('viz')) ch += 26;
  if (has('nextTrack')) ch += 15;
  if (has('eq')) ch += 24;
  if (!has('cover') && !has('trackInfo')) {
    cw = Math.min(cw, 280);
    ch = Math.min(ch, 76);
  }
  return { width: Math.min(400, cw), height: Math.min(150, ch) };
}

export interface PipSubtitleData {
  subContent: string;
  fonts: Array<{ name: string; data: number[] }>;
  availableFonts: Record<string, string>;
}

export interface AudioPipState {
  trackName?: string;
  artist?: string;
  coverData?: string | null;
  coverType?: 'image' | 'video' | null;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  isMuted?: boolean;
  shuffle?: boolean;
  repeat?: 'none' | 'all' | 'one';
  equalizerBands?: number[];
  equalizerPreset?: string;
  vizData?: number[];
  nextTrackName?: string;
  nextTrackArtist?: string;
  [key: string]: unknown;
}
