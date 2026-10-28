import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';

// Testy montujące paska odtwarzacza: stany transportu, skróty klawiaturowe
// przewijania/głośności, przełączniki EQ/kolejki/mute i tryb mini.
const h = vi.hoisted(() => {
  const track = {
    id: 'a',
    path: 'C:/music/a.mp3',
    name: 'a',
    type: 'audio',
    duration: 120,
    metadata: { title: 'A', artist: 'Artist' }
  };
  return {
    track,
    audio: {
      currentTime: { value: 30 },
      duration: { value: 120 },
      buffered: { value: 60 },
      isPlaying: { value: false },
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn()
    },
    player: {
      currentTrack: track,
      streamPending: null,
      shuffle: false,
      repeat: 'none' as 'none' | 'all' | 'one',
      volume: 0.4,
      isMuted: false,
      queueVisible: false,
      isFavorite: vi.fn(() => false),
      toggleFavorite: vi.fn(),
      toggleQueue: vi.fn(),
      toggleMute: vi.fn(),
      prevTrack: vi.fn(),
      nextTrack: vi.fn(),
      toggleShuffle: vi.fn(),
      cycleRepeat: vi.fn(),
      abLoopTarget: vi.fn(() => null)
    },
    fx: { equalizerVisible: false, toggleEqualizer: vi.fn() },
    plugins: { decorations: { cover: 'none' } },
    router: { push: vi.fn() }
  };
});

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => h.fx }));
vi.mock('@renderer/stores/plugins', () => ({ usePluginsStore: () => h.plugins }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => h.audio }));
vi.mock('@renderer/composables/useAlwaysOnTop', () => ({
  useAlwaysOnTop: () => ({ pinned: { value: false }, togglePin: vi.fn() })
}));
vi.mock('vue-router', () => ({ useRouter: () => h.router }));

import PlayerBar from '../PlayerBar.vue';
import en from '../../../locales/en';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });

function mountBar() {
  return mount(PlayerBar, {
    global: {
      plugins: [i18n],
      stubs: {
        PlayerBarMini: { template: '<div data-testid="mini-stub" />' },
        AbRepeatButton: true,
        AbRepeatMarkers: true,
        MediaCover: true,
        TrackInfo: true
      }
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.audio.isPlaying.value = false;
  h.audio.currentTime.value = 30;
  h.audio.duration.value = 120;
  h.player.currentTrack = h.track;
});

describe('PlayerBar — render', () => {
  it('renders the full bar with the current track', () => {
    const w = mountBar();
    expect(w.find('[data-testid="player-bar"]').exists()).toBe(true);
    expect(w.find('[data-testid="player-bar"]').attributes('data-playing')).toBe('false');
    expect(w.text()).toContain('0:30');
    expect(w.text()).toContain('2:00');
  });

  it('hides the seek bar for live radio streams', () => {
    h.player.currentTrack = {
      ...h.track,
      id: 'radio:one',
      type: 'stream',
      duration: 0
    };
    const w = mountBar();
    expect(w.find('[aria-label="Playback position"]').exists()).toBe(false);
    expect(w.text()).toContain('LIVE');
    h.player.currentTrack = h.track;
  });
});

describe('PlayerBar — transport', () => {
  it('plays through the audio bridge when paused', async () => {
    const w = mountBar();
    await w.find('button[aria-label="Play"]').trigger('click');
    expect(h.audio.play).toHaveBeenCalledTimes(1);
  });

  it('pauses through the audio bridge when playing', async () => {
    h.audio.isPlaying.value = true;
    const w = mountBar();
    await w.find('button[aria-label="Pause"]').trigger('click');
    expect(h.audio.pause).toHaveBeenCalledTimes(1);
  });

  it('seeks with the keyboard on the progress slider', async () => {
    const w = mountBar();
    await w.find('[aria-label="Playback position"]').trigger('keydown', { key: 'ArrowRight' });
    expect(h.audio.seek).toHaveBeenCalledWith(35);
    await w.find('[aria-label="Playback position"]').trigger('keydown', { key: 'Home' });
    expect(h.audio.seek).toHaveBeenLastCalledWith(0);
  });

  it('adjusts the volume with the keyboard', async () => {
    const w = mountBar();
    await w.find('[aria-label="Volume"]').trigger('keydown', { key: 'End' });
    expect(h.audio.setVolume).toHaveBeenCalledWith(1);
    await w.find('[aria-label="Volume"]').trigger('keydown', { key: 'ArrowDown' });
    const lastVolume = h.audio.setVolume.mock.calls.at(-1)?.[0] as number;
    expect(lastVolume).toBeCloseTo(0.35);
  });
});

describe('PlayerBar — panels', () => {
  it('toggles the queue, equalizer and mute from the bar', async () => {
    const w = mountBar();
    await w.find('[data-testid="player-queue"]').trigger('click');
    await w.find('[data-testid="player-eq"]').trigger('click');
    await w.find('[aria-label="Mute"]').trigger('click');
    expect(h.player.toggleQueue).toHaveBeenCalledTimes(1);
    expect(h.fx.toggleEqualizer).toHaveBeenCalledTimes(1);
    expect(h.player.toggleMute).toHaveBeenCalledTimes(1);
  });

  it('switches to the mini player and back is handled by the mini component', async () => {
    const w = mountBar();
    expect(w.find('[data-testid="mini-stub"]').exists()).toBe(false);
    await w.find('[aria-label="Mini player"]').trigger('click');
    expect(w.find('[data-testid="mini-stub"]').exists()).toBe(true);
    expect(w.find('[data-testid="player-bar"]').exists()).toBe(false);
  });

  it('opens the audio view through the router', async () => {
    const w = mountBar();
    await w.find('[aria-label="Audio view"]').trigger('click');
    expect(h.router.push).toHaveBeenCalledWith('/audio');
  });
});
