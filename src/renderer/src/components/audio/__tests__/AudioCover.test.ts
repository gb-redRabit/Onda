import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, nextTick, reactive, ref } from 'vue';
import AudioCover from '../AudioCover.vue';

const state = vi.hoisted(() => ({
  player: null as any,
  audio: null as any,
  raf: [] as Array<(time: number) => void>,
  rafId: 0,
  cancel: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => state.audio }));

const MediaCoverStub = defineComponent({
  name: 'MediaCoverStub',
  props: {
    path: String,
    size: Number,
    autoplay: Boolean,
    fallback: String
  },
  template: '<div data-testid="media-cover" />'
});

let wrapper: VueWrapper | null = null;

function mountCover(props: Record<string, unknown> = {}) {
  wrapper = mount(AudioCover, {
    props: props as never,
    global: { stubs: { MediaCover: MediaCoverStub } }
  });
  return wrapper;
}

function cover() {
  return wrapper!.getComponent(MediaCoverStub);
}

beforeEach(() => {
  state.player = reactive({ currentTrack: null as any });
  state.audio = {
    isPlaying: ref(false),
    getAnalyserNode: vi.fn(() => null)
  };
  state.raf = [];
  state.rafId = 0;
  state.cancel.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    state.raf.push(callback);
    return ++state.rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', state.cancel);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('variants', () => {
  it('renders the ring variant', () => {
    mountCover({ variant: 'ring', size: 'w-32 h-32' });
    const root = wrapper!.get('.relative');

    expect(root.classes()).toContain('w-32');
    expect(root.classes()).not.toContain('rounded-box');
    expect(wrapper!.find('.rounded-full').exists()).toBe(true);
    expect(cover().props()).toMatchObject({ size: 48, fallback: 'music' });
    expect(cover().props('path')).toBeUndefined();
  });

  it('renders the rounded variant with an inset frame', () => {
    mountCover({ variant: 'rounded', size: 'w-40 h-40' });
    const root = wrapper!.get('.relative');

    expect(root.classes()).toContain('rounded-box');
    expect(root.classes()).toContain('border');
    expect(wrapper!.find('.p-1\\.5').exists()).toBe(true);
    expect(wrapper!.find('.ring-1').exists()).toBe(true);
  });

  it('renders the glass variant with a blur overlay', () => {
    mountCover({ variant: 'glass' });
    const glass = wrapper!.get('.opacity-85');

    expect(glass.classes()).toContain('blur-[1px]');
    expect(wrapper!.html()).toContain('backdrop-blur-[3px]');
  });

  it('renders the default variant', () => {
    mountCover();
    expect(wrapper!.get('.rounded-box').classes()).toContain('bg-neutral');
    expect(wrapper!.html()).not.toContain('backdrop-blur-[3px]');
    expect(wrapper!.findComponent(MediaCoverStub).exists()).toBe(true);
  });

  it('uses the default size when none is given', () => {
    mountCover();
    expect(wrapper!.get('.relative').classes()).toContain('w-96');
  });

  it('passes the current track to the cover', () => {
    state.player.currentTrack = { path: 'D:/media/a.mp3' };
    mountCover({ variant: 'ring' });

    expect(cover().props()).toMatchObject({
      path: 'D:/media/a.mp3',
      size: 48,
      autoplay: true,
      fallback: 'music'
    });
  });
});

describe('decorations', () => {
  it('maps plugin decorations to clip paths', () => {
    mountCover({ decoration: 'plugin:cover:triangle' });
    const style = wrapper!.get('.relative').attributes('style') ?? '';
    expect(style).toContain('clip-path');
    expect(style).toContain('polygon(50% 0%, 0% 100%, 100% 100%)');
  });

  it('ignores unknown decorations', () => {
    mountCover({ decoration: 'plugin:cover:unknown' });
    expect(wrapper!.get('.relative').attributes('style') ?? '').not.toContain('clip-path');
  });

  it('ignores decorations without a value', () => {
    mountCover();
    expect(wrapper!.get('.relative').attributes('style') ?? '').not.toContain('clip-path');
  });

  it('never clips the ring variant', () => {
    mountCover({ variant: 'ring', decoration: 'plugin:cover:circle' });
    expect(wrapper!.get('.relative').attributes('style') ?? '').not.toContain('clip-path');
  });

  it('supports every host glyph', () => {
    const decorations = [
      'plugin:cover:circle',
      'plugin:cover:diamond',
      'plugin:cover:hexagon',
      'plugin:cover:flip-x'
    ];
    for (const decoration of decorations) {
      wrapper?.unmount();
      mountCover({ decoration });
      expect(wrapper!.get('.relative').attributes('style') ?? '').toContain('clip-path');
    }
  });
});

describe('pulse animation', () => {
  it('does not animate while paused', () => {
    mountCover();
    expect(state.raf).toHaveLength(0);
  });

  it('starts when playback begins', async () => {
    mountCover();
    state.audio.isPlaying.value = true;
    await nextTick();

    expect(state.raf).toHaveLength(1);
  });

  it('keeps polling without an analyser or while paused', async () => {
    state.audio.isPlaying.value = true;
    mountCover();
    state.audio.getAnalyserNode.mockReturnValue(null);

    state.raf.shift()!(0);
    expect(state.raf).toHaveLength(1);
    expect(wrapper!.get('.relative').attributes('style') ?? '').toContain('scale(1)');
  });

  it('scales with bass energy from the analyser', async () => {
    state.audio.isPlaying.value = true;
    const analyser = {
      frequencyBinCount: 32,
      getByteFrequencyData: vi.fn((buffer: Uint8Array) => buffer.fill(255))
    };
    state.audio.getAnalyserNode.mockReturnValue(analyser);
    mountCover();

    state.raf.shift()!(0);
    await nextTick();

    expect(analyser.getByteFrequencyData).toHaveBeenCalled();
    expect(wrapper!.get('.relative').attributes('style')).toContain('scale(1.06)');
    expect(state.raf).toHaveLength(1);
  });

  it('handles analysers with fewer than ten bins', async () => {
    state.audio.isPlaying.value = true;
    state.audio.getAnalyserNode.mockReturnValue({
      frequencyBinCount: 4,
      getByteFrequencyData: vi.fn((buffer: Uint8Array) => buffer.fill(255))
    });
    mountCover();

    state.raf.shift()!(0);
    await nextTick();

    expect(wrapper!.get('.relative').attributes('style')).toContain('scale(1.06)');
  });

  it('stays at rest for silence', () => {
    state.audio.isPlaying.value = true;
    state.audio.getAnalyserNode.mockReturnValue({
      frequencyBinCount: 32,
      getByteFrequencyData: vi.fn((buffer: Uint8Array) => buffer.fill(0))
    });
    mountCover();

    state.raf.shift()!(0);

    expect(wrapper!.get('.relative').attributes('style')).toContain('scale(1)');
  });

  it('cancels and resets when playback stops', async () => {
    state.audio.isPlaying.value = true;
    mountCover();
    const first = state.raf.shift()!;
    state.audio.getAnalyserNode.mockReturnValue({
      frequencyBinCount: 32,
      getByteFrequencyData: vi.fn((buffer: Uint8Array) => buffer.fill(255))
    });
    first(0);
    await nextTick();
    expect(wrapper!.get('.relative').attributes('style')).toContain('scale(1.06)');

    state.audio.isPlaying.value = false;
    await nextTick();

    expect(state.cancel).toHaveBeenCalledWith(2);
    expect(wrapper!.get('.relative').attributes('style')).toContain('scale(1)');
  });

  it('cancels on unmount', () => {
    state.audio.isPlaying.value = true;
    mountCover();
    wrapper!.unmount();
    wrapper = null;

    expect(state.cancel).toHaveBeenCalledWith(1);
  });
});
