import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Textarea from '../Textarea.vue';
import Slider from '../Slider.vue';
import Checkbox from '../Checkbox.vue';
import ColorInput from '../ColorInput.vue';
import NumberField from '../NumberField.vue';

describe('Textarea', () => {
  it('updates the model and flags invalid content', async () => {
    const wrapper = mount(Textarea, { props: { modelValue: 'a', invalid: true } });
    expect(wrapper.attributes('aria-invalid')).toBe('true');
    await wrapper.setValue('b');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['b']);
  });

  it('exposes rows and lets an external class override the width', () => {
    const wrapper = mount(Textarea, {
      props: { modelValue: '', rows: 5 },
      attrs: { class: 'w-40' }
    });
    expect(wrapper.attributes('rows')).toBe('5');
    expect(wrapper.classes()).toContain('w-40');
  });
});

describe('Slider', () => {
  it('carries the accessible name and range', () => {
    const wrapper = mount(Slider, {
      props: { modelValue: 10, label: 'Głośność', min: 0, max: 100, step: 5 }
    });
    expect(wrapper.attributes('type')).toBe('range');
    expect(wrapper.attributes('aria-label')).toBe('Głośność');
    expect(wrapper.attributes('max')).toBe('100');
    expect(wrapper.attributes('step')).toBe('5');
  });

  it('reports the human readable value when provided', () => {
    const wrapper = mount(Slider, {
      props: { modelValue: 40, label: 'Głośność', valueText: 'Głośność: 40%' }
    });
    expect(wrapper.attributes('aria-valuetext')).toBe('Głośność: 40%');
  });

  it('emits numbers, not strings', async () => {
    const wrapper = mount(Slider, { props: { modelValue: 0, label: 'Poziom' } });
    await wrapper.setValue(35);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([35]);
  });
});

describe('Checkbox', () => {
  it('links the label with the control', () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false, label: 'Pokaż ukryte' } });
    const input = wrapper.get('input');
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'));
  });

  it('describes the hint and toggles the model', async () => {
    const wrapper = mount(Checkbox, {
      props: { modelValue: false, label: 'Pokaż ukryte', hint: 'Dotyczy Eksploratora' }
    });
    const input = wrapper.get('input');
    expect(input.attributes('aria-describedby')).toBe(`${input.attributes('id')}-hint`);

    await input.setValue(true);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
  });
});

describe('ColorInput', () => {
  it('normalizes the hex typed by the user', async () => {
    const wrapper = mount(ColorInput, { props: { modelValue: '#ff0000', label: 'Akcent' } });
    const hex = wrapper.findAll('input')[1];
    await hex.setValue('#ABC');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['#aabbcc']);
  });

  it('ignores values that are not hex colours', async () => {
    const wrapper = mount(ColorInput, { props: { modelValue: '#ff0000', label: 'Akcent' } });
    const hex = wrapper.findAll('input')[1];
    await hex.setValue('red');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('keeps the swatch in sync with the model', () => {
    const wrapper = mount(ColorInput, { props: { modelValue: '#00d3bb', label: 'Akcent' } });
    expect(wrapper.findAll('input')[0].attributes('value')).toBe('#00d3bb');
  });
});

describe('NumberField', () => {
  it('clamps the typed value into the allowed range', async () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 5, label: 'Szerokość', min: 1, max: 10 }
    });
    const input = wrapper.get('input');
    await input.setValue(50);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([10]);
  });

  it('does not emit for empty or invalid input', async () => {
    const wrapper = mount(NumberField, { props: { modelValue: 5, label: 'Szerokość' } });
    await wrapper.get('input').setValue('');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('shows the unit next to the field', () => {
    const wrapper = mount(NumberField, { props: { modelValue: 14, label: 'Promień', unit: 'px' } });
    expect(wrapper.text()).toContain('px');
  });
});
