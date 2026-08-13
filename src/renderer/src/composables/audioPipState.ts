import { currentTime, duration } from '@renderer/composables/useAudioPlayer';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { getFrequencyBins as collectBins } from '@renderer/utils/audioViz';
import type { AudioPipState, PipMode } from '@shared/types/pip';

export type { AudioPipState, PipMode };

export function isEdgeMode(mode: PipMode): boolean {
  return mode === 'max' || mode === 'wide';
}

export function resolveAudioPipPosition(mode: PipMode): string {
  const settings = useSettingsStore();
  return isEdgeMode(mode)
    ? settings.appearance.audioPipEdgePosition
    : settings.appearance.audioPipPosition;
}

export function getFrequencyBins(): number[] {
  return collectBins(audioEngine.getAnalyserNode(), 64);
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
