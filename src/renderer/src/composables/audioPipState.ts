import { currentTime, duration } from '@renderer/composables/useAudioPlayer';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioFxStore } from '@renderer/stores/audioFx';
import { useSettingsStore } from '@renderer/stores/settings';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { getFrequencyBins as collectBins } from '@renderer/utils/audioViz';
import type {
  AudioPipDock,
  AudioPipElementId,
  AudioPipLayoutOpts as SharedAudioPipLayoutOpts,
  AudioPipState
} from '@shared/types/pip';

export type { AudioPipState, AudioPipDock, AudioPipElementId };

/** Wariant w pełni wypełniony — `resolveAudioPipLayoutOpts` ustawia zawsze wszystkie pola. */
export type AudioPipLayoutOpts = Required<SharedAudioPipLayoutOpts>;

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
  const fx = useAudioFxStore();
  const track = player.currentTrack;
  const path = track?.path || '';
  const cached = player.getCover(path);
  if (path && !cached.data) void player.loadCover(path);
  const nextTrack = player.displayQueue[0];
  // Video-okładka (rodzeństwo mp4 przy mp3) to lokalna ścieżka. URL serwera mediów MUSI
  // powstać TU (okno główne zna bazę z tokenem); okno PiP ma własny kontekst i jego preload
  // celowo nie eksponuje `getMediaServerUrl`, więc `toMediaServerUrl` zbudowany tam dawał
  // `/?path=…`, a <video> cicho się ukrywał. Zdalne/miniaturowe okładki (https, data:) idą bez zmian.
  const isVideoCover = cached.type === 'video' && !!cached.data;
  return {
    trackName: '' + (track?.name || ''),
    artist: '' + (track?.metadata?.artist || ''),
    coverData: isVideoCover ? toMediaServerUrl(cached.data as string) : cached.data || null,
    coverType: cached.type || null,
    isPlaying: !!player.isPlaying,
    shuffle: !!player.shuffle,
    repeat: player.repeat || 'none',
    currentTime: +currentTime.value,
    duration: +duration.value,
    volume: +player.volume,
    isMuted: !!player.isMuted,
    equalizerPreset: fx.equalizerPreset || 'flat',
    vizData: [],
    nextTrackName: '' + (nextTrack?.name || ''),
    nextTrackArtist: '' + (nextTrack?.metadata?.artist || '')
  };
}
