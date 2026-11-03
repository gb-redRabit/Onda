import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const updateStatusBar = vi.hoisted(() => vi.fn());

vi.mock('@renderer/stores/settings', () => ({
  useSettingsStore: () => ({
    statusBar: { visible: true },
    updateStatusBar
  })
}));

import AppMenuViewDropdown from '../AppMenuViewDropdown.vue';

const global = { mocks: { $t: (key: string) => key } };

function mountMenu() {
  return mount(AppMenuViewDropdown, {
    props: { shortcut: () => '' },
    global
  });
}

// Regresja: `@keydown` na pozycjach menu nawigował przy KAŻDYM klawiszu
// (strzałki, Tab, Esc), a na przełączniku paska statusu keydown + click
// przełączały go dwa razy (netto zero).
describe('AppMenuViewDropdown keyboard', () => {
  it('does not navigate on arrow keys', async () => {
    const wrapper = mountMenu();
    const first = wrapper.findAll('[role="menuitem"]')[0];
    await first.trigger('keydown', { key: 'ArrowDown' });
    await first.trigger('keydown', { key: 'Tab' });
    await first.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('navigate')).toBeUndefined();
  });

  it('navigates on click', async () => {
    const wrapper = mountMenu();
    await wrapper.findAll('[role="menuitem"]')[0].trigger('click');
    expect(wrapper.emitted('navigate')).toEqual([['/']]);
  });

  it('toggles the status bar once on click and not on keydown', async () => {
    const wrapper = mountMenu();
    const statusItem = wrapper.findAll('[role="menuitem"]').at(-1)!;
    await statusItem.trigger('keydown', { key: 'Enter' });
    expect(updateStatusBar).not.toHaveBeenCalled();
    await statusItem.trigger('click');
    expect(updateStatusBar).toHaveBeenCalledTimes(1);
    expect(updateStatusBar).toHaveBeenCalledWith({ visible: false });
  });
});
