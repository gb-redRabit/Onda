import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  plugins: null as any
}));

vi.mock('@renderer/stores/plugins', () => ({ usePluginsStore: () => h.plugins }));

import PluginUiSlot from '../PluginUiSlot.vue';

function mountSlot(props: Record<string, unknown> = {}) {
  return mount(PluginUiSlot, { props });
}

describe('PluginUiSlot', () => {
  it('renders nothing without plugin items', () => {
    h.plugins = reactive({ slots: {} });

    expect(mountSlot().html()).toBe('<!--v-if-->');
  });

  it('groups items by plugin for the default slot', () => {
    h.plugins = reactive({
      slots: {
        p1: { 'audio-view': [{ label: 'A', value: 'one' }] },
        p2: { 'audio-view': [{ value: 'two' }, { label: 'B', value: 'three' }] },
        p3: { other: [{ value: 'hidden' }] }
      }
    });

    const wrapper = mountSlot();
    const groups = wrapper.findAll('[data-testid^="plugin-slot-item-"]');

    expect(wrapper.find('[data-testid="plugin-slot-audio-view"]').exists()).toBe(true);
    expect(groups).toHaveLength(3);
    expect(groups[0].text()).toContain('A');
    expect(groups[0].text()).toContain('one');
    expect(groups[1].text()).toBe('two');
    expect(groups[2].text()).toContain('B');
    expect(groups[2].text()).toContain('three');
  });

  it('filters by a custom slot', () => {
    h.plugins = reactive({
      slots: {
        p1: { 'video-view': [{ value: 'v' }] },
        p2: { 'audio-view': [{ value: 'a' }] }
      }
    });

    const wrapper = mountSlot({ slotId: 'video-view' });

    expect(wrapper.find('[data-testid="plugin-slot-video-view"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="plugin-slot-item-"]')).toHaveLength(1);
  });

  it('renders nothing when hidden', () => {
    h.plugins = reactive({ slots: { p1: { 'audio-view': [{ value: 'a' }] } } });

    expect(mountSlot({ visible: false }).html()).toBe('<!--v-if-->');
  });

  it('renders nothing for a missing slot', () => {
    h.plugins = reactive({ slots: { p1: { other: [{ value: 'a' }] } } });

    expect(mountSlot().html()).toBe('<!--v-if-->');
  });

  it('ignores plugins with an empty item list', () => {
    h.plugins = reactive({
      slots: {
        p1: { 'audio-view': [] },
        p2: { 'audio-view': [{ value: 'a' }] }
      }
    });

    const wrapper = mountSlot();

    expect(wrapper.findAll('[data-testid="plugin-slot-item-p1"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="plugin-slot-item-p2"]')).toHaveLength(1);
  });
});
