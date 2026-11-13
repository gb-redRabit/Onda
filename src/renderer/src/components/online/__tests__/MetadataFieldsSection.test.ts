import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));

const FormFieldStub = defineComponent({
  name: 'FormField',
  props: { label: { type: String } },
  template: '<div data-testid="field" :data-label="label"><slot :id="\'field-\' + label" /></div>'
});
const InputStub = defineComponent({
  name: 'UiInput',
  props: { id: { type: String }, modelValue: { type: String }, inputmode: { type: String } },
  emits: ['update:modelValue'],
  template:
    '<input data-testid="input" :data-id="id" :inputmode="inputmode" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});

import MetadataFieldsSection from '../MetadataFieldsSection.vue';

function mountSection(
  values: Partial<{ artist: string; album: string; year: string; gridClass: string }> = {}
) {
  return mount(MetadataFieldsSection, {
    props: {
      artist: values.artist ?? 'Artist',
      album: values.album ?? 'Album',
      year: values.year ?? '2020',
      gridClass: values.gridClass
    },
    global: { stubs: { FormField: FormFieldStub, Input: InputStub } }
  });
}

beforeEach(() => {
  h.t.mockClear();
});

describe('MetadataFieldsSection', () => {
  it('renders the section copy and three fields', () => {
    const wrapper = mountSection();
    const fields = wrapper.findAll('[data-testid="field"]');

    expect(wrapper.text()).toContain('youtube.metaSection');
    expect(wrapper.text()).toContain('youtube.metaHint');
    expect(fields.map((f) => f.attributes('data-label'))).toEqual([
      'youtube.metaArtist',
      'youtube.metaAlbum',
      'youtube.metaYear'
    ]);
  });

  it('binds the values and generated ids', () => {
    const wrapper = mountSection();
    const inputs = wrapper.findAll('[data-testid="input"]');

    expect(inputs.map((i) => i.attributes('value'))).toEqual(['Artist', 'Album', '2020']);
    expect(inputs[0].attributes('data-id')).toBe('field-youtube.metaArtist');
    expect(inputs[2].attributes('data-id')).toBe('field-youtube.metaYear');
  });

  it('marks the year input as numeric', () => {
    const inputs = mountSection().findAll('[data-testid="input"]');

    expect(inputs[2].attributes('inputmode')).toBe('numeric');
  });

  it('emits model updates for every field', async () => {
    const wrapper = mountSection();
    const inputs = wrapper.findAll('[data-testid="input"]');

    await inputs[0].setValue('New artist');
    await inputs[1].setValue('New album');
    await inputs[2].setValue('1999');

    expect(wrapper.emitted('update:artist')).toEqual([['New artist']]);
    expect(wrapper.emitted('update:album')).toEqual([['New album']]);
    expect(wrapper.emitted('update:year')).toEqual([['1999']]);
  });

  it('uses the default and a custom grid class', () => {
    expect(mountSection().get('.grid').classes()).toContain('grid-cols-3');
    expect(mountSection({ gridClass: 'grid-cols-2' }).get('.grid').classes()).toContain(
      'grid-cols-2'
    );
  });
});
