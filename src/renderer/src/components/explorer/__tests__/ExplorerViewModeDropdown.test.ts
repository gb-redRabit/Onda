import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const store = vi.hoisted(() => ({
  explorer: null as any
}));

vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => store.explorer }));

import ExplorerViewModeDropdown from '../ExplorerViewModeDropdown.vue';

let wrapper: VueWrapper | null = null;

function mountDropdown(viewMode = 'medium') {
  store.explorer = reactive({
    viewMode,
    setViewMode: vi.fn((mode: string) => {
      store.explorer.viewMode = mode;
    })
  });
  wrapper = mount(ExplorerViewModeDropdown, {
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

beforeEach(() => {
  vi.spyOn(document, 'removeEventListener');
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('ExplorerViewModeDropdown', () => {
  it('starts closed and toggles the menu', async () => {
    const local = mountDropdown();
    const trigger = local.get('[data-testid="explorer-view-mode"]');

    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(local.findAll('[data-testid^="explorer-view-"]')).toHaveLength(1);

    await trigger.trigger('click');

    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(local.findAll('[data-testid^="explorer-view-"]')).toHaveLength(7);
  });

  it('lists every mode and marks the active one', async () => {
    const local = mountDropdown('large');
    await local.get('[data-testid="explorer-view-mode"]').trigger('click');

    const keys = ['extraSmall', 'small', 'medium', 'large', 'extraLarge', 'details'];
    for (const key of keys) {
      expect(local.find(`[data-testid="explorer-view-${key}"]`).exists()).toBe(true);
    }
    expect(local.get('[data-testid="explorer-view-large"]').classes()).toContain(
      'text-primary-text'
    );
    expect(local.get('[data-testid="explorer-view-small"]').classes()).not.toContain(
      'text-primary-text'
    );
  });

  it('selects a mode and closes the menu', async () => {
    const local = mountDropdown();
    await local.get('[data-testid="explorer-view-mode"]').trigger('click');

    await local.get('[data-testid="explorer-view-details"]').trigger('click');

    expect(store.explorer.setViewMode).toHaveBeenCalledWith('details');
    expect(local.get('[data-testid="explorer-view-mode"]').attributes('aria-expanded')).toBe(
      'false'
    );
  });

  it('closes on mouse leave', async () => {
    const local = mountDropdown();
    await local.get('[data-testid="explorer-view-mode"]').trigger('click');

    local
      .get('[data-testid="explorer-view-medium"]')
      .element.parentElement!.dispatchEvent(new MouseEvent('mouseleave'));
    await local.vm.$nextTick();

    expect(local.findAll('[data-testid^="explorer-view-"]')).toHaveLength(1);
  });

  it('closes when clicking outside and stays open inside', async () => {
    const local = mountDropdown();
    await local.get('[data-testid="explorer-view-mode"]').trigger('click');

    local
      .get('[data-testid="explorer-view-mode"]')
      .element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await local.vm.$nextTick();
    expect(local.get('[data-testid="explorer-view-mode"]').attributes('aria-expanded')).toBe(
      'true'
    );

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await local.vm.$nextTick();
    expect(local.get('[data-testid="explorer-view-mode"]').attributes('aria-expanded')).toBe(
      'false'
    );
  });

  it('removes the outside listener on unmount', () => {
    const local = mountDropdown();
    local.unmount();
    wrapper = null;

    expect(document.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
  });
});
