import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, reactive } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any,
  qualityPreset: vi.fn((quality: string | undefined) => `preset:${quality ?? 'default'}`)
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/utils/audioVisualizer', () => ({ qualityPreset: h.qualityPreset }));

import { useVizConfig } from '../useVizConfig';

function mountViz() {
  let api: ReturnType<typeof useVizConfig> | null = null;
  const Host = defineComponent({
    setup() {
      api = useVizConfig();
      return () => null;
    }
  });
  const wrapper = mount(Host);
  return { wrapper, api: api! };
}

beforeEach(() => {
  h.qualityPreset.mockClear();
  h.settings = reactive({
    playback: {
      visualization: {}
    },
    appearance: { audioLayout: { vizQuality: 'high' } }
  });
});

describe('useVizConfig', () => {
  it('applies defaults for missing settings', () => {
    const { api } = mountViz();

    expect(api.vizCfg).toEqual({
      fpsCap: 60,
      primaryColor: '#8b7cf0',
      secondaryColor: '#4f46e5',
      sensitivity: 0.5,
      smoothing: 0.8
    });
    expect(h.qualityPreset).toHaveBeenCalledWith('high');
    expect(api.quality.value).toBe('preset:high');
  });

  it('reads stored settings and keeps zero smoothing', () => {
    h.settings.playback.visualization = {
      fpsCap: 30,
      primaryColor: '#111111',
      secondaryColor: '#222222',
      sensitivity: 0.9,
      smoothing: 0
    };

    const { api } = mountViz();

    expect(api.vizCfg).toEqual({
      fpsCap: 30,
      primaryColor: '#111111',
      secondaryColor: '#222222',
      sensitivity: 0.9,
      smoothing: 0
    });
  });

  it('recomputes the cached config when visualization settings change', async () => {
    const { api } = mountViz();

    h.settings.playback.visualization = {
      fpsCap: 0,
      primaryColor: '',
      secondaryColor: '',
      sensitivity: 0,
      smoothing: 0.4
    };
    await nextTick();

    expect(api.vizCfg).toEqual({
      fpsCap: 60,
      primaryColor: '#8b7cf0',
      secondaryColor: '#4f46e5',
      sensitivity: 0.5,
      smoothing: 0.4
    });

    h.settings.playback.visualization = { smoothing: null };
    await nextTick();
    expect(api.vizCfg.smoothing).toBe(0.8);
  });

  it('updates the quality when the layout changes', async () => {
    const { api } = mountViz();

    h.settings.appearance.audioLayout.vizQuality = 'low';
    await nextTick();

    expect(api.quality.value).toBe('preset:low');
    expect(h.qualityPreset).toHaveBeenLastCalledWith('low');
  });

  it('handles a missing audio layout', async () => {
    h.settings.appearance.audioLayout = undefined;
    const { api } = mountViz();

    expect(h.qualityPreset).toHaveBeenCalledWith(undefined);

    h.settings.appearance.audioLayout = { vizQuality: 'medium' };
    await nextTick();

    expect(api.quality.value).toBe('preset:medium');
  });
});
