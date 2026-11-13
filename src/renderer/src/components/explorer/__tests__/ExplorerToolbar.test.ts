import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import ExplorerToolbar from '../ExplorerToolbar.vue';

function mountToolbar() {
  return mount(ExplorerToolbar, {
    global: { mocks: { $t: (key: string) => key } }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExplorerToolbar', () => {
  it('debounces search input', async () => {
    const wrapper = mountToolbar();
    const input = wrapper.get('[data-testid="explorer-search"]');

    await input.setValue('a');
    await vi.advanceTimersByTimeAsync(149);
    expect(wrapper.emitted('search')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted('search')).toEqual([['a']]);
  });

  it('restarts the debounce on every keystroke', async () => {
    const wrapper = mountToolbar();
    const input = wrapper.get('[data-testid="explorer-search"]');

    await input.setValue('a');
    await vi.advanceTimersByTimeAsync(100);
    await input.setValue('ab');
    await vi.advanceTimersByTimeAsync(149);
    expect(wrapper.emitted('search')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted('search')).toEqual([['ab']]);
  });

  it('shows the clear button only with a query and clears it', async () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('[aria-label="common.clear"]').exists()).toBe(false);

    await wrapper.get('[data-testid="explorer-search"]').setValue('query');
    const clear = wrapper.find('[aria-label="common.clear"]');
    expect(clear.exists()).toBe(true);

    await clear.trigger('click');

    expect((wrapper.get('[data-testid="explorer-search"]').element as HTMLInputElement).value).toBe(
      ''
    );
    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.emitted('search')).toEqual([['']]);
  });

  it('renders the placeholder', () => {
    expect(mountToolbar().get('[data-testid="explorer-search"]').attributes('placeholder')).toBe(
      'explorer.search'
    );
  });
});
