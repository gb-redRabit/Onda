export type PipMode = 'minimal' | 'medium' | 'max' | 'wide';
export type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'top' | 'bottom';

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
