import { currentTime, duration } from '@renderer/composables/useAudioPlayer';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { getFrequencyBins as collectBins } from '@renderer/utils/audioViz';
import type { AudioPipDock, AudioPipElementId, AudioPipState } from '@shared/types/pip';
import { isAudioPipEdgeDock } from '@shared/types/pip';

export type { AudioPipState, AudioPipDock, AudioPipElementId };

export interface AudioPipLayoutOpts {
  dock: AudioPipDock;
  cornerElements: AudioPipElementId[];
  edgeElements: AudioPipElementId[];
  autoHide: boolean;
}

export function resolveAudioPipDock(): AudioPipDock {
  const settings = useSettingsStore();
  return settings.appearance.audioPipDock;
}

export function resolveAudioPipElements(dock?: AudioPipDock): AudioPipElementId[] {
  const settings = useSettingsStore();
  const d = dock ?? settings.appearance.audioPipDock;
  return isAudioPipEdgeDock(d)
    ? [...settings.appearance.audioPipEdgeElements]
    : [...settings.appearance.audioPipCornerElements];
}

export function resolveAudioPipLayoutOpts(): AudioPipLayoutOpts {
  const settings = useSettingsStore();
  return {
    dock: settings.appearance.audioPipDock,
    cornerElements: [...settings.appearance.audioPipCornerElements],
    edgeElements: [...settings.appearance.audioPipEdgeElements],
    autoHide: settings.appearance.audioPipAutoHide
  };
}

export function getFrequencyBins(): number[] {
  return collectBins(audioEngine.getAnalyserNode(), 48);
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
  if (path && !cached.data) void player.loadCover(path);
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
    vizData: [],
    nextTrackName: '' + (nextTrack?.name || ''),
    nextTrackArtist: '' + (nextTrack?.metadata?.artist || '')
  };
}
