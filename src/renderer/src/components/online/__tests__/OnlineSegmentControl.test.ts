import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const Icon = defineComponent({
  name: 'FakeIcon',
  props: { size: { type: Number } },
  template: '<i data-testid="icon" />'
});

import OnlineSegmentControl from '../OnlineSegmentControl.vue';

function mountControl(modelValue: string, options: unknown[]) {
  return mount(OnlineSegmentControl, { props: { modelValue, options: options as never } });
}

describe('OnlineSegmentControl', () => {
  it('renders option labels and marks the active value', () => {
    const wrapper = mountControl('b', [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' }
    ]);
    const buttons = wrapper.findAll('button');

    expect(buttons.map((b) => b.text())).toEqual(['Alpha', 'Beta']);
    expect(buttons[1].classes()).toContain('text-base-content');
    expect(buttons[0].classes()).toContain('text-base-content/50');
  });

  it('normalizes plain string options', () => {
    const wrapper = mountControl('x', ['x', 'y']);

    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['x', 'y']);
  });

  it('renders option icons when provided', () => {
    const wrapper = mountControl('a', [{ value: 'a', label: 'A', icon: Icon }]);

    expect(wrapper.find('[data-testid="icon"]').exists()).toBe(true);
  });

  it('disables individual options', () => {
    const wrapper = mountControl('a', [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true }
    ]);

    expect(wrapper.findAll('button')[1].attributes('disabled')).toBe('');
  });

  it('emits the selected value', async () => {
    const wrapper = mountControl('a', [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' }
    ]);

    await wrapper.findAll('button')[1].trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['b']]);
  });
});
