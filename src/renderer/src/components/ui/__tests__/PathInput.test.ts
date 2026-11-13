import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const InputStub = defineComponent({
  name: 'UiInput',
  props: {
    modelValue: { type: String },
    size: { type: String },
    ariaLabel: { type: String },
    placeholder: { type: String },
    readonly: { type: Boolean },
    disabled: { type: Boolean }
  },
  emits: ['update:modelValue'],
  template:
    '<input data-testid="input" :data-size="size" :aria-label="ariaLabel" :readonly="readonly" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});
const IconStub = defineComponent({
  name: 'IconButton',
  props: {
    icon: { type: [Object, Function] },
    label: { type: String },
    size: { type: Number },
    disabled: { type: Boolean }
  },
  emits: ['click'],
  template: '<button data-testid="browse" :disabled="disabled" @click="$emit(\'click\')" />'
});

import PathInput from '../PathInput.vue';

function mountInput(props: Record<string, unknown> = {}) {
  return mount(PathInput, {
    props: { modelValue: 'D:/out', label: 'Folder', ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Input: InputStub, IconButton: IconStub }
    }
  });
}

describe('PathInput', () => {
  it('renders a read-only medium input by default', () => {
    const wrapper = mountInput();
    const input = wrapper.get('[data-testid="input"]');

    expect(input.attributes('value')).toBe('D:/out');
    expect(input.attributes('readonly')).toBe('');
    expect(input.attributes('data-size')).toBe('md');
    expect(input.attributes('aria-label')).toBe('Folder');
    expect(wrapper.getComponent(IconStub).props('label')).toBe('Folder');
  });

  it('allows editing when requested', () => {
    const wrapper = mountInput({ readonly: false });

    expect(wrapper.get('[data-testid="input"]').attributes('readonly')).toBeUndefined();
  });

  it('forwards typed values', async () => {
    const wrapper = mountInput({ readonly: false });

    await wrapper.get('[data-testid="input"]').setValue('D:/new');

    expect(wrapper.emitted('update:modelValue')).toEqual([['D:/new']]);
  });

  it('emits browse from the icon button', async () => {
    const wrapper = mountInput();

    await wrapper.get('[data-testid="browse"]').trigger('click');

    expect(wrapper.emitted('browse')).toEqual([[]]);
  });

  it('disables both controls', () => {
    const wrapper = mountInput({ disabled: true, size: 'sm' });

    expect(wrapper.get('[data-testid="input"]').attributes('disabled')).toBe('');
    expect(wrapper.get('[data-testid="browse"]').attributes('disabled')).toBe('');
    expect(wrapper.get('[data-testid="input"]').attributes('data-size')).toBe('sm');
  });

  it('shows the clear action only for a set clearable value', () => {
    expect(mountInput().find('button:not([data-testid="browse"])').exists()).toBe(false);

    const wrapper = mountInput({ clearable: true });
    const clear = wrapper.find('button:not([data-testid="browse"])');
    expect(clear.exists()).toBe(true);
    expect(clear.text()).toBe('common.clear');

    const empty = mountInput({ clearable: true, modelValue: '' });
    expect(empty.find('button:not([data-testid="browse"])').exists()).toBe(false);
  });

  it('clears the value', async () => {
    const wrapper = mountInput({ clearable: true });

    await wrapper.find('button:not([data-testid="browse"])').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['']]);
  });
});
