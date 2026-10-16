import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAudioFxStore } from '../audioFx';
import { DEFAULT_EQ_BANDS } from '@renderer/utils/constants/audio';

// Stan efektów audio wydzielony ze store `player` — tu jest jedyne źródło prawdy
// dla EQ / trybu nocnego / opóźnienia dźwięku.
describe('useAudioFxStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts with sane defaults', () => {
    const fx = useAudioFxStore();
    expect(fx.equalizerVisible).toBe(false);
    expect(fx.equalizerEnabled).toBe(true);
    expect(fx.equalizerPreamp).toBe(0);
    expect(fx.nightMode).toBe(false);
    expect(fx.audioDelayMs).toBe(0);
    expect(fx.equalizerPreset).toBe('flat');
    expect(fx.equalizerBands.length).toBe(DEFAULT_EQ_BANDS.length);
    // Kopia, nie referencja do stałej globalnej — mutacja pasm nie zanieczyszcza defaultów.
    expect(fx.equalizerBands).not.toBe(DEFAULT_EQ_BANDS);
  });

  it('toggleEqualizer flips equalizerVisible', () => {
    const fx = useAudioFxStore();
    fx.toggleEqualizer();
    expect(fx.equalizerVisible).toBe(true);
    fx.toggleEqualizer();
    expect(fx.equalizerVisible).toBe(false);
  });
});
