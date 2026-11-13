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
  template: '<div data-testid="field"><slot :id="\'id-\' + label" /></div>'
});
const InputStub = defineComponent({
  name: 'UiInput',
  props: { id: { type: String }, modelValue: { type: String }, placeholder: { type: String } },
  emits: ['update:modelValue'],
  template:
    '<input data-testid="input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});
const SelectStub = defineComponent({
  name: 'UiSelect',
  props: { id: { type: String }, modelValue: { type: String } },
  emits: ['update:modelValue'],
  template:
    '<select data-testid="select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
});
const SwitchStub = defineComponent({
  name: 'UiSwitch',
  props: { modelValue: { type: Boolean }, size: { type: String }, label: { type: String } },
  emits: ['update:modelValue'],
  template:
    '<button data-testid="switch" :data-checked="String(modelValue)" @click="$emit(\'update:modelValue\', !modelValue)" />'
});

import SubscribeSubtitlesSection from '../SubscribeSubtitlesSection.vue';

function mountSection(over: Record<string, unknown> = {}) {
  return mount(SubscribeSubtitlesSection, {
    props: {
      isSc: false,
      subsEnabled: true,
      subsLangs: 'pl,en',
      subsMode: 'best',
      subsFormat: 'srt',
      subsFolder: false,
      ...over
    },
    global: {
      stubs: {
        FormField: FormStub,
        Input: InputStub,
        Select: SelectStub,
        Switch: SwitchStub
      }
    }
  });
}

describe('SubscribeSubtitlesSection', () => {
  it('hides for SoundCloud', () => {
    expect(mountSection({ isSc: true }).find('section').exists()).toBe(false);
  });

  it('renders the toggle and section title', () => {
    const wrapper = mountSection();

    expect(wrapper.text()).toContain('youtube.subsSection');
    expect(wrapper.findAll('[data-testid="switch"]')[0].attributes('data-checked')).toBe('true');
  });

  it('toggles subtitle downloads', async () => {
    const wrapper = mountSection();

    await wrapper.findAll('[data-testid="switch"]')[0].trigger('click');

    expect(wrapper.emitted('update:subsEnabled')).toEqual([[false]]);
  });

  it('hides the details when disabled', () => {
    const wrapper = mountSection({ subsEnabled: false });

    expect(wrapper.find('[data-testid="input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="select"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="switch"]')).toHaveLength(1);
  });

  it('renders language, mode, format and folder controls', () => {
    const wrapper = mountSection();

    expect(wrapper.get('[data-testid="input"]').attributes('value')).toBe('pl,en');

    const selects = wrapper.findAll('[data-testid="select"]');
    expect(selects).toHaveLength(2);
    expect(selects[0].findAll('option').map((o) => o.attributes('value'))).toEqual([
      'best',
      'manual',
      'auto'
    ]);
    expect(selects[1].findAll('option').map((o) => o.text())).toEqual(['SRT', 'VTT', 'ASS']);
    expect(wrapper.findAll('[data-testid="switch"]')).toHaveLength(2);
  });

  it('emits all subtitle settings', async () => {
    const wrapper = mountSection();

    await wrapper.get('[data-testid="input"]').setValue('de');
    const selects = wrapper.findAll('[data-testid="select"]');
    await selects[0].setValue('manual');
    await selects[1].setValue('vtt');
    await wrapper.findAll('[data-testid="switch"]')[1].trigger('click');

    expect(wrapper.emitted('update:subsLangs')).toEqual([['de']]);
    expect(wrapper.emitted('update:subsMode')).toEqual([['manual']]);
    expect(wrapper.emitted('update:subsFormat')).toEqual([['vtt']]);
    expect(wrapper.emitted('update:subsFolder')).toEqual([[true]]);
  });
});
