import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { Maximize2, Square } from '@lucide/vue';

const state = vi.hoisted(() => ({
  switching: false,
  switchToCompact: vi.fn()
}));

vi.mock('@renderer/composables/useCompactSwitch', () => ({
  useCompactSwitch: () => ({
    switching: state.switching,
    switchToCompact: state.switchToCompact
  })
}));

import AppMenuWindowControls from '../AppMenuWindowControls.vue';

const global = { mocks: { $t: (key: string) => key } };

function mountControls(isMaximized = false) {
  return mount(AppMenuWindowControls, { props: { isMaximized }, global });
}

beforeEach(() => {
  state.switching = false;
  state.switchToCompact.mockClear();
});

describe('AppMenuWindowControls', () => {
  it('renders compact, minimize, maximize and close buttons', () => {
    const wrapper = mountControls();
    const buttons = wrapper.findAll('button');

    expect(buttons.map((b) => b.attributes('aria-label'))).toEqual([
      'window.compactMode',
      'window.minimize',
      'window.maximize',
      'window.close'
    ]);
    expect(buttons[0].attributes('data-testid')).toBe('window-switch-compact');
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(2);
  });

  it('switches to compact mode', async () => {
    const wrapper = mountControls();

    await wrapper.get('[data-testid="window-switch-compact"]').trigger('click');

    expect(state.switchToCompact).toHaveBeenCalledTimes(1);
  });

  it('disables the compact switch while switching', () => {
    state.switching = true;
    const wrapper = mountControls();

    expect(wrapper.get('[data-testid="window-switch-compact"]').attributes('disabled')).toBe('');
  });

  it('emits minimize, maximize and close', async () => {
    const wrapper = mountControls();
    const buttons = wrapper.findAll('button');

    await buttons[1].trigger('click');
    await buttons[2].trigger('click');
    await buttons[3].trigger('click');

    expect(wrapper.emitted('minimize')).toEqual([[]]);
    expect(wrapper.emitted('maximize')).toEqual([[]]);
    expect(wrapper.emitted('close')).toEqual([[]]);
  });

  it('shows the restore icon when maximized and the maximize icon otherwise', () => {
    const normal = mountControls(false);
    expect(normal.findComponent(Maximize2).exists()).toBe(true);
    expect(normal.findComponent(Square).exists()).toBe(false);

    const maximized = mountControls(true);
    expect(maximized.findComponent(Square).exists()).toBe(true);
    expect(maximized.findComponent(Maximize2).exists()).toBe(false);
  });
});
