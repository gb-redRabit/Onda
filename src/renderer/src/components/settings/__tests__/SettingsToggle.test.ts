import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

import SettingsToggle from '../SettingsToggle.vue';
import { SETTINGS_ROW_LABEL } from '../settingsRowLabel';

function mountToggle(props: Record<string, unknown> = {}, global: Record<string, unknown> = {}) {
  return mount(SettingsToggle, { props: { modelValue: false, ...props }, global });
}

describe('SettingsToggle', () => {
  it('reflects the off state', () => {
    const button = mountToggle({ modelValue: false }).get('button');

    expect(button.attributes('role')).toBe('switch');
    expect(button.attributes('aria-checked')).toBe('false');
    expect(button.classes()).toContain('bg-base-300');
    expect(button.find('span').classes()).toContain('translate-x-1');
  });

  it('reflects the on state', () => {
    const button = mountToggle({ modelValue: true }).get('button');

    expect(button.attributes('aria-checked')).toBe('true');
    expect(button.classes()).toContain('bg-primary');
    expect(button.find('span').classes()).toContain('translate-x-6');
  });

  it('emits the inverted value on click', async () => {
    const wrapper = mountToggle({ modelValue: false });

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  });

  it('supports a disabled state', () => {
    const wrapper = mountToggle({ disabled: true });

    expect(wrapper.get('button').attributes('disabled')).toBe('');
  });

  it('prefers an explicit label', () => {
    const wrapper = mountToggle(
      { label: 'Explicit' },
      { provide: { [SETTINGS_ROW_LABEL]: ref('Row label') } }
    );

    expect(wrapper.get('button').attributes('aria-label')).toBe('Explicit');
  });

  it('falls back to the injected row label', () => {
    const wrapper = mountToggle({}, { provide: { [SETTINGS_ROW_LABEL]: ref('Row label') } });

    expect(wrapper.get('button').attributes('aria-label')).toBe('Row label');
  });

  it('falls back to an aria-label attribute', () => {
    const wrapper = mountToggle({ 'aria-label': 'Attr label' });

    expect(wrapper.get('button').attributes('aria-label')).toBe('Attr label');
  });

  it('has no name without any label source', () => {
    const wrapper = mount(SettingsToggle, {
      props: { modelValue: false },
      attrs: { 'aria-label': 5 }
    });

    expect(wrapper.get('button').attributes('aria-label')).toBe('5');
  });
});
