import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ChevronDown, ChevronUp } from '@lucide/vue';

import ExplorerDetailsHeader from '../ExplorerDetailsHeader.vue';

function mountHeader(sortBy = 'name', sortOrder: 'asc' | 'desc' = 'asc') {
  return mount(ExplorerDetailsHeader, {
    props: { sortBy: sortBy as never, sortOrder },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('ExplorerDetailsHeader', () => {
  it('renders all sortable columns', () => {
    const buttons = mountHeader().findAll('button');

    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.text())).toEqual([
      'explorer.name',
      'explorer.size',
      'explorer.type',
      'explorer.modified'
    ]);
    expect(buttons[3].classes()).toContain('text-right');
    expect(buttons[0].classes()).toContain('text-left');
  });

  it('emits the field for every header click', async () => {
    const wrapper = mountHeader();
    const buttons = wrapper.findAll('button');

    for (const button of buttons) await button.trigger('click');

    expect(wrapper.emitted('sort')).toEqual([['name'], ['size'], ['type'], ['modified']]);
  });

  it('shows an ascending arrow for the active column', () => {
    const wrapper = mountHeader('size', 'asc');

    expect(wrapper.findAllComponents(ChevronUp)).toHaveLength(1);
    expect(wrapper.findAllComponents(ChevronDown)).toHaveLength(0);
  });

  it('shows a descending arrow for the active column', () => {
    const wrapper = mountHeader('modified', 'desc');

    expect(wrapper.findAllComponents(ChevronDown)).toHaveLength(1);
    expect(wrapper.findAllComponents(ChevronUp)).toHaveLength(0);
  });

  it('shows no arrow when the sort direction is not set for a column', () => {
    const wrapper = mountHeader('missing', 'asc');

    expect(wrapper.findAllComponents(ChevronUp)).toHaveLength(0);
    expect(wrapper.findAllComponents(ChevronDown)).toHaveLength(0);
  });
});
