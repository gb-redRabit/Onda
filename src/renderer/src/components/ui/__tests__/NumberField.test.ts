import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NumberField from '../NumberField.vue';

describe('NumberField', () => {
  it('renders the input, unit and forwarded attributes', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 5, label: 'Size', min: 0, max: 10, step: 2, unit: 'px' },
      attrs: { class: 'custom', 'data-x': 'y' }
    });

    const input = wrapper.get('input');
    expect(input.attributes()).toMatchObject({
      type: 'number',
      min: '0',
      max: '10',
      step: '2',
      'aria-label': 'Size',
      'data-x': 'y'
    });
    expect(input.classes()).toContain('custom');
    expect(wrapper.text()).toContain('px');
  });

  it('applies the small invalid style and disabled state', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1, label: 'Count', invalid: true, size: 'sm', disabled: true }
    });

    const input = wrapper.get('input');
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('disabled')).toBeDefined();
    expect(input.classes()).toEqual(
      expect.arrayContaining(['h-8', 'px-2', 'text-xs', 'border-error'])
    );
  });

  it('clamps numeric input to the configured range', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 5, label: 'Size', min: 0, max: 10 }
    });
    const input = wrapper.get('input');

    await input.setValue('12');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([10]);

    await input.setValue('-3');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([0]);

    await input.setValue('4.5');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4.5]);
  });

  it('ignores empty and non-numeric input', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 5, label: 'Size' } });
    const input = wrapper.get('input');

    await input.setValue('');
    await input.setValue('abc');
    Object.defineProperty(input.element, 'value', { configurable: true, value: 'Infinity' });
    await input.trigger('input');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('accepts any finite number without explicit bounds', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 0, label: 'Free' } });
    const input = wrapper.get('input');

    await input.setValue('-1000000');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([-1000000]);
  });

  it('hides the unit when not provided', () => {
    const wrapper = mount(NumberField, { props: { modelValue: 1, label: 'No unit' } });

    expect(wrapper.findAll('span')).toHaveLength(0);
  });
});
