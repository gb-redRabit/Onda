import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import AppMenuViewActions from '../AppMenuViewActions.vue';

function mountActions(props: { show: boolean; shortcut: string }) {
  return mount(AppMenuViewActions, {
    props,
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('AppMenuViewActions', () => {
  it('renders nothing when hidden', () => {
    expect(
      mountActions({ show: false, shortcut: 'Ctrl+K' })
        .find('[data-testid="titlebar-search"]')
        .exists()
    ).toBe(false);
  });

  it('renders the search button with the shortcut', () => {
    const wrapper = mountActions({ show: true, shortcut: 'Ctrl+K' });
    const button = wrapper.get('[data-testid="titlebar-search"]');

    expect(button.attributes('aria-label')).toBe('menu.search');
    expect(button.attributes('title')).toBe('menu.search (Ctrl+K)');
    expect(button.text()).toContain('menu.search');
    expect(button.find('kbd').text()).toBe('Ctrl+K');
  });

  it('omits the shortcut when empty', () => {
    const wrapper = mountActions({ show: true, shortcut: '' });

    expect(wrapper.get('[data-testid="titlebar-search"]').attributes('title')).toBe('menu.search');
    expect(wrapper.find('kbd').exists()).toBe(false);
  });

  it('emits search on click', async () => {
    const wrapper = mountActions({ show: true, shortcut: 'Ctrl+K' });

    await wrapper.get('[data-testid="titlebar-search"]').trigger('click');

    expect(wrapper.emitted('search')).toEqual([[]]);
  });
});
