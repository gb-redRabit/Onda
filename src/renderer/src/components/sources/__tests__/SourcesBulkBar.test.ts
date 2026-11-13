import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const IconStub = defineComponent({
  name: 'IconButton',
  props: { icon: { type: [Object, Function] }, label: { type: String } },
  emits: ['click'],
  template: '<button data-testid="clear" @click="$emit(\'click\')" />'
});

import SourcesBulkBar from '../SourcesBulkBar.vue';

function mountBar(props: { count: number; playableCount: number }) {
  return mount(SourcesBulkBar, {
    props,
    global: {
      mocks: {
        $t: (key: string, params?: { n: number }) => (params ? `${key}:${params.n}` : key)
      },
      stubs: { IconButton: IconStub }
    }
  });
}

describe('SourcesBulkBar', () => {
  it('shows the selected count and enabled actions', () => {
    const wrapper = mountBar({ count: 3, playableCount: 2 });
    const buttons = wrapper.findAll('button');

    expect(wrapper.find('[data-testid="sources-bulk-bar"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="sources-selected-count"]').text()).toBe(
      'sources.selectedCount:3'
    );
    expect(buttons.slice(0, 3).map((b) => b.attributes('disabled'))).toEqual([
      undefined,
      undefined,
      undefined
    ]);
  });

  it('disables actions without a selection or playable items', () => {
    const wrapper = mountBar({ count: 0, playableCount: 0 });
    const buttons = wrapper.findAll('button');

    expect(buttons[0].attributes('disabled')).toBe('');
    expect(buttons[1].attributes('disabled')).toBe('');
    expect(buttons[2].attributes('disabled')).toBe('');
  });

  it('emits download, queue and play', async () => {
    const wrapper = mountBar({ count: 3, playableCount: 3 });
    const buttons = wrapper.findAll('button');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');

    expect(wrapper.emitted('download')).toEqual([[]]);
    expect(wrapper.emitted('queue')).toEqual([[]]);
    expect(wrapper.emitted('play')).toEqual([[]]);
  });

  it('emits clear through the icon button', async () => {
    const wrapper = mountBar({ count: 1, playableCount: 1 });

    await wrapper.get('[data-testid="clear"]').trigger('click');

    expect(wrapper.emitted('clear')).toEqual([[]]);
    expect(wrapper.getComponent(IconStub).props('label')).toBe('sources.clearSelection');
  });
});
