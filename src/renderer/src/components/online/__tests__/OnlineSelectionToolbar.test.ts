import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: { count: number }) => (params ? `${key}:${params.count}` : key)
    })
  };
});

const ButtonStub = defineComponent({
  name: 'OnlineButton',
  props: {
    variant: { type: String },
    size: { type: String },
    disabled: { type: Boolean }
  },
  emits: ['click'],
  template:
    '<button data-testid="online-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
});

import OnlineSelectionToolbar from '../OnlineSelectionToolbar.vue';

function mountBar(
  props: Partial<{
    selectedCount: number;
    totalCount: number;
    rangeStart: number;
    rangeEnd: number;
  }> = {}
) {
  return mount(OnlineSelectionToolbar, {
    props: { selectedCount: 2, totalCount: 5, rangeStart: 1, rangeEnd: 3, ...props },
    global: {
      mocks: {
        $t: (key: string) => key,
        t: (key: string, params?: { count: number }) => (params ? `${key}:${params.count}` : key)
      },
      stubs: { OnlineButton: ButtonStub }
    }
  });
}

describe('OnlineSelectionToolbar', () => {
  it('offers select-all until everything is selected', () => {
    expect(mountBar().text()).toContain('common.selectAll');
    expect(mountBar({ selectedCount: 5 }).text()).toContain('common.deselectAll');
    expect(mountBar({ selectedCount: 0 }).text()).toContain('common.selectAll');
  });

  it('renders the selected count and disables the action at zero', () => {
    const empty = mountBar({ selectedCount: 0 });
    const buttons = empty.findAll('[data-testid="online-button"]');

    expect(empty.text()).toContain('youtube.addSelected:0');
    expect(buttons[2].attributes('disabled')).toBe('');

    const filled = mountBar({ selectedCount: 3 });
    expect(filled.text()).toContain('youtube.addSelected:3');
    expect(
      filled.findAll('[data-testid="online-button"]')[2].attributes('disabled')
    ).toBeUndefined();
  });

  it('renders the current range and emits number updates', async () => {
    const wrapper = mountBar();
    const inputs = wrapper.findAll('input[type="number"]');

    expect(inputs.map((i) => i.attributes('value'))).toEqual(['1', '3']);

    await inputs[0].setValue('4');
    await inputs[1].setValue('9');

    expect(wrapper.emitted('update:rangeStart')).toEqual([[4]]);
    expect(wrapper.emitted('update:rangeEnd')).toEqual([[9]]);
  });

  it('emits select-all, range and add actions', async () => {
    const wrapper = mountBar({ selectedCount: 2 });
    const buttons = wrapper.findAll('[data-testid="online-button"]');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');

    expect(wrapper.emitted('selectAll')).toEqual([[]]);
    expect(wrapper.emitted('selectRange')).toEqual([[]]);
    expect(wrapper.emitted('addSelected')).toEqual([[]]);
  });
});
