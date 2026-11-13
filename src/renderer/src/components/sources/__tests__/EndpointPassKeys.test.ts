import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const LabelStub = defineComponent({
  name: 'FieldLabel',
  props: { text: { type: String }, tight: { type: Boolean } },
  template: '<div data-testid="label">{{ text }}</div>'
});
const RowStub = defineComponent({
  name: 'PassKeyRow',
  props: {
    modelValue: { type: Object },
    options: { type: Array },
    idBase: { type: String }
  },
  emits: ['update:modelValue', 'remove'],
  template: '<div data-testid="passkey-row" />'
});

import EndpointPassKeys from '../EndpointPassKeys.vue';

function mountKeys(passKeys: unknown[] = []) {
  return mount(EndpointPassKeys, {
    props: {
      modelId: 'model-1',
      fieldOptions: ['a', 'b'],
      passKeys: passKeys as never
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { FieldLabel: LabelStub, PassKeyRow: RowStub }
    }
  });
}

describe('EndpointPassKeys', () => {
  it('renders the label and add action', () => {
    const wrapper = mountKeys();

    expect(wrapper.get('[data-testid="label"]').text()).toBe('sources.passKeys');
    expect(wrapper.get('button').text()).toContain('sources.addPassKey');
    expect(wrapper.find('[data-testid="passkey-row"]').exists()).toBe(false);
  });

  it('adds an empty pass key', async () => {
    const passKeys: unknown[] = [];
    const wrapper = mountKeys(passKeys);

    await wrapper.get('button').trigger('click');

    expect(passKeys).toEqual([{ from: '', as: '', type: 'string' }]);
  });

  it('renders a row per pass key with options and stable ids', () => {
    const wrapper = mountKeys([
      { from: 'a', as: 'b', type: 'string' },
      { from: 'c', as: 'd', type: 'number' }
    ]);
    const rows = wrapper.findAllComponents(RowStub);

    expect(rows).toHaveLength(2);
    expect(rows[0].props()).toMatchObject({ options: ['a', 'b'], idBase: 'dl-model-1-pk0' });
    expect(rows[1].props('idBase')).toBe('dl-model-1-pk1');
  });

  it('writes row updates back into the list', () => {
    const passKeys = [{ from: 'a', as: 'b', type: 'string' }];
    const wrapper = mountKeys(passKeys);

    wrapper.findAllComponents(RowStub)[0].vm.$emit('update:modelValue', {
      from: 'x',
      as: 'y',
      type: 'number'
    });

    expect(passKeys).toEqual([{ from: 'x', as: 'y', type: 'number' }]);
  });

  it('removes a row by index', () => {
    const passKeys = [
      { from: 'a', as: 'b', type: 'string' },
      { from: 'c', as: 'd', type: 'number' }
    ];
    const wrapper = mountKeys(passKeys);

    wrapper.findAllComponents(RowStub)[0].vm.$emit('remove');

    expect(passKeys).toEqual([{ from: 'c', as: 'd', type: 'number' }]);
  });
});
