import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  player: null as any,
  isFavorite: vi.fn(() => false),
  toggleFavorite: vi.fn(),
  t: vi.fn((key: string) => key),
  roCallback: null as ((entries: Array<{ contentRect: { height: number } }>) => void) | null,
  disconnect: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));

import TrackInfo from '../TrackInfo.vue';

let wrapper: VueWrapper | null = null;

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a',
    path: 'D:/music/a.mp3',
    name: 'a.mp3',
    type: 'audio',
    metadata: { title: 'Song', artist: 'Artist', album: 'Album' },
    ...overrides
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  if (wrapper) {
    wrapper.unmount();
    wrapper = null;
  }
  wrapper = mount(TrackInfo, {
    props: { track: track(), ...props },
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

beforeEach(() => {
  h.isFavorite.mockReset();
  h.isFavorite.mockReturnValue(false);
  h.toggleFavorite.mockReset();
  h.player = reactive({ isFavorite: h.isFavorite, toggleFavorite: h.toggleFavorite });
  h.roCallback = null;
  h.disconnect.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: typeof h.roCallback) {
        h.roCallback = callback as never;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect = h.disconnect;
    }
  );
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('inline variant', () => {
  it('shows metadata title and artist', () => {
    setup();

    expect(wrapper!.text()).toContain('Song');
    expect(wrapper!.text()).toContain('Artist');
    expect(wrapper!.text()).not.toContain('Album');
  });

  it('falls back to name, album and unknown labels', () => {
    setup({ track: track({ metadata: { album: 'Album' } }) });
    expect(wrapper!.text()).toContain('a.mp3');
    expect(wrapper!.text()).toContain('Album');
    expect(wrapper!.text()).not.toContain('common.unknown');

    setup({ track: track({ metadata: {} }) });
    expect(wrapper!.text()).toContain('common.unknown');
  });

  it('respects fallback and artist flags', () => {
    setup({ track: null });
    expect(wrapper!.text()).toContain('playerBar.noTrack');
    expect(wrapper!.text()).toContain('common.unknown');

    setup({ track: null, showFallback: false });
    expect(wrapper!.text()).not.toContain('playerBar.noTrack');

    setup({ showArtist: false });
    expect(wrapper!.text()).not.toContain('Artist');
  });

  it('appends the album when enabled and applies custom classes', () => {
    setup({
      showAlbum: true,
      titleSize: 'text-3xl',
      artistSize: 'text-2xl',
      titleClass: 't',
      artistClass: 'a'
    });

    expect(wrapper!.text()).toContain('Album');
    expect(wrapper!.html()).toContain('text-3xl');
    expect(wrapper!.html()).toContain('text-2xl');
    expect(wrapper!.html()).toContain(' t');
  });
});

describe('audio variant density', () => {
  it('uses roomy classes by default', () => {
    setup({ variant: 'audio' });

    expect(wrapper!.html()).toContain('gap-1');
    expect(wrapper!.html()).toContain('text-lg');
    expect(wrapper!.text()).toContain('Song');
  });

  it('uses large and minimal class scales', () => {
    setup({ variant: 'audio', audioVariant: 'large' });
    expect(wrapper!.html()).toContain('text-2xl');

    setup({ variant: 'audio', audioVariant: 'minimal' });
    expect(wrapper!.html()).toContain('text-sm');
    expect(wrapper!.text()).not.toContain('Artist');
  });

  it('honours explicit size overrides', () => {
    setup({ variant: 'audio', titleSize: 'text-4xl', artistSize: 'text-xl' });

    expect(wrapper!.html()).toContain('text-4xl');
    expect(wrapper!.html()).toContain('text-xl');
  });

  it('adapts to observed height', async () => {
    setup({ variant: 'audio' });
    expect(h.roCallback).toBeTypeOf('function');

    h.roCallback!([{ contentRect: { height: 20 } }]);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.html()).toContain('text-sm');
    expect(wrapper!.text()).not.toContain('Artist');

    h.roCallback!([{ contentRect: { height: 35 } }]);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.html()).toContain('text-base');
    expect(wrapper!.html()).toContain('gap-0.5');

    h.roCallback!([{ contentRect: { height: 50 } }]);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.html()).toContain('gap-1');
  });

  it('does not observe non-audio variants', () => {
    setup();
    expect(h.roCallback).toBeNull();
  });

  it('disconnects the observer on unmount', () => {
    setup({ variant: 'audio' });
    wrapper!.unmount();
    wrapper = null;
    expect(h.disconnect).toHaveBeenCalled();
  });
});

describe('audio variant album and favourite', () => {
  it('appends the album to the artist line', () => {
    setup({ variant: 'audio' });
    expect(wrapper!.text()).toContain('Album');
  });

  it('shows the favourite button only in roomy non-minimal/non-large audio', async () => {
    h.isFavorite.mockReturnValue(true);
    setup({ variant: 'audio', showFavorite: true });

    const button = wrapper!.get('button');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.attributes('aria-label')).toBe('common.removeFav');
    expect(button.classes()).toContain('text-error');
    await button.trigger('click');
    expect(h.toggleFavorite).toHaveBeenCalledWith('D:/music/a.mp3');

    h.roCallback!([{ contentRect: { height: 20 } }]);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('button').exists()).toBe(false);
  });

  it('hides the favourite button for large and minimal variants', () => {
    setup({ variant: 'audio', showFavorite: true, audioVariant: 'large' });
    expect(wrapper!.find('button').exists()).toBe(false);

    setup({ variant: 'audio', showFavorite: true, audioVariant: 'minimal' });
    expect(wrapper!.find('button').exists()).toBe(false);
  });

  it('disables the favourite button without a track', () => {
    setup({ variant: 'audio', showFavorite: true, track: null });
    expect(wrapper!.get('button').attributes('disabled')).toBeDefined();
  });
});

describe('marquee overflow', () => {
  it('adds marquee classes and offsets for overflowing text', async () => {
    setup({ variant: 'audio' });
    const title = wrapper!.get('p');
    Object.defineProperty(title.element, 'scrollWidth', { configurable: true, value: 300 });
    Object.defineProperty(title.element, 'clientWidth', { configurable: true, value: 100 });

    await wrapper!.setProps({
      track: track({ id: 'b', metadata: { title: 'A long title', artist: 'Artist' } })
    });
    await wrapper!.vm.$nextTick();
    await wrapper!.vm.$nextTick();

    expect(title.classes()).toContain('animate-marquee');
    expect((title.element as HTMLElement).style.getPropertyValue('--marquee-offset')).toBe(
      '-200px'
    );

    const artist = wrapper!.findAll('p')[1];
    Object.defineProperty(artist.element, 'scrollWidth', { configurable: true, value: 280 });
    Object.defineProperty(artist.element, 'clientWidth', { configurable: true, value: 80 });
    await wrapper!.setProps({
      track: track({ id: 'c', metadata: { title: 'Long', artist: 'Artist' } })
    });
    await wrapper!.vm.$nextTick();
    await wrapper!.vm.$nextTick();
    expect(artist.classes()).toContain('animate-marquee');
    expect((artist.element as HTMLElement).style.getPropertyValue('--marquee-offset')).toBe(
      '-200px'
    );
  });

  it('keeps truncation when the title fits', async () => {
    setup({ variant: 'audio' });
    const title = wrapper!.get('p');
    Object.defineProperty(title.element, 'scrollWidth', { configurable: true, value: 50 });
    Object.defineProperty(title.element, 'clientWidth', { configurable: true, value: 100 });

    await wrapper!.setProps({ track: track({ id: 'b' }) });
    await wrapper!.vm.$nextTick();
    await wrapper!.vm.$nextTick();

    expect(title.classes()).toContain('truncate');
  });
});
