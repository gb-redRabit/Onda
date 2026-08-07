import { currentTime, duration } from '@renderer/composables/useAudioPlayer';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';

export type PipMode = 'minimal' | 'medium' | 'max' | 'wide';

export function isEdgeMode(mode: PipMode): boolean {
  return mode === 'max' || mode === 'wide';
}

export function resolveAudioPipPosition(mode: PipMode): string {
  const settings = useSettingsStore();
  return isEdgeMode(mode) ? settings.appearance.audioPipEdgePosition : settings.appearance.audioPipPosition;
}

export interface AudioPipState extends Record<string, unknown> {
  trackName: string;
  artist: string;
  coverData: string | null;
  coverType: 'image' | 'video' | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted?: boolean;
  shuffle?: boolean;
  repeat?: 'none' | 'all' | 'one';
  equalizerBands?: number[];
  equalizerPreset?: string;
  vizData?: number[];
  nextTrackName?: string;
  nextTrackArtist?: string;
}

export function getFrequencyBins(): number[] {
  try {
    const analyser = audioEngine.getAnalyserNode();
    if (!analyser) return [];
    const len = analyser.frequencyBinCount;
    const raw = new Uint8Array(len);
    analyser.getByteFrequencyData(raw);
    const count = 64;
    const bins: number[] = [];
    const binSize = Math.floor(len / count);
    for (let i = 0; i < count; i++) {
      let sum = 0;
      const start = i * binSize;
      const end = Math.min(start + binSize, len);
      for (let j = start; j < end; j++) sum += raw[j];
      bins.push(Math.round(sum / (end - start)));
    }
    return bins;
  } catch {
    return [];
  }
}

export function createEmptyAudioPipState(): AudioPipState {
  return {
    trackName: '',
    artist: '',
    coverData: null,
    coverType: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1
  };
}

export function buildAudioPipState(): AudioPipState {
  const player = usePlayerStore();
  const track = player.currentTrack;
  const path = track?.path || '';
  const cached = player.getCover(path);
  if (path && !cached.data) player.loadCover(path);
  const nextTrack = player.displayQueue[0];
  return {
    trackName: '' + (track?.name || ''),
    artist: '' + (track?.metadata?.artist || ''),
    coverData: cached.data || null,
    coverType: cached.type || null,
    isPlaying: !!player.isPlaying,
    shuffle: !!player.shuffle,
    repeat: player.repeat || 'none',
    currentTime: +currentTime.value,
    duration: +duration.value,
    volume: +player.volume,
    isMuted: !!player.isMuted,
    equalizerBands: (player.equalizerBands || []).slice(),
    equalizerPreset: player.equalizerPreset || 'flat',
    vizData: getFrequencyBins(),
    nextTrackName: '' + (nextTrack?.name || ''),
    nextTrackArtist: '' + (nextTrack?.metadata?.artist || '')
  };
}
