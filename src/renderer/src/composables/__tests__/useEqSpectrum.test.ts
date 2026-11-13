import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, nextTick, ref, type Ref } from 'vue';

const mocks = vi.hoisted(() => ({
  rafCallback: null as ((time: number) => void) | null,
  raf: null as any
}));

vi.mock('@renderer/utils/eqGeometry', () => ({
  EQ_CURVE: { width: 100, height: 50 },
  SPECTRUM_BARS: 3
}));

import { useEqSpectrum } from '../useEqSpectrum';

let wrapper: VueWrapper | null = null;
let playing: Ref<boolean>;
let analyser: { frequencyBinCount: number; getByteFrequencyData: ReturnType<typeof vi.fn> } | null;
let sampleRate: number;
let cancelled: ReturnType<typeof vi.fn>;

function mountSpectrum() {
  const Host = defineComponent({
    setup() {
      const { spectrumPath } = useEqSpectrum({
        isPlaying: () => playing.value,
        getAnalyser: () => analyser as never,
        getSampleRate: () => sampleRate
      });
      return { spectrumPath };
    },
    template: '<div data-testid="path">{{ spectrumPath }}</div>'
  });
  wrapper = mount(Host);
  return wrapper;
}

function runTick() {
  mocks.rafCallback!(16);
}

function path() {
  return wrapper!.get('[data-testid="path"]').text();
}

beforeEach(() => {
  playing = ref(true);
  sampleRate = 48000;
  cancelled = vi.fn();
  analyser = {
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn((buffer: Uint8Array) => buffer.fill(255))
  };
  mocks.rafCallback = null;
  mocks.raf = vi.fn((cb: (time: number) => void) => {
    mocks.rafCallback = cb;
    return 7;
  });
  vi.stubGlobal('requestAnimationFrame', mocks.raf);
  vi.stubGlobal('cancelAnimationFrame', cancelled);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('spectrum path', () => {
  it('is empty before the first frame', () => {
    mountSpectrum();

    expect(path()).toBe('');
  });

  it('skips drawing while paused', () => {
    playing.value = false;
    mountSpectrum();

    runTick();

    expect(path()).toBe('');
    expect(analyser!.getByteFrequencyData).not.toHaveBeenCalled();
  });

  it('skips drawing without an analyser', () => {
    analyser = null;
    mountSpectrum();

    runTick();

    expect(path()).toBe('');
  });

  it('builds the SVG path from analyser buckets', async () => {
    mountSpectrum();

    runTick();
    await nextTick();

    expect(analyser!.getByteFrequencyData).toHaveBeenCalledTimes(1);
    expect(path()).toBe('M 0,50 L 0.0,0.0 L 50.0,0.0 L 100.0,0.0 L 100,50 Z');
  });

  it('reuses the sample buffer and falls back to 48 kHz', async () => {
    sampleRate = 0;
    analyser!.getByteFrequencyData.mockImplementation((buffer: Uint8Array) => buffer.fill(0));
    mountSpectrum();

    runTick();
    await nextTick();
    runTick();
    await nextTick();

    const [first, second] = analyser!.getByteFrequencyData.mock.calls;
    expect(second[0]).toBe(first[0]);
    expect(path()).toBe('M 0,50 L 0.0,50.0 L 50.0,50.0 L 100.0,50.0 L 100,50 Z');
  });

  it('schedules the next frame each tick', () => {
    mountSpectrum();
    expect(mocks.raf).toHaveBeenCalledTimes(1);

    runTick();

    expect(mocks.raf).toHaveBeenCalledTimes(2);
  });

  it('cancels the animation frame on unmount', () => {
    mountSpectrum();

    wrapper!.unmount();
    wrapper = null;

    expect(cancelled).toHaveBeenCalledWith(7);
  });
});
