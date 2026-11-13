import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, type PropType } from 'vue';

const ItemStub = defineComponent({
  name: 'AppMenuItem',
  props: { icon: { type: Object as PropType<unknown> } },
  emits: ['click'],
  template: '<button role="menuitem" @click="$emit(\'click\')"><slot /></button>'
});

import AppMenuHelpDropdown from '../AppMenuHelpDropdown.vue';

function mountMenu() {
  return mount(AppMenuHelpDropdown, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { AppMenuItem: ItemStub }
    }
  });
}

describe('AppMenuHelpDropdown', () => {
  it('renders the help menu actions in order', () => {
    const wrapper = mountMenu();
    const items = wrapper.findAll('[role="menuitem"]');

    expect(wrapper.get('[role="menu"]').attributes('data-menu')).toBe('help');
    expect(items.map((item) => item.text())).toEqual([
      'menu.shortcuts',
      'menu.dependencies',
      'menu.updates',
      'menu.logs',
      'menu.about'
    ]);
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(1);
  });

  it('emits the matching event for each action', async () => {
    const wrapper = mountMenu();
    const items = wrapper.findAll('[role="menuitem"]');

    for (const item of items) await item.trigger('click');

    expect(wrapper.emitted('shortcuts')).toEqual([[]]);
    expect(wrapper.emitted('dependencies')).toEqual([[]]);
    expect(wrapper.emitted('updates')).toEqual([[]]);
    expect(wrapper.emitted('logs')).toEqual([[]]);
    expect(wrapper.emitted('about')).toEqual([[]]);
  });
});
