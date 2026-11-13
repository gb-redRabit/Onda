import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  currentTime: null as any,
  duration: null as any,
  player: null as any,
  fx: null as any,
  settings: null as any,
  getAnalyserNode: vi.fn(),
  toMediaServerUrl: vi.fn((path: string) => `media:${path}`),
  collectBins: vi.fn()
}));

vi.mock('@renderer/composables/useAudioPlayer', async () => {
  const { ref } = await import('vue');
  h.currentTime = ref(0);
  h.duration = ref(0);
  return {
    currentTime: h.currentTime,
    duration: h.duration,
    useAudioPlayer: () => ({ getAnalyserNode: h.getAnalyserNode })
  };
});
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => h.fx }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: h.toMediaServerUrl
}));
vi.mock('@renderer/utils/audioViz', () => ({ getFrequencyBins: h.collectBins }));

import {
  buildAudioPipState,
  createEmptyAudioPipState,
  getFrequencyBins,
  resolveAudioPipLayoutOpts
} from '../audioPipState';

beforeEach(() => {
  h.currentTime.value = 10;
  h.duration.value = 100;
  h.getAnalyserNode.mockReset().mockReturnValue('analyser');
  h.toMediaServerUrl.mockClear();
  h.collectBins.mockReset().mockReturnValue([1, 2]);
  h.player = {
    currentTrack: {
      path: '/a.mp3',
      name: 'Song',
      metadata: { artist: 'Artist' }
    },
    displayQueue: [{ name: 'Next', metadata: { artist: 'Next artist' } }],
    getCover: vi.fn(() => ({ data: 'cover.png', type: 'image' })),
    loadCover: vi.fn(),
    isPlaying: true,
    shuffle: true,
    repeat: 'all',
    volume: 0.5,
    isMuted: true
  };
  h.fx = { equalizerPreset: 'rock' };
  h.settings = {
    appearance: {
      audioPipDock: 'bottom',
      audioPipCornerElements: ['cover'],
      audioPipEdgeElements: ['cover', 'viz'],
      audioPipAutoHide: true
    }
  };
});

describe('resolveAudioPipLayoutOpts', () => {
  it('copies layout settings', () => {
    const opts = resolveAudioPipLayoutOpts();

    expect(opts).toEqual({
      dock: 'bottom',
      cornerElements: ['cover'],
      edgeElements: ['cover', 'viz'],
      autoHide: true
    });
    expect(opts.edgeElements).not.toBe(h.settings.appearance.audioPipEdgeElements);
  });
});

describe('getFrequencyBins', () => {
  it('collects 48 bins from the analyser', () => {
    expect(getFrequencyBins()).toEqual([1, 2]);
    expect(h.collectBins).toHaveBeenCalledWith('analyser', 48);
  });
});

describe('createEmptyAudioPipState', () => {
  it('provides a minimal silent state', () => {
    expect(createEmptyAudioPipState()).toEqual({
      trackName: '',
      artist: '',
      coverData: null,
      coverType: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1
    });
  });
});

describe('buildAudioPipState', () => {
  it('maps the full player state', () => {
    const state = buildAudioPipState();

    expect(state).toMatchObject({
      trackName: 'Song',
      artist: 'Artist',
      coverData: 'cover.png',
      coverType: 'image',
      isPlaying: true,
      shuffle: true,
      repeat: 'all',
      currentTime: 10,
      duration: 100,
      volume: 0.5,
      isMuted: true,
      equalizerPreset: 'rock',
      vizData: [],
      nextTrackName: 'Next',
      nextTrackArtist: 'Next artist'
    });
    expect(h.player.loadCover).not.toHaveBeenCalled();
  });

  it('serves video covers through the media server', () => {
    h.player.getCover.mockReturnValue({ data: '/covers/a.mp4', type: 'video' });

    const state = buildAudioPipState();

    expect(state.coverData).toBe('media:/covers/a.mp4');
    expect(h.toMediaServerUrl).toHaveBeenCalledWith('/covers/a.mp4');
  });

  it('loads a missing cover once', () => {
    h.player.getCover.mockReturnValue({ data: null });

    buildAudioPipState();

    expect(h.player.loadCover).toHaveBeenCalledWith('/a.mp3');
  });

  it('handles a missing track and defaults', () => {
    h.player.currentTrack = null;
    h.player.displayQueue = [];
    h.player.getCover.mockReturnValue({});
    h.player.shuffle = false;
    h.player.repeat = '';
    h.player.volume = 1;
    h.player.isMuted = false;
    h.fx.equalizerPreset = '';

    const state = buildAudioPipState();

    expect(state).toMatchObject({
      trackName: '',
      artist: '',
      coverData: null,
      coverType: null,
      isPlaying: true,
      shuffle: false,
      repeat: 'none',
      currentTime: 10,
      duration: 100,
      isMuted: false,
      equalizerPreset: 'flat',
      nextTrackName: '',
      nextTrackArtist: ''
    });
    expect(h.player.loadCover).not.toHaveBeenCalled();
  });
});
