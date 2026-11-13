import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any,
  presets: {
    compact: { label: 'Compact' },
    stacked: { label: 'Stacked' },
    split: { label: 'Split' },
    full: { label: 'Full' },
    immersive: { label: 'Immersive' }
  } as Record<string, { label: string }>
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/utils/constants', () => ({ AUDIO_LAYOUT_PRESETS: h.presets }));

import AudioLayoutSwitcher from '../AudioLayoutSwitcher.vue';

function mountSwitcher(preset?: string) {
  h.settings = reactive({
    appearance: { audioLayout: preset ? { preset } : undefined },
    applyAudioLayoutPreset: vi.fn()
  });
  return mount(AudioLayoutSwitcher);
}

beforeEach(() => {
  // rebuilt per mount
});

describe('AudioLayoutSwitcher', () => {
  it('renders a button per preset with labels', () => {
    const wrapper = mountSwitcher('compact');
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(5);
    expect(buttons.map((b) => b.attributes('title'))).toEqual([
      'Compact',
      'Stacked',
      'Split',
      'Full',
      'Immersive'
    ]);
  });

  it('highlights the current preset', () => {
    const wrapper = mountSwitcher('split');

    expect(wrapper.findAll('button')[2].classes()).toContain('text-primary-text');
    expect(wrapper.findAll('button')[0].classes()).not.toContain('text-primary-text');
  });

  it('treats a missing layout as full', () => {
    const wrapper = mountSwitcher();

    expect(wrapper.findAll('button')[3].classes()).toContain('text-primary-text');
  });

  it('applies the clicked preset', async () => {
    const wrapper = mountSwitcher('full');

    await wrapper.findAll('button')[4].trigger('click');

    expect(h.settings.applyAudioLayoutPreset).toHaveBeenCalledWith('immersive');
  });
});
