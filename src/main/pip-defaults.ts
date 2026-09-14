import type { AudioPipElementId, AudioPipState } from '../shared/types/pip';

export const DEFAULT_CORNER_ELEMENTS: AudioPipElementId[] = [
  'cover',
  'trackInfo',
  'controls',
  'progress',
  'volume'
];

export const DEFAULT_EDGE_ELEMENTS: AudioPipElementId[] = [
  'cover',
  'trackInfo',
  'controls',
  'progress',
  'volume',
  'viz'
];

export const PREVIEW_STATE: AudioPipState = {
  trackName: 'Podgląd — przykładowy utwór',
  artist: 'Onda',
  coverData: null,
  coverType: null,
  isPlaying: true,
  currentTime: 42,
  duration: 214,
  volume: 0.8,
  isMuted: false,
  shuffle: false,
  repeat: 'none',
  nextTrackName: 'Następny — podgląd',
  nextTrackArtist: 'Onda'
};
