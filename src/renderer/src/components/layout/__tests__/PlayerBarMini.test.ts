import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const h = vi.hoisted(() => ({
  player: null as any,
  audio: null as any
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => h.audio }));
vi.mock('@renderer/utils/formatters', () => ({
  formatDuration: (seconds: number) => `${seconds}s`
}));

const CoverStub = defineComponent({
  name: 'MediaCover',
  props: {
    path: { type: String },
    size: { type: Number },
    autoplay: { type: Boolean },
    fallback: { type: String }
  },
  template: '<div data-testid="cover" />'
});
const InfoStub = defineComponent({
  name: 'TrackInfo',
  props: {
    track: { type: Object },
    titleSize: { type: String },
    showArtist: { type: Boolean },
    showFallback: { type: Boolean }
  },
  template: '<div data-testid="track-info" />'
});

import PlayerBarMini from '../PlayerBarMini.vue';

function mountBar(over: Record<string, unknown> = {}) {
  return mount(PlayerBarMini, {
    props: {
      displayTrack: { path: '/a.mp3', name: 'A' } as never,
      progressPct: 40,
      bufferedPct: 60,
      isLive: false,
      pinned: false,
      ...over
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { MediaCover: CoverStub, TrackInfo: InfoStub }
    }
  });
}

beforeEach(() => {
  h.player = { prevTrack: vi.fn(), nextTrack: vi.fn() };
  h.audio = {
    isPlaying: ref(false),
    duration: ref(120),
    currentTime: ref(42)
  };
});

describe('PlayerBarMini', () => {
  it('renders the slider and timing in normal mode', () => {
    const wrapper = mountBar();
    const slider = wrapper.get('[role="slider"]');

    expect(slider.attributes('aria-valuemax')).toBe('120');
    expect(slider.attributes('aria-valuenow')).toBe('42');
    expect(wrapper.text()).toContain('42s');
    expect(wrapper.text()).not.toContain('player.live');
    expect(wrapper.get('[data-testid="player-bar"]').attributes('data-playing')).toBe('false');
  });

  it('shows the live badge and hides the slider', () => {
    const wrapper = mountBar({ isLive: true });

    expect(wrapper.find('[role="slider"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('player.live');
  });

  it('forwards seek clicks and keyboard steps', async () => {
    const wrapper = mountBar();
    const slider = wrapper.get('[role="slider"]');

    await slider.trigger('click');
    await slider.trigger('keydown', { key: 'ArrowLeft' });
    await slider.trigger('keydown', { key: 'ArrowRight' });
    await slider.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
    await slider.trigger('keydown', { key: 'ArrowUp' });

    expect(wrapper.emitted('seek')).toHaveLength(1);
    expect(wrapper.emitted('seek-by')).toEqual([[-5], [5], [30]]);
  });

  it('switches the play button icon and label', async () => {
    h.audio.isPlaying.value = true;
    const wrapper = mountBar();
    const button = wrapper.get('[aria-label="common.pause"]');

    await button.trigger('click');

    expect(wrapper.emitted('toggle-play')).toEqual([[]]);
    expect(wrapper.get('[data-testid="player-bar"]').attributes('data-playing')).toBe('true');
  });

  it('seeks previous and next through the store', async () => {
    const wrapper = mountBar();

    await wrapper.get('[aria-label="common.previous"]').trigger('click');
    await wrapper.get('[aria-label="common.next"]').trigger('click');

    expect(h.player.prevTrack).toHaveBeenCalledTimes(1);
    expect(h.player.nextTrack).toHaveBeenCalledTimes(1);
  });

  it('toggles the pin state', async () => {
    const wrapper = mountBar({ pinned: true });
    const pin = wrapper.get('[data-testid="mini-always-on-top"]');

    expect(pin.attributes('aria-pressed')).toBe('true');
    expect(pin.classes()).toContain('text-primary-text');

    await pin.trigger('click');
    expect(wrapper.emitted('toggle-pin')).toEqual([[]]);
  });

  it('shows the unpinned pin styling', () => {
    const pin = mountBar().get('[data-testid="mini-always-on-top"]');

    expect(pin.attributes('aria-pressed')).toBe('false');
    expect(pin.classes()).toContain('text-base-content/50');
  });

  it('emits audio-view and expand actions', async () => {
    const wrapper = mountBar();

    await wrapper.get('[aria-label="common.audioView"]').trigger('click');
    await wrapper.get('[aria-label="common.miniPlayer"]').trigger('click');

    expect(wrapper.emitted('audio-view')).toEqual([[]]);
    expect(wrapper.emitted('expand')).toEqual([[]]);
  });

  it('passes the display track and clip path through', () => {
    const wrapper = mountBar({ coverClip: 'inset(0 0 0 0)' });

    expect(wrapper.getComponent(CoverStub).props('path')).toBe('/a.mp3');
    expect(wrapper.getComponent(InfoStub).props('track')).toEqual(
      expect.objectContaining({ path: '/a.mp3' })
    );
    const clipped = wrapper
      .findAll('div')
      .some((d) => d.attributes('style')?.includes('clip-path'));
    expect(clipped).toBe(true);
  });
});
