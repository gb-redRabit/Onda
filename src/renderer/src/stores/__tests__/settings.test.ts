import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '../settings';
import { AUDIO_LAYOUT_PRESETS, DEFAULT_APPEARANCE } from '@renderer/utils/constants';
import type { AudioLayoutPreset } from '@renderer/types/settings';

const PRESETS: AudioLayoutPreset[] = ['compact', 'stacked', 'split', 'full', 'immersive'];

function factoryOf(preset: AudioLayoutPreset) {
  return (AUDIO_LAYOUT_PRESETS[preset]?.elements ?? AUDIO_LAYOUT_PRESETS.full.elements).map(
    (el) => ({
      ...el
    })
  );
}

function layoutKey(
  elements: { id: string; x: number; y: number; width: number; height: number }[]
) {
  return elements.map((el) => `${el.id}:${el.x}:${el.y}:${el.width}:${el.height}`).join('|');
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('applyAudioLayoutPreset', () => {
  it('switches between distinct preset layouts when never customized', () => {
    const store = useSettingsStore();
    const seen = new Set<string>();
    for (const preset of PRESETS) {
      store.applyAudioLayoutPreset(preset);
      const els = store.appearance.audioLayout.elements;
      expect(els).toEqual(factoryOf(preset));
      seen.add(layoutKey(els));
    }
    expect(seen.size).toBe(PRESETS.length);
  });

  it('preserves a real customization when leaving and coming back', () => {
    const store = useSettingsStore();
    store.applyAudioLayoutPreset('compact');
    const moved = store.appearance.audioLayout.elements.map((el) =>
      el.id === 'cover' ? { ...el, x: 12, y: 34 } : el
    );
    store.updateAudioLayoutElements(moved);
    store.applyAudioLayoutPreset('stacked');
    store.applyAudioLayoutPreset('compact');
    const cover = store.appearance.audioLayout.elements.find((el) => el.id === 'cover');
    expect(cover?.x).toBe(12);
    expect(cover?.y).toBe(34);
  });

  it('prunes stale stock snapshots that made every preset look the same', () => {
    const store = useSettingsStore();
    const stale: Record<string, ReturnType<typeof factoryOf>> = {};
    for (const preset of PRESETS) stale[preset] = factoryOf('full');
    store.updateAppearance({
      audioLayout: {
        ...DEFAULT_APPEARANCE.audioLayout,
        preset: 'full',
        elements: factoryOf('full'),
        customLayouts: stale
      }
    });

    const seen = new Set<string>();
    for (const preset of PRESETS) {
      store.applyAudioLayoutPreset(preset);
      const { elements, customLayouts } = store.appearance.audioLayout;
      expect(elements).toEqual(factoryOf(preset));
      seen.add(layoutKey(elements));
      for (const key of PRESETS) {
        if (customLayouts?.[key] !== undefined) {
          expect(customLayouts?.[key]).not.toEqual(factoryOf('full'));
        }
      }
    }
    expect(seen.size).toBe(PRESETS.length);
  });
});

describe('resetAudioLayoutPreset', () => {
  it('restores the current preset factory layout when it was never customized', () => {
    const store = useSettingsStore();
    for (const preset of PRESETS) {
      store.applyAudioLayoutPreset(preset);
      store.resetAudioLayoutPreset();
      expect(store.appearance.audioLayout.elements).toEqual(factoryOf(preset));
      expect(store.appearance.audioLayout.customLayouts?.[preset]).toBeUndefined();
    }
  });

  it('reverts drag edits back to the preset standard', () => {
    const store = useSettingsStore();
    const moved = store.appearance.audioLayout.elements.map((el) =>
      el.id === 'cover' ? { ...el, x: 40, y: 40 } : el
    );
    store.updateAudioLayoutElements(moved);
    store.resetAudioLayoutPreset();
    const cover = store.appearance.audioLayout.elements.find((el) => el.id === 'cover');
    const factoryCover = factoryOf('full').find((el) => el.id === 'cover');
    expect(cover?.x).toBe(factoryCover?.x);
    expect(cover?.y).toBe(factoryCover?.y);
  });

  it('discards the preset customization and restores its own standard', () => {
    const store = useSettingsStore();
    store.applyAudioLayoutPreset('compact');
    const moved = store.appearance.audioLayout.elements.map((el) =>
      el.id === 'controls' ? { ...el, y: 65 } : el
    );
    store.updateAudioLayoutElements(moved);
    store.applyAudioLayoutPreset('stacked');
    store.applyAudioLayoutPreset('compact');
    expect(store.appearance.audioLayout.elements.find((el) => el.id === 'controls')?.y).toBe(65);

    store.resetAudioLayoutPreset();
    const controls = store.appearance.audioLayout.elements.find((el) => el.id === 'controls');
    expect(controls?.y).toBe(factoryOf('compact').find((el) => el.id === 'controls')?.y);
    expect(store.appearance.audioLayout.customLayouts?.['compact']).toBeUndefined();
  });
});
