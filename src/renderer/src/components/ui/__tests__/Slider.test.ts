import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Slider from '../Slider.vue';

// Range input with a required accessible name and v-model.number.

function mountSlider(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  return mount(Slider, { props: { modelValue: 50, label: 'Volume', ...props }, attrs });
}

describe('Slider', () => {
  it('renders a labelled range with default bounds', () => {
    const input = mountSlider().find('input');

    expect(input.attributes('type')).toBe('range');
    expect(input.attributes('min')).toBe('0');
    expect(input.attributes('max')).toBe('100');
    expect(input.attributes('step')).toBe('1');
    expect(input.attributes('aria-label')).toBe('Volume');
    expect(input.classes()).toContain('accent-primary');
  });

  it('forwards custom bounds, step, disabled and value text', () => {
    const input = mountSlider({
      min: 10,
      max: 20,
      step: 0.5,
      disabled: true,
      valueText: '15 px'
    }).find('input');

    expect(input.attributes('min')).toBe('10');
    expect(input.attributes('max')).toBe('20');
    expect(input.attributes('step')).toBe('0.5');
    expect(input.attributes('aria-valuetext')).toBe('15 px');
    expect(input.attributes('disabled')).toBe('');
  });

  it('emits numeric updates and merges caller classes', async () => {
    const wrapper = mountSlider({}, { class: 'w-40', 'data-testid': 'slider' });
    const input = wrapper.find('input');

    await input.setValue('42');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([42]);
    expect(input.classes()).toContain('w-40');
    expect(input.attributes('data-testid')).toBe('slider');
  });
});
