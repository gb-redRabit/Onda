import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const SelectStub = defineComponent({
  name: 'UiSelect',
  props: { modelValue: { type: String }, ariaLabel: { type: String } },
  emits: ['update:modelValue'],
  template:
    '<select data-testid="select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
});
const InputStub = defineComponent({
  name: 'UiInput',
  props: {
    modelValue: { type: String },
    placeholder: { type: String },
    ariaLabel: { type: String }
  },
  emits: ['update:modelValue'],
  template:
    '<input data-testid="input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});
const ButtonStub = defineComponent({
  name: 'OnlineButton',
  props: {
    variant: { type: String },
    size: { type: String },
    label: { type: String },
    title: { type: String },
    disabled: { type: Boolean }
  },
  emits: ['click'],
  template:
    '<button data-testid="action" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
});

import DownloadProfilesSection from '../DownloadProfilesSection.vue';

const profiles = [
  { id: 'p1', name: 'Profile one' },
  { id: 'p2', name: 'Profile two' }
];

function mountSection(over: Record<string, unknown> = {}) {
  return mount(DownloadProfilesSection, {
    props: { isSc: false, profiles, selectedId: '', profileName: '', ...over },
    global: { stubs: { Select: SelectStub, Input: InputStub, Button: ButtonStub } }
  });
}

describe('DownloadProfilesSection', () => {
  it('hides for SoundCloud', () => {
    expect(mountSection({ isSc: true }).find('[data-testid="select"]').exists()).toBe(false);
  });

  it('lists the profiles and current selection', () => {
    const wrapper = mountSection({ selectedId: 'p1' });
    const options = wrapper.findAll('option');

    expect(options.map((o) => o.text())).toEqual([
      'youtube.profileNone',
      'Profile one',
      'Profile two'
    ]);
    expect(wrapper.get('[data-testid="select"]').attributes('value')).toBe('p1');
  });

  it('emits the selected profile', async () => {
    const wrapper = mountSection();

    await wrapper.get('[data-testid="select"]').setValue('p2');

    expect(wrapper.emitted('select')).toEqual([['p2']]);
  });

  it('shows the delete action only with a selection', () => {
    expect(mountSection().findAll('[data-testid="action"]')).toHaveLength(1);

    const withSelection = mountSection({ selectedId: 'p1' });
    expect(withSelection.findAll('[data-testid="action"]')).toHaveLength(2);
  });

  it('deletes the selected profile', async () => {
    const wrapper = mountSection({ selectedId: 'p1' });

    await wrapper.findAll('[data-testid="action"]')[0].trigger('click');

    expect(wrapper.emitted('delete')).toEqual([[]]);
  });

  it('binds the profile name and disables empty saves', async () => {
    const wrapper = mountSection({ profileName: 'My profile' });
    const input = wrapper.get('[data-testid="input"]');
    const save = wrapper.findAll('[data-testid="action"]').at(-1)!;

    expect(input.attributes('value')).toBe('My profile');
    expect(save.attributes('disabled')).toBeUndefined();

    await save.trigger('click');
    expect(wrapper.emitted('save')).toEqual([[]]);

    await input.setValue('New name');
    expect(wrapper.emitted('update:profileName')).toEqual([['New name']]);
  });

  it('disables save for a blank name', () => {
    const blank = mountSection({ profileName: '   ' });

    expect(blank.findAll('[data-testid="action"]').at(-1)!.attributes('disabled')).toBe('');
  });
});
