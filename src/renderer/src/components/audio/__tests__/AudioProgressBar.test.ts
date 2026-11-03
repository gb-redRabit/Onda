import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

// Warianty paska postępu były martwe: widok zawsze przekazywał `waveform: true`,
// więc `classic`/`thin`/`neon` nigdy nie trafiały do klas. Test pilnuje, że każdy
// wariant faktycznie zmienia wygląd toru, a nowy `bare` nie rysuje tła.

vi.mock('@renderer/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    currentTime: ref(10),
    duration: ref(100),
    buffered: ref(0.4),
    seek: vi.fn()
  })
}));

vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({
    currentTrack: { id: 'x', type: 'audio', path: 'D:/a.mp3', name: 'a', duration: 100 }
  })
}));

vi.mock('../WaveformLayer.vue', () => ({
  default: { name: 'WaveformLayer', template: '<div data-test="waveform" />' }
}));

import AudioProgressBar from '../AudioProgressBar.vue';

beforeAll(() => {
  // jsdom nie ma ResizeObservera, a pasek mierzy nim wysokość (ukrywanie czasów).
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
});

const global = { mocks: { $t: (key: string) => key } };

function mountBar(variant: string) {
  return mount(AudioProgressBar, { props: { variant }, global });
}

function track(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('[role="slider"]');
}

describe('AudioProgressBar variants', () => {
  it('classic draws a track background', () => {
    const wrapper = mountBar('classic');
    expect(track(wrapper).classes()).toContain('bg-base-content/20');
  });

  it('thin uses the thinner track', () => {
    const wrapper = mountBar('thin');
    expect(track(wrapper).classes()).toContain('h-0.5');
  });

  it('neon uses the gradient fill and thicker track', () => {
    const wrapper = mountBar('neon');
    expect(track(wrapper).classes()).toContain('h-1.5');
    expect(wrapper.html()).toContain('bg-linear-to-r');
  });

  it('bare keeps the bar but removes the background', () => {
    const wrapper = mountBar('bare');
    expect(track(wrapper).classes()).not.toContain('bg-base-content/20');
    expect(track(wrapper).classes()).not.toContain('bg-base-content/15');
    expect(wrapper.html()).toContain('bg-primary');
  });

  it('waveform variant renders the waveform layer', () => {
    const wrapper = mountBar('waveform');
    expect(track(wrapper).classes()).toContain('h-9');
    expect(wrapper.find('[data-test="waveform"]').exists()).toBe(true);
  });
});
