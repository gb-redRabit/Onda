import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  t: vi.fn((key: string) => key),
  explorer: null as any,
  navigateTo: vi.fn(),
  closeTab: vi.fn(),
  title: vi.fn((path: string) => `title:${path || 'root'}`),
  invoke: vi.fn()
}));

vi.mock('vue-router', () => ({ useRoute: () => ({ query: h.query }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => h.explorer }));
vi.mock('@renderer/utils/explorerTitle', () => ({ explorerWindowTitle: h.title }));

vi.mock('../ExplorerView.vue', async () => {
  const { defineComponent } = await import('vue');
  return {
    default: defineComponent({
      name: 'ExplorerView',
      template: '<div data-testid="explorer-view" />'
    })
  };
});

import ExplorerViewStub from '../ExplorerView.vue';
import ExplorerWindowView from '../ExplorerWindowView.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(ExplorerWindowView, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ExplorerView: ExplorerViewStub }
    }
  });
  return wrapper;
}

function button(label: string) {
  return wrapper!.get(`[aria-label="${label}"]`);
}

beforeEach(() => {
  h.query = {};
  h.t.mockClear();
  h.navigateTo.mockReset();
  h.closeTab.mockReset();
  h.title.mockClear();
  h.invoke.mockReset();
  h.invoke.mockResolvedValue(undefined);
  h.explorer = reactive({
    currentPath: 'D:/music',
    tabs: [{ path: 'D:/music' }],
    activeTabIndex: 0,
    navigateTo: h.navigateTo,
    closeTab: h.closeTab
  });
  (window as unknown as { api?: unknown }).api = { invoke: h.invoke };
  document.title = 'Onda';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  document.title = '';
});

describe('initial path and title', () => {
  it('navigates to the path from the query', () => {
    h.query = { path: 'D:/videos' };
    setup();

    expect(h.navigateTo).toHaveBeenCalledWith('D:/videos');
  });

  it('ignores non-string query paths', () => {
    h.query = { path: ['a', 'b'] };
    setup();
    expect(h.navigateTo).not.toHaveBeenCalled();
  });

  it('reflects the current path in the window title', async () => {
    setup();

    expect(h.title).toHaveBeenCalledWith('D:/music', 'explorer.thisComputer');
    expect(document.title).toBe('title:D:/music');
    expect(wrapper!.get('[data-testid="explorer-window-root"]').text()).toContain('title:D:/music');

    h.explorer.currentPath = '';
    await wrapper!.vm.$nextTick();
    expect(document.title).toBe('title:root');
  });
});

describe('window controls', () => {
  it('sends minimize, maximize and close commands', async () => {
    setup();

    await button('window.minimize').trigger('click');
    await button('window.maximize').trigger('click');
    await button('window.close').trigger('click');

    expect(h.invoke).toHaveBeenCalledWith('window:minimize');
    expect(h.invoke).toHaveBeenCalledWith('window:maximize');
    expect(h.invoke).toHaveBeenCalledWith('window:close');
  });

  it('closes on Ctrl+W and Cmd+W, ignoring other keys', async () => {
    setup();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true }));

    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.invoke).toHaveBeenCalledWith('window:close');
  });

  it('removes the keydown listener on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    setup();

    wrapper!.unmount();
    wrapper = null;

    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});

describe('pin as tab', () => {
  it('sends the path and closes a single-tab window', async () => {
    setup();

    await button('explorer.pinAsTab').trigger('click');

    expect(h.invoke).toHaveBeenCalledWith('explorer:sendTabToMain', 'D:/music');
    expect(h.invoke).toHaveBeenCalledWith('window:close');
    expect(h.closeTab).not.toHaveBeenCalled();
  });

  it('closes only the active tab when several remain', async () => {
    h.explorer.tabs = [{ path: 'a' }, { path: 'b' }];
    h.explorer.activeTabIndex = 1;
    setup();

    await button('explorer.pinAsTab').trigger('click');

    expect(h.closeTab).toHaveBeenCalledWith(1);
    expect(h.invoke).not.toHaveBeenCalledWith('window:close');
  });

  it('does nothing without a current path', async () => {
    h.explorer.currentPath = '';
    setup();

    await button('explorer.pinAsTab').trigger('click');

    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('works without a preload bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    setup();

    await expect(button('window.minimize').trigger('click')).resolves.toBeUndefined();
    await expect(button('explorer.pinAsTab').trigger('click')).resolves.toBeUndefined();
  });
});
