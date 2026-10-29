import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Switch from '../Switch.vue';
import Input from '../Input.vue';
import FormField from '../FormField.vue';

describe('Switch', () => {
  it('is a switch with a checked state and a label', () => {
    const wrapper = mount(Switch, { props: { modelValue: false, label: 'Auto-download' } });
    expect(wrapper.attributes('role')).toBe('switch');
    expect(wrapper.attributes('aria-checked')).toBe('false');
    expect(wrapper.attributes('aria-label')).toBe('Auto-download');
  });

  it('emits the opposite value on click', async () => {
    const wrapper = mount(Switch, { props: { modelValue: false, label: 'Auto' } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
  });

  it('marks the checked state for styling', () => {
    const wrapper = mount(Switch, { props: { modelValue: true, label: 'Auto' } });
    expect(wrapper.attributes('aria-checked')).toBe('true');
    expect(wrapper.classes()).toContain('bg-primary');
  });
});

describe('Input', () => {
  it('updates the model and flags invalid fields', async () => {
    const wrapper = mount(Input, { props: { modelValue: 'a', invalid: true } });
    expect(wrapper.attributes('aria-invalid')).toBe('true');

    await wrapper.setValue('b');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['b']);
  });

  it('lets an external class override the default spacing', () => {
    const wrapper = mount(Input, { props: { modelValue: '' }, attrs: { class: 'w-40' } });
    expect(wrapper.classes()).toContain('w-40');
    expect(wrapper.classes()).not.toContain('w-full');
  });
});

describe('FormField', () => {
  it('links the label and hint to the control through slot props', () => {
    const wrapper = mount(FormField, {
      props: { label: 'Title', hint: 'Shown in the list' },
      slots: {
        default: `<template #default="p"><input data-test="field" :id="p.id" :aria-describedby="p.describedby" /></template>`
      }
    });

    const input = wrapper.get('[data-test="field"]');
    const label = wrapper.get('label');
    expect(label.attributes('for')).toBe(input.attributes('id'));
    expect(input.attributes('aria-describedby')).toBe(`${input.attributes('id')}-hint`);
    expect(wrapper.text()).toContain('Shown in the list');
  });

  it('prefers the error over the hint and marks it for the control', () => {
    const wrapper = mount(FormField, {
      props: { label: 'Year', hint: 'Optional', error: 'Must be a number' },
      slots: {
        default: `<template #default="p"><input data-test="field" :id="p.id" :aria-describedby="p.describedby" /></template>`
      }
    });

    const input = wrapper.get('[data-test="field"]');
    expect(wrapper.text()).toContain('Must be a number');
    expect(wrapper.text()).not.toContain('Optional');
    expect(input.attributes('aria-describedby')).toBe(`${input.attributes('id')}-error`);
  });
});
