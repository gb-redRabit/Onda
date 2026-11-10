import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  audio: null as any,
  track: null as any,
  t: vi.fn((key: string) => key),
  roCallback: null as ((entries: Array<{ contentRect: { height: number } }>) => void) | null,
  disconnect: vi.fn()
}));

vi.mock('@renderer/composables/useAudioPlayer', async () => {
  const { ref: createRef } = await import('vue');
  h.audio = {
    currentTime: createRef(10),
    duration: createRef(100),
    buffered: createRef(0.4),
    seek: vi.fn()
  };
  return { useAudioPlayer: () => h.audio };
});
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => ({ currentTrack: h.track }) }));

const WaveformStub = defineComponent({
  name: 'WaveformLayer',
  props: ['path', 'duration', 'progress'],
  template: '<div data-testid="waveform" />'
});

import AudioProgressBar from '../AudioProgressBar.vue';

let wrapper: VueWrapper | null = null;

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 'x',
    type: 'audio',
    path: 'D:/a.mp3',
    name: 'a',
    duration: 100,
    ...overrides
  };
}

function setup(props: Record<string, unknown> = {}) {
  if (wrapper) {
    wrapper.unmount();
    wrapper = null;
  }
  wrapper = mount(AudioProgressBar, {
    props,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { WaveformLayer: WaveformStub }
    }
  });
  return wrapper;
}

function slider() {
  return wrapper!.get('[role="slider"]');
}

function keyEvent(key: string) {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}

beforeEach(() => {
  h.audio.currentTime.value = 10;
  h.audio.duration.value = 100;
  h.audio.buffered.value = 0.4;
  h.audio.seek.mockReset();
  h.track = reactive(track());
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
  vi.restoreAllMocks();
});

describe('live streams', () => {
  it('shows the live badge instead of a seek bar', () => {
    h.track = reactive(track({ id: 'radio:abc', type: 'stream', duration: undefined }));
    setup();

    expect(wrapper!.text()).toContain('player.live');
    expect(wrapper!.find('[role="slider"]').exists()).toBe(false);
  });
});

describe('rendering', () => {
  it('renders times, aria values and progress widths', () => {
    setup();

    const bar = slider();
    expect(wrapper!.text()).toContain('0:10');
    expect(wrapper!.text()).toContain('1:40');
    expect(bar.attributes('aria-valuenow')).toBe('10');
    expect(bar.attributes('aria-valuemax')).toBe('100');
    expect(bar.html()).toContain('width: 40%');
    expect(bar.html()).toContain('width: 10%');
  });

  it('hides the time labels for very short bars', async () => {
    setup();
    h.roCallback!([{ contentRect: { height: 10 } }]);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).not.toContain('0:10');

    h.roCallback!([{ contentRect: { height: 40 } }]);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('0:10');
  });

  it('disconnects the observer on unmount', () => {
    setup();
    wrapper!.unmount();
    wrapper = null;
    expect(h.disconnect).toHaveBeenCalled();
  });

  it('uses a compact time style for thin bars', () => {
    setup({ variant: 'thin' });
    expect(wrapper!.html()).toContain('text-2xs');
  });

  it('renders neon glow and avoids the bare track', () => {
    setup({ variant: 'neon' });
    expect(wrapper!.html()).toContain('bg-primary/40');
    expect(wrapper!.html()).toContain('bg-base-content/10');
  });

  it('omits the buffered layer for bare bars', () => {
    setup({ variant: 'bare' });
    expect(wrapper!.html()).not.toContain('bg-primary/50');
  });

  it('renders the waveform only for local audio tracks', async () => {
    setup({ waveform: true });
    expect(wrapper!.findComponent(WaveformStub).props()).toMatchObject({
      path: 'D:/a.mp3',
      duration: 100,
      progress: 0.1
    });

    h.track.id = 'radio:abc';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="waveform"]').exists()).toBe(false);
  });
});

describe('keyboard seeking', () => {
  it.each([
    ['ArrowRight', 15],
    ['ArrowUp', 15],
    ['ArrowLeft', 5],
    ['ArrowDown', 5],
    ['Home', 0],
    ['End', 100],
    ['PageUp', 40],
    ['PageDown', 0]
  ])('maps %s to the expected position', (key, expected) => {
    setup();
    const event = keyEvent(key);

    slider().element.dispatchEvent(event);

    expect(h.audio.seek).toHaveBeenCalledWith(expected);
    expect(event.defaultPrevented).toBe(true);
  });

  it('clamps keyboard seeks to the duration', () => {
    h.audio.currentTime.value = 98;
    setup();

    slider().element.dispatchEvent(keyEvent('ArrowRight'));
    expect(h.audio.seek).toHaveBeenLastCalledWith(100);

    h.audio.currentTime.value = 2;
    slider().element.dispatchEvent(keyEvent('PageDown'));
    expect(h.audio.seek).toHaveBeenLastCalledWith(0);
  });

  it('ignores keys when the duration is unknown', () => {
    h.audio.duration.value = 0;
    setup();
    const event = keyEvent('ArrowRight');

    slider().element.dispatchEvent(event);

    expect(h.audio.seek).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores unrelated keys', () => {
    setup();
    const event = keyEvent('Tab');

    slider().element.dispatchEvent(event);

    expect(h.audio.seek).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('pointer seeking', () => {
  it('seeks on drag and cleans up listeners', () => {
    setup();
    const bar = slider();
    vi.spyOn(bar.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 200
    } as DOMRect);
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');

    const down = new MouseEvent('mousedown', {
      clientX: 150,
      bubbles: true,
      cancelable: true
    });
    bar.element.dispatchEvent(down);

    expect(h.audio.seek).toHaveBeenLastCalledWith(25);

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
    expect(h.audio.seek).toHaveBeenLastCalledWith(100);

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }));
    expect(h.audio.seek).toHaveBeenLastCalledWith(0);

    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(add).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(add).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });
});
