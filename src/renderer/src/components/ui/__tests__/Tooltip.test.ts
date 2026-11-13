import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import Tooltip from '../Tooltip.vue';

// Hover/focus tooltip with a configurable delay; Esc and unmount cancel the timer.

function mountTooltip(props: Record<string, unknown> = {}) {
  return mount(Tooltip, {
    props: { text: 'Hint', ...props },
    slots: { default: '<button>trigger</button>' }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Tooltip', () => {
  it('appears after the default delay on hover and hides on leave', async () => {
    const wrapper = mountTooltip();

    await wrapper.trigger('mouseenter');
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);

    vi.advanceTimersByTime(300);
    await nextTick();
    expect(wrapper.find('[role="tooltip"]').text()).toBe('Hint');

    await wrapper.trigger('mouseleave');
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
  });

  it('honours a custom delay and resets it on repeated enters', async () => {
    const wrapper = mountTooltip({ delay: 100 });

    await wrapper.trigger('mouseenter');
    vi.advanceTimersByTime(80);
    await wrapper.trigger('mouseenter');
    vi.advanceTimersByTime(80);
    await nextTick();
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);

    vi.advanceTimersByTime(20);
    await nextTick();
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(true);
  });

  it('shows on focus and hides on blur or Escape', async () => {
    const wrapper = mountTooltip({ delay: 0 });

    await wrapper.trigger('focusin');
    vi.advanceTimersByTime(0);
    await nextTick();
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(true);

    await wrapper.trigger('focusout');
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);

    await wrapper.trigger('focusin');
    vi.advanceTimersByTime(0);
    await nextTick();
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
  });

  it('clears a pending timer on unmount', async () => {
    const wrapper = mountTooltip({ delay: 500 });
    await wrapper.trigger('mouseenter');

    wrapper.unmount();
    vi.advanceTimersByTime(1000);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('hides without a pending timer', async () => {
    const wrapper = mountTooltip();

    await expect(wrapper.trigger('mouseleave')).resolves.toBeUndefined();
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
  });
});
