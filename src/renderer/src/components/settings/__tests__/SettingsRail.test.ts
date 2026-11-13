import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const Icon = defineComponent({ name: 'FakeIcon', template: '<i data-testid="icon" />' });

import SettingsRail from '../SettingsRail.vue';

const sections = [
  { id: 'general', labelKey: 'settings.general', icon: Icon },
  { id: 'appearance', labelKey: 'settings.appearance', icon: Icon }
];
const tabs = [
  { id: 'language', labelKey: 'settings.language', icon: Icon, section: 'general' },
  { id: 'theme', labelKey: 'settings.theme', icon: Icon, section: 'appearance' }
];

function mountRail(props: Record<string, unknown> = {}) {
  return mount(SettingsRail, {
    props: { sections, tabs, activeSection: null, activeTab: null, ...props },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('SettingsRail', () => {
  it('renders sections and their tabs', () => {
    const wrapper = mountRail();
    const text = wrapper.text();

    expect(wrapper.find('[data-testid="settings-section-general"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-tab-language"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-tab-theme"]').exists()).toBe(true);
    expect(text).toContain('settings.general');
    expect(text).toContain('settings.theme');
  });

  it('does not render tabs of other sections under a section', () => {
    const wrapper = mountRail();
    const generalBlock = wrapper.findAll('.hidden.lg\\:flex')[0];

    expect(generalBlock.findAll('button')).toHaveLength(1);
  });

  it('marks the active section', () => {
    const wrapper = mountRail({ activeSection: 'appearance' });
    const active = wrapper.get('[data-testid="settings-section-appearance"]');
    const inactive = wrapper.get('[data-testid="settings-section-general"]');

    expect(active.attributes('aria-current')).toBe('location');
    expect(active.classes()).toContain('text-primary-text');
    expect(inactive.attributes('aria-current')).toBeUndefined();
  });

  it('derives the active section from the active tab', () => {
    const wrapper = mountRail({ activeTab: 'theme' });

    expect(
      wrapper.get('[data-testid="settings-section-appearance"]').attributes('aria-current')
    ).toBe('location');
  });

  it('prefers an explicit active section', () => {
    const wrapper = mountRail({ activeSection: 'general', activeTab: 'theme' });

    expect(wrapper.get('[data-testid="settings-section-general"]').attributes('aria-current')).toBe(
      'location'
    );
  });

  it('emits section and tab selections', async () => {
    const wrapper = mountRail();

    await wrapper.get('[data-testid="settings-section-general"]').trigger('click');
    await wrapper.get('[data-testid="settings-tab-theme"]').trigger('click');

    expect(wrapper.emitted('select-section')).toEqual([['general']]);
    expect(wrapper.emitted('select-tab')).toEqual([['theme']]);
  });

  it('marks the active tab', () => {
    const wrapper = mountRail({ activeTab: 'language' });
    const tab = wrapper.get('[data-testid="settings-tab-language"]');

    expect(tab.attributes('aria-current')).toBe('page');
    expect(tab.classes()).toContain('bg-primary/15');
  });

  it('emits reset', async () => {
    const wrapper = mountRail();

    await wrapper.get('[data-testid="settings-reset"]').trigger('click');

    expect(wrapper.emitted('reset')).toEqual([[]]);
  });
});
