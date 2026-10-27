import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

// Regresja: video-okładka (sibling mp4 przy mp3) MUSI być przetworzona na URL serwera
// mediów jeszcze w oknie głównym. Okno audio-PiP ma osobny kontekst i nie zna bazy
// serwera (preload celowo jej nie eksponuje) — gdy `buildAudioPipState` oddawało surową
// ścieżkę, PiP budował `/?path=…` i <video> cicho się ukrywał (brak okładki).

const h = vi.hoisted(() => ({
  cover: { type: null, data: null } as { type: 'video' | 'image' | null; data: string | null }
}));

vi.mock('@renderer/composables/useAudioPlayer', () => ({
  currentTime: ref(0),
  duration: ref(0)
}));
vi.mock('@renderer/modules/audioEngine', () => ({
  audioEngine: { getAnalyserNode: () => null }
}));
vi.mock('@renderer/stores/settings', () => ({
  useSettingsStore: () => ({
    appearance: {
      audioPipDock: 'bottom-right',
      audioPipCornerElements: [],
      audioPipEdgeElements: [],
      audioPipAutoHide: false
    }
  })
}));
vi.mock('@renderer/stores/audioFx', () => ({
  useAudioFxStore: () => ({ equalizerPreset: 'flat' })
}));
vi.mock('@renderer/utils/audioViz', () => ({ getFrequencyBins: () => [] }));
vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: (p: string) => `MEDIA://${p}`
}));
vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({
    currentTrack: { name: 'Song', path: 'C:/music/song.mp3', metadata: { artist: 'A' } },
    getCover: () => h.cover,
    loadCover: vi.fn(),
    displayQueue: [],
    isPlaying: false,
    volume: 1,
    isMuted: false,
    shuffle: false,
    repeat: 'none'
  })
}));

import { buildAudioPipState } from '../audioPipState';

beforeEach(() => {
  h.cover = { type: null, data: null };
});

describe('buildAudioPipState cover', () => {
  it('converts a video cover path into a media-server URL', () => {
    h.cover = { type: 'video', data: 'C:/music/song.mp4' };
    const state = buildAudioPipState();
    expect(state.coverType).toBe('video');
    expect(state.coverData).toBe('MEDIA://C:/music/song.mp4');
  });

  it('passes a data-URL image cover through unchanged', () => {
    h.cover = { type: 'image', data: 'data:image/jpeg;base64,AAAA' };
    const state = buildAudioPipState();
    expect(state.coverType).toBe('image');
    expect(state.coverData).toBe('data:image/jpeg;base64,AAAA');
  });

  it('passes a remote https image cover through unchanged', () => {
    h.cover = { type: 'image', data: 'https://i.ytimg.com/vi/x/hq.jpg' };
    const state = buildAudioPipState();
    expect(state.coverData).toBe('https://i.ytimg.com/vi/x/hq.jpg');
  });

  it('is null when there is no cover', () => {
    const state = buildAudioPipState();
    expect(state.coverData).toBeNull();
    expect(state.coverType).toBeNull();
  });
});
