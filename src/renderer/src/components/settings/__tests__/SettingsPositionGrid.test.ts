import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const Icon = defineComponent({ name: 'FakeIcon', template: '<i data-testid="icon" />' });

import SettingsPositionGrid from '../SettingsPositionGrid.vue';

const options = [
  { id: 'left', label: 'Left', icon: Icon },
  { id: 'right', label: 'Right', icon: Icon }
];

function mountGrid(props: Record<string, unknown> = {}) {
  return mount(SettingsPositionGrid, {
    props: { modelValue: 'left', options, ...props },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('SettingsPositionGrid', () => {
  it('renders one button per option', () => {
    const wrapper = mountGrid();
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.text())).toEqual(['Left', 'Right']);
    expect(wrapper.findAll('[data-testid="icon"]')).toHaveLength(2);
  });

  it('highlights the selected option', () => {
    const wrapper = mountGrid({ modelValue: 'right' });

    expect(wrapper.findAll('button')[1].classes()).toContain('border-primary');
    expect(wrapper.findAll('button')[0].classes()).toContain('border-transparent');
  });

  it('emits the selected id', async () => {
    const wrapper = mountGrid();

    await wrapper.findAll('button')[1].trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['right']]);
  });

  it('uses two columns by default and four when requested', () => {
    expect(mountGrid().get('.grid').classes()).toContain('grid-cols-2');
    expect(mountGrid({ columns: 3 }).get('.grid').classes()).toContain('grid-cols-2');
    expect(mountGrid({ columns: 4 }).get('.grid').classes()).toContain('grid-cols-4');
  });

  it('shows the selected label when provided', () => {
    const wrapper = mountGrid({ selectedLabel: 'Left side' });

    expect(wrapper.text()).toContain('settings.selected');
    expect(wrapper.text()).toContain('Left side');
  });

  it('hides the selected label when absent', () => {
    expect(mountGrid().find('p').exists()).toBe(false);
  });

  it('keeps a preview marker overlay', () => {
    expect(mountGrid().find('.border-dashed').exists()).toBe(true);
  });
});
