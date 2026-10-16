import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';

// Testy montujące Equalizera (możliwe dzięki @vue/test-utils). Store'y audio/UI są
// mockowane — testujemy zachowanie komponentu (commit/preset/usuwanie/import), nie WebAudio.

const h = vi.hoisted(() => ({
  fx: {
    equalizerEnabled: true,
    equalizerPreamp: 0,
    equalizerMono: false,
    equalizerMulticolor: false,
    equalizerSnap: false,
    equalizerPreset: 'custom',
    equalizerUserPresets: {} as Record<
      string,
      Array<{ type: string; frequency: number; q: number; gain: number }>
    >,
    equalizerVisible: true,
    nightMode: false,
    audioDelayMs: 0,
    equalizerBands: [{ type: 'peaking', frequency: 1000, q: 1, gain: 0 }]
  },
  audio: {
    applyEqBands: vi.fn(),
    applyEqGraph: vi.fn(),
    setEqUserPresets: vi.fn(),
    setEqEnabled: vi.fn(),
    setEqPreamp: vi.fn(),
    setEqMono: vi.fn(),
    setEqMulticolor: vi.fn(),
    setEqSnap: vi.fn(),
    setAudioDelay: vi.fn(),
    setNightMode: vi.fn(),
    getAnalyserNode: vi.fn(() => null),
    getAudioContext: vi.fn(() => null)
  },
  player: { isPlaying: false, nightMode: false },
  ui: { notify: vi.fn() },
  showConfirm: vi.fn(async () => true)
}));

vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => h.fx }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => h.ui }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => h.audio }));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => ({
    showConfirm: h.showConfirm,
    promptVisible: { value: false },
    promptIsConfirm: { value: false },
    promptMessage: { value: '' },
    promptValue: { value: '' }
  })
}));

import Equalizer from '../Equalizer.vue';
import en from '../../../locales/en';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });

function mountEq() {
  return mount(Equalizer, {
    global: { plugins: [i18n], stubs: { ExplorerPromptDialog: true } }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.fx.equalizerBands = [{ type: 'peaking', frequency: 1000, q: 1, gain: 0 }];
  h.fx.equalizerUserPresets = {};
  h.fx.equalizerPreset = 'custom';
  h.fx.equalizerEnabled = true;
  h.fx.equalizerPreamp = 0;
});

describe('Equalizer — render', () => {
  it('renders the panel with built-in presets', () => {
    const w = mountEq();
    expect(w.find('[data-testid="equalizer"]').exists()).toBe(true);
    expect(w.find('[data-testid="eq-preset-flat"]').exists()).toBe(true);
    expect(w.find('[data-testid="eq-preset-pop"]').exists()).toBe(true);
    w.unmount();
  });
});

describe('Equalizer — interaction', () => {
  it('toggles power through the audio bridge', async () => {
    const w = mountEq();
    await w.find('[data-testid="eq-power"]').trigger('click');
    expect(h.audio.setEqEnabled).toHaveBeenCalledWith(false);
    w.unmount();
  });

  it('adds a band and commits it as a custom preset', async () => {
    const w = mountEq();
    await w.find('[data-testid="eq-add-band"]').trigger('click');
    expect(h.audio.applyEqBands).toHaveBeenCalledTimes(1);
    const committed = h.audio.applyEqBands.mock.calls[0][0] as unknown[];
    expect(committed).toHaveLength(2);
    expect(h.fx.equalizerPreset).toBe('custom');
    w.unmount();
  });

  it('commits a built-in preset on click', async () => {
    const w = mountEq();
    await w.find('[data-testid="eq-preset-flat"]').trigger('click');
    expect(h.audio.applyEqBands).toHaveBeenCalledTimes(1);
    expect(h.fx.equalizerPreset).toBe('flat');
    w.unmount();
  });

  it('applies the preamp through the audio bridge', async () => {
    const w = mountEq();
    const preamp = w.find('[data-testid="eq-preamp"]');
    await preamp.setValue('5');
    expect(h.audio.setEqPreamp).toHaveBeenCalledWith(5);
    w.unmount();
  });
});

describe('Equalizer — user presets', () => {
  it('confirms before deleting and then removes the preset', async () => {
    h.fx.equalizerUserPresets = {
      Mine: [{ type: 'peaking', frequency: 1000, q: 1, gain: 3 }]
    };
    const w = mountEq();
    const btn = w.find('[data-testid="eq-user-preset-Mine"]');
    expect(btn.exists()).toBe(true);

    await btn.trigger('contextmenu');
    await flushPromises();

    expect(h.showConfirm).toHaveBeenCalledTimes(1);
    expect(h.audio.setEqUserPresets).toHaveBeenCalledTimes(1);
    const next = h.audio.setEqUserPresets.mock.calls[0][0] as Record<string, unknown>;
    expect(next).not.toHaveProperty('Mine');
    w.unmount();
  });

  it('does not delete when the confirmation is declined', async () => {
    h.fx.equalizerUserPresets = {
      Mine: [{ type: 'peaking', frequency: 1000, q: 1, gain: 3 }]
    };
    h.showConfirm.mockResolvedValueOnce(false);
    const w = mountEq();
    await w.find('[data-testid="eq-user-preset-Mine"]').trigger('contextmenu');
    await flushPromises();
    expect(h.audio.setEqUserPresets).not.toHaveBeenCalled();
    w.unmount();
  });
});

describe('Equalizer — import', () => {
  it('reads, sanitizes and applies an imported curve', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn(async () =>
          JSON.stringify({ bands: [{ type: 'peaking', frequency: 500, q: 1, gain: 4 }], preamp: 2 })
        ),
        writeText: vi.fn(async () => undefined)
      }
    });
    const w = mountEq();
    await w.find('[data-testid="eq-import"]').trigger('click');
    await flushPromises();
    expect(h.audio.applyEqBands).toHaveBeenCalledTimes(1);
    expect(h.audio.setEqPreamp).toHaveBeenCalledWith(2);
    w.unmount();
  });
});
