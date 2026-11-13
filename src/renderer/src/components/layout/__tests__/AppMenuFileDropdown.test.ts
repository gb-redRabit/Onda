import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, type PropType } from 'vue';

const ItemStub = defineComponent({
  name: 'AppMenuItem',
  props: { icon: { type: Object as PropType<unknown> } },
  emits: ['click'],
  template: '<button role="menuitem" @click="$emit(\'click\')"><slot /></button>'
});

import AppMenuFileDropdown from '../AppMenuFileDropdown.vue';

function mountMenu() {
  return mount(AppMenuFileDropdown, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { AppMenuItem: ItemStub }
    }
  });
}

describe('AppMenuFileDropdown', () => {
  it('renders the file menu with three actions', () => {
    const wrapper = mountMenu();
    const items = wrapper.findAll('[role="menuitem"]');

    expect(wrapper.get('[role="menu"]').attributes('data-menu')).toBe('file');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.text())).toEqual([
      'menu.openFile',
      'menu.openFolder',
      'menu.quit'
    ]);
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(1);
  });

  it('emits each action on click', async () => {
    const wrapper = mountMenu();
    const items = wrapper.findAll('[role="menuitem"]');

    await items[0].trigger('click');
    await items[1].trigger('click');
    await items[2].trigger('click');

    expect(wrapper.emitted('openFile')).toEqual([[]]);
    expect(wrapper.emitted('openFolder')).toEqual([[]]);
    expect(wrapper.emitted('quit')).toEqual([[]]);
  });
});
