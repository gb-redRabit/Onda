import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import ColorInput from '../ColorInput.vue';

function mountInput(modelValue = '#336699', over: Record<string, unknown> = {}) {
  return mount(ColorInput, {
    props: { modelValue, label: 'Accent', ...over }
  });
}

describe('ColorInput', () => {
  it('renders the swatch and hex value', () => {
    const wrapper = mountInput();
    const inputs = wrapper.findAll('input');

    expect(inputs[0].attributes('type')).toBe('color');
    expect(inputs[0].attributes('aria-label')).toBe('Accent');
    expect((inputs[0].element as HTMLInputElement).value).toBe('#336699');
    expect(inputs[1].attributes('aria-label')).toBe('Accent (HEX)');
    expect((inputs[1].element as HTMLInputElement).value).toBe('#336699');
  });

  it('normalizes invalid hex to black for the swatch', () => {
    const inputs = mountInput('nope').findAll('input');

    expect((inputs[0].element as HTMLInputElement).value).toBe('#000000');
  });

  it('emits normalized colors from both fields', async () => {
    const wrapper = mountInput('#000000');
    const inputs = wrapper.findAll('input');

    (inputs[0].element as HTMLInputElement).value = '#AbCdEf';
    await inputs[0].trigger('input');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#abcdef']);

    (inputs[1].element as HTMLInputElement).value = '#123456';
    await inputs[1].trigger('change');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#123456']);
  });

  it('ignores invalid values', async () => {
    const wrapper = mountInput('#000000');
    const inputs = wrapper.findAll('input');

    (inputs[1].element as HTMLInputElement).value = 'invalid';
    await inputs[1].trigger('change');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    Object.defineProperty(inputs[0].element, 'value', {
      configurable: true,
      value: 'invalid'
    });
    await inputs[0].trigger('input');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('forwards disabled and wide styling', () => {
    const wrapper = mountInput('#000000', { disabled: true, wide: true });
    const inputs = wrapper.findAll('input');

    expect(inputs.every((i) => i.attributes('disabled') === '')).toBe(true);
    expect(inputs[1].classes()).toContain('w-full');
  });

  it('uses a fixed width by default', () => {
    expect(mountInput().findAll('input')[1].classes()).toContain('w-28');
  });
});
