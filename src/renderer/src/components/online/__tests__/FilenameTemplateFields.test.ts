import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const FormStub = defineComponent({
  name: 'FormField',
  props: { label: { type: String } },
  template: '<div data-testid="form"><slot :id="\'field-1\'" /></div>'
});
const InputStub = defineComponent({
  name: 'UiInput',
  props: { id: { type: String }, modelValue: { type: String }, placeholder: { type: String } },
  emits: ['update:modelValue'],
  template:
    '<input data-testid="input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});
const PresetsStub = defineComponent({
  name: 'FilenameTemplatePresets',
  emits: ['preset'],
  template: '<button data-testid="preset-btn" @click="$emit(\'preset\', \'{artist} - {title}\')" />'
});

import FilenameTemplateFields from '../FilenameTemplateFields.vue';

function mountFields(filenameTemplate = '{title}', preview?: string) {
  return mount(FilenameTemplateFields, {
    props: { filenameTemplate, preview },
    global: {
      stubs: { FormField: FormStub, Input: InputStub, FilenameTemplatePresets: PresetsStub }
    }
  });
}

describe('FilenameTemplateFields', () => {
  it('binds the template input', () => {
    const wrapper = mountFields();
    const input = wrapper.get('[data-testid="input"]');

    expect(input.attributes('value')).toBe('{title}');
    expect(wrapper.find('[data-testid="form"]').exists()).toBe(true);
  });

  it('emits typed values', async () => {
    const wrapper = mountFields();

    await wrapper.get('[data-testid="input"]').setValue('{album}');

    expect(wrapper.emitted('update:filenameTemplate')).toEqual([['{album}']]);
  });

  it('applies a preset', async () => {
    const wrapper = mountFields('');

    await wrapper.get('[data-testid="preset-btn"]').trigger('click');

    expect(wrapper.emitted('update:filenameTemplate')).toEqual([['{artist} - {title}']]);
  });

  it('appends tokens with a separating space', async () => {
    const wrapper = mountFields('{title}');
    const tokens = wrapper.findAll('button:not([data-testid="preset-btn"])');

    expect(tokens.map((t) => t.text())).toEqual([
      '{title}',
      '{artist}',
      '{album}',
      '{year}',
      '{id}'
    ]);

    await tokens[1].trigger('click');

    expect(wrapper.emitted('update:filenameTemplate')?.at(-1)).toEqual(['{title} {artist}']);
  });

  it('avoids a duplicate space when the value already ends with one', async () => {
    const wrapper = mountFields('{title} ');
    const tokens = wrapper.findAll('button:not([data-testid="preset-btn"])');

    await tokens[2].trigger('click');

    expect(wrapper.emitted('update:filenameTemplate')).toEqual([['{title} {album}']]);
  });

  it('adds a token to an empty template without a leading space', async () => {
    const wrapper = mountFields('');
    const tokens = wrapper.findAll('button:not([data-testid="preset-btn"])');

    await tokens[4].trigger('click');

    expect(wrapper.emitted('update:filenameTemplate')).toEqual([['{id}']]);
  });

  it('treats a missing template as empty', async () => {
    const wrapper = mountFields(null as never);
    const tokens = wrapper.findAll('button:not([data-testid="preset-btn"])');

    await tokens[0].trigger('click');

    expect(wrapper.emitted('update:filenameTemplate')).toEqual([['{title}']]);
  });

  it('shows the preview only when provided', () => {
    expect(mountFields('{title}').find('[data-testid="template-preview"]').exists()).toBe(false);

    const wrapper = mountFields('{title}', 'Song.flac');
    const preview = wrapper.get('[data-testid="template-preview"]');

    expect(preview.text()).toBe('Song.flac');
    expect(preview.attributes('title')).toBe('Song.flac');
  });
});
