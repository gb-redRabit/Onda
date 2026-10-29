import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Badge from '../Badge.vue';
import SegmentedControl from '../SegmentedControl.vue';
import Tooltip from '../Tooltip.vue';

describe('Badge', () => {
  it('renders the tone and size classes', () => {
    const wrapper = mount(Badge, { props: { tone: 'error', size: 'md' }, slots: { default: '3' } });
    expect(wrapper.text()).toBe('3');
    expect(wrapper.classes()).toContain('text-error');
    expect(wrapper.classes()).toContain('text-[11px]');
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'audio', label: 'Audio' },
    { value: 'video', label: 'Video' }
  ];

  it('marks the active option and emits the clicked one', async () => {
    const wrapper = mount(SegmentedControl, {
      props: { modelValue: 'audio', options, label: 'Type' }
    });

    const buttons = wrapper.findAll('button');
    expect(buttons[0]!.attributes('aria-pressed')).toBe('true');
    expect(buttons[1]!.attributes('aria-pressed')).toBe('false');

    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['video']);
  });
});

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('appears after the delay and hides on leave or Escape', async () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'Close', delay: 200 },
      slots: { default: '<button type="button">X</button>' }
    });

    await wrapper.trigger('mouseenter');
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);

    vi.advanceTimersByTime(200);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="tooltip"]').text()).toBe('Close');

    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
  });
});
