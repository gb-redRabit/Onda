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
      currentTrack: track as typeof track | null,
      streamPending: null as typeof track | null,
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
    router: { push: vi.fn() },
    togglePin: vi.fn()
  };
});

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => h.fx }));
vi.mock('@renderer/stores/plugins', () => ({ usePluginsStore: () => h.plugins }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => h.audio }));
vi.mock('@renderer/composables/useAlwaysOnTop', () => ({
  useAlwaysOnTop: () => ({ pinned: { value: false }, togglePin: h.togglePin })
}));
vi.mock('vue-router', () => ({ useRouter: () => h.router }));

import { Volume1, Volume2, VolumeX } from '@lucide/vue';
import PlayerBar from '../PlayerBar.vue';
import en from '../../../locales/en';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });

function mountBar() {
  return mount(PlayerBar, {
    global: {
      plugins: [i18n],
      stubs: {
        PlayerBarMini: {
          name: 'PlayerBarMini',
          emits: ['seek', 'seek-by', 'toggle-play', 'audio-view', 'expand', 'toggle-pin'],
          template: '<div data-testid="mini-stub" />'
        },
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

describe('PlayerBar — pointer interactions', () => {
  function rect(element: Element, width: number, left = 0): void {
    (element as HTMLElement).getBoundingClientRect = () =>
      ({
        left,
        width,
        top: 0,
        height: 0,
        right: left + width,
        bottom: 0,
        x: left,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect;
  }

  it('seeks and changes volume by clicking the sliders', async () => {
    const w = mountBar();
    const seek = w.find('[aria-label="Playback position"]');
    rect(seek.element, 200);
    await seek.trigger('click', { clientX: 100 });
    expect(h.audio.seek).toHaveBeenCalledWith(60);

    const volume = w.find('[aria-label="Volume"]');
    rect(volume.element, 100);
    await volume.trigger('click', { clientX: 25 });
    expect(h.audio.setVolume).toHaveBeenCalledWith(0.25);
  });

  it('handles every seek keyboard shortcut and ignores others', async () => {
    const w = mountBar();
    const seek = w.find('[aria-label="Playback position"]');

    await seek.trigger('keydown', { key: 'ArrowLeft', shiftKey: true });
    expect(h.audio.seek).toHaveBeenLastCalledWith(0);

    await seek.trigger('keydown', { key: 'PageDown' });
    expect(h.audio.seek).toHaveBeenLastCalledWith(0);

    await seek.trigger('keydown', { key: 'PageUp' });
    expect(h.audio.seek).toHaveBeenLastCalledWith(60);

    await seek.trigger('keydown', { key: 'End' });
    expect(h.audio.seek).toHaveBeenLastCalledWith(120);

    h.audio.seek.mockClear();
    await seek.trigger('keydown', { key: 'x' });
    expect(h.audio.seek).not.toHaveBeenCalled();
  });

  it('handles every volume keyboard shortcut and ignores others', async () => {
    const w = mountBar();
    const volume = w.find('[aria-label="Volume"]');

    await volume.trigger('keydown', { key: 'ArrowLeft', shiftKey: true });
    expect(h.audio.setVolume.mock.calls.at(-1)![0]).toBeCloseTo(0.3);

    await volume.trigger('keydown', { key: 'ArrowUp' });
    expect(h.audio.setVolume.mock.calls.at(-1)![0]).toBeCloseTo(0.45);

    await volume.trigger('keydown', { key: 'Home' });
    expect(h.audio.setVolume).toHaveBeenLastCalledWith(0);

    h.audio.setVolume.mockClear();
    await volume.trigger('keydown', { key: 'x' });
    expect(h.audio.setVolume).not.toHaveBeenCalled();
  });
});

describe('PlayerBar — mini player bridge', () => {
  async function enterMini() {
    const w = mountBar();
    await w.find('[aria-label="Mini player"]').trigger('click');
    return w;
  }

  it('forwards seek and seek-by from the mini player', async () => {
    const w = await enterMini();
    const mini = w.findComponent({ name: 'PlayerBarMini' });

    mini.vm.$emit('seek', {
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, width: 120 })
      },
      clientX: 60
    });
    expect(h.audio.seek).toHaveBeenCalledWith(60);

    mini.vm.$emit('seek-by', -100);
    expect(h.audio.seek).toHaveBeenLastCalledWith(0);
    mini.vm.$emit('seek-by', 10);
    expect(h.audio.seek).toHaveBeenLastCalledWith(40);
  });

  it('plays, opens the audio view, pins and expands from the mini player', async () => {
    const w = await enterMini();
    const mini = w.findComponent({ name: 'PlayerBarMini' });

    mini.vm.$emit('toggle-play');
    mini.vm.$emit('audio-view');
    mini.vm.$emit('toggle-pin');
    expect(h.audio.play).toHaveBeenCalled();
    expect(h.router.push).toHaveBeenCalledWith('/audio');
    expect(h.togglePin).toHaveBeenCalled();

    mini.vm.$emit('expand');
    await w.vm.$nextTick();
    expect(w.find('[data-testid="player-bar"]').exists()).toBe(true);
  });
});

describe('PlayerBar — favorites, live and icons', () => {
  it('toggles the favorite and reflects the state', async () => {
    h.player.isFavorite.mockReturnValue(true);
    const w = mountBar();
    const fav = w.find('button[aria-label="Remove from favorites"]');

    expect(fav.classes()).toContain('text-error');
    expect(fav.find('svg').attributes('fill')).toBe('currentColor');
    await fav.trigger('click');
    expect(h.player.toggleFavorite).toHaveBeenCalledWith(h.track.path);

    h.player.isFavorite.mockReturnValue(false);
    const off = mountBar();
    expect(
      off.find('button[aria-label="Add to favorites"]').attributes('disabled')
    ).toBeUndefined();
  });

  it('disables favorites without a current track and prefers the pending stream', () => {
    h.player.currentTrack = null;
    h.player.streamPending = { ...h.track, path: 'C:/pending.mp3' };
    const w = mountBar();

    const fav = w.find('button[aria-label="Add to favorites"]');
    expect(fav.attributes('disabled')).toBe('');
    expect(w.find('[data-testid="player-bar"]').exists()).toBe(true);

    h.player.streamPending = null;
  });

  it('shows the correct volume icon for muted, low and normal levels', () => {
    h.player.isMuted = true;
    expect(mountBar().findComponent(VolumeX).exists()).toBe(true);
    h.player.isMuted = false;

    h.player.volume = 0;
    expect(mountBar().findComponent(VolumeX).exists()).toBe(true);

    h.player.volume = 0.4;
    expect(mountBar().findComponent(Volume1).exists()).toBe(true);

    h.player.volume = 0.8;
    expect(mountBar().findComponent(Volume2).exists()).toBe(true);
    h.player.volume = 0.4;
  });

  it('treats only radio streams without a duration as live', () => {
    h.player.currentTrack = { ...h.track, id: 'radio:one', type: 'stream', duration: 60 };
    expect(mountBar().find('[aria-label="Playback position"]').exists()).toBe(true);

    h.player.currentTrack = { ...h.track, id: 'yt:one', type: 'stream', duration: 0 };
    expect(mountBar().find('[aria-label="Playback position"]').exists()).toBe(true);

    h.player.currentTrack = h.track;
  });

  it('clips the cover for known plugin shapes and ignores unknown ones', () => {
    h.plugins.decorations.cover = 'circle';
    expect(mountBar().find('[style*="clip-path"]').exists()).toBe(true);

    h.plugins.decorations.cover = 'weird';
    expect(mountBar().find('[style*="clip-path"]').exists()).toBe(false);
    h.plugins.decorations.cover = 'none';
  });

  it('reports zero progress when the duration is unknown', () => {
    h.audio.duration.value = 0;
    const w = mountBar();
    const widths = w.findAll('[style*="width"]').map((el) => el.attributes('style'));
    expect(widths.some((style) => style?.includes('width: 0%'))).toBe(true);
    expect(w.text()).toContain('0:00');
    h.audio.duration.value = 120;
  });
});
