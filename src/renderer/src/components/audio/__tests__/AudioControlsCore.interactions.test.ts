import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  playing: null as any,
  play: vi.fn(),
  pause: vi.fn(),
  setVolume: vi.fn(),
  player: null as any,
  fx: null as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/composables/useAudioPlayer', async () => {
  const { ref } = await import('vue');
  h.playing = ref(false);
  return {
    useAudioPlayer: () => ({
      isPlaying: h.playing,
      play: h.play,
      pause: h.pause,
      setVolume: h.setVolume
    })
  };
});
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => h.fx }));

import AudioControlsCore from '../AudioControlsCore.vue';

const TransportStub = defineComponent({
  name: 'TransportButtons',
  props: ['variant', 'containerClass', 'styles', 'isPlaying', 'shuffle', 'repeat'],
  emits: ['play-pause', 'prev', 'next', 'toggle-shuffle', 'cycle-repeat'],
  template: '<div data-testid="transport" />'
});

let wrapper: VueWrapper | null = null;

function mountCore(overrides: Record<string, unknown> = {}) {
  wrapper = mount(AudioControlsCore, {
    props: {
      variant: 'wide',
      compact: false,
      widthSufficient: true,
      volumeFit: true,
      ...overrides
    },
    global: { stubs: { TransportButtons: TransportStub } }
  });
  return wrapper;
}

function slider() {
  return wrapper!.get('[role="slider"]');
}

function keydown(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
  return event;
}

beforeEach(() => {
  h.playing.value = false;
  h.play.mockClear();
  h.pause.mockClear();
  h.setVolume.mockClear();
  h.t.mockClear();
  h.player = {
    isMuted: false,
    volume: 0.5,
    shuffle: false,
    repeat: 'none',
    queueVisible: false,
    toggleMute: vi.fn(),
    toggleQueue: vi.fn(),
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn(),
    prevTrack: vi.fn(),
    nextTrack: vi.fn()
  };
  h.fx = { equalizerVisible: false, toggleEqualizer: vi.fn() };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('transport wiring', () => {
  it('forwards transport events to the player', () => {
    mountCore();
    const transport = wrapper!.findComponent(TransportStub);

    transport.vm.$emit('play-pause');
    transport.vm.$emit('prev');
    transport.vm.$emit('next');
    transport.vm.$emit('toggle-shuffle');
    transport.vm.$emit('cycle-repeat');

    expect(h.play).toHaveBeenCalledTimes(1);
    expect(h.player.prevTrack).toHaveBeenCalledTimes(1);
    expect(h.player.nextTrack).toHaveBeenCalledTimes(1);
    expect(h.player.toggleShuffle).toHaveBeenCalledTimes(1);
    expect(h.player.cycleRepeat).toHaveBeenCalledTimes(1);
  });

  it('pauses when already playing', () => {
    h.playing.value = true;
    mountCore();
    wrapper!.findComponent(TransportStub).vm.$emit('play-pause');

    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.play).not.toHaveBeenCalled();
  });

  it('uses the fallback play button when the transport is gated', async () => {
    mountCore({ variant: 'minimal', widthSufficient: false });
    expect(wrapper!.findComponent(TransportStub).exists()).toBe(false);

    await wrapper!.get('[aria-label="common.play"]').trigger('click');

    expect(h.play).toHaveBeenCalledTimes(1);
  });

  it('shows a pause fallback while playing without transport', () => {
    h.playing.value = true;
    mountCore({ variant: 'minimal', widthSufficient: false });

    expect(wrapper!.find('[aria-label="common.pause"]').exists()).toBe(true);
  });
});

describe('volume', () => {
  it('sets the volume from the click position and clamps it', () => {
    mountCore();
    const bar = slider();
    (bar.element as HTMLElement).getBoundingClientRect = () =>
      ({ left: 100, width: 200 }) as DOMRect;

    bar.element.dispatchEvent(new MouseEvent('click', { clientX: 250, bubbles: true }));
    expect(h.setVolume).toHaveBeenLastCalledWith(0.75);

    bar.element.dispatchEvent(new MouseEvent('click', { clientX: 50, bubbles: true }));
    expect(h.setVolume).toHaveBeenLastCalledWith(0);

    bar.element.dispatchEvent(new MouseEvent('click', { clientX: 400, bubbles: true }));
    expect(h.setVolume).toHaveBeenLastCalledWith(1);
  });

  it('steps, jumps and pages the volume from the keyboard', () => {
    mountCore();
    const bar = slider();

    for (const key of [
      'ArrowRight',
      'ArrowUp',
      'ArrowLeft',
      'ArrowDown',
      'Home',
      'End',
      'PageUp',
      'PageDown'
    ]) {
      bar.element.dispatchEvent(keydown(key));
    }

    expect(h.setVolume.mock.calls).toEqual([
      [0.55],
      [0.55],
      [0.45],
      [0.45],
      [0],
      [1],
      [0.6],
      [0.4]
    ]);
    expect(keydown('ArrowRight').defaultPrevented).toBe(false);
  });

  it('ignores unrelated keys', () => {
    mountCore();
    const event = keydown('Enter');

    slider().element.dispatchEvent(event);

    expect(h.setVolume).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('starts from zero when muted', () => {
    h.player.isMuted = true;
    mountCore();

    slider().element.dispatchEvent(keydown('ArrowRight'));

    expect(h.setVolume).toHaveBeenCalledWith(0.05);
  });

  it('shows mute state and toggles it', async () => {
    h.player.isMuted = true;
    h.player.volume = 0.8;
    mountCore();

    expect(wrapper!.find('[aria-label="player.unmute"]').exists()).toBe(true);
    expect(slider().attributes('aria-valuenow')).toBe('0');
    expect(slider().attributes('aria-valuetext')).toBe('player.muted');

    await wrapper!.get('[aria-label="player.unmute"]').trigger('click');
    expect(h.player.toggleMute).toHaveBeenCalledTimes(1);
  });
});

describe('extras', () => {
  it('toggles the equalizer and queue with pressed state', async () => {
    h.fx.equalizerVisible = true;
    h.player.queueVisible = true;
    mountCore();

    const eq = wrapper!.get('[data-eq-toggle]');
    const queue = wrapper!.get('[aria-label="common.queue"]');

    expect(eq.attributes('aria-pressed')).toBe('true');
    expect(queue.attributes('aria-pressed')).toBe('true');

    await eq.trigger('click');
    await queue.trigger('click');

    expect(h.fx.toggleEqualizer).toHaveBeenCalledTimes(1);
    expect(h.player.toggleQueue).toHaveBeenCalledTimes(1);
  });
});
