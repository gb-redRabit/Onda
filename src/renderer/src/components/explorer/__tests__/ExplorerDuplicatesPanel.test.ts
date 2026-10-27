import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { reactive, nextTick } from 'vue';

const h = vi.hoisted(() => ({
  explorer: {} as { currentPath: string; loadFiles: (path: string) => void },
  invoke: vi.fn()
}));

vi.mock('@renderer/stores/explorer', () => ({
  useExplorerStore: () => h.explorer
}));

import ExplorerDuplicatesPanel from '../ExplorerDuplicatesPanel.vue';

function mountPanel(open = false) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: {} },
    missingWarn: false,
    fallbackWarn: false
  });
  return mount(ExplorerDuplicatesPanel, {
    props: { open },
    global: {
      plugins: [i18n],
      directives: { activate: {} },
      stubs: { Loader: true }
    }
  });
}

describe('ExplorerDuplicatesPanel', () => {
  beforeEach(() => {
    h.explorer = reactive({ currentPath: '/music/a', loadFiles: vi.fn() });
    h.invoke.mockReset();
    h.invoke.mockResolvedValue([]);
    Object.defineProperty(window, 'api', {
      value: { invoke: h.invoke },
      configurable: true
    });
  });

  it('scans the current folder when opened', async () => {
    const wrapper = mountPanel(false);
    await wrapper.setProps({ open: true });
    await flushPromises();

    expect(h.invoke).toHaveBeenCalledWith('fs:findDuplicates', '/music/a');
  });

  it('rescans when the folder changes while open', async () => {
    const wrapper = mountPanel(false);
    await wrapper.setProps({ open: true });
    await flushPromises();
    h.invoke.mockClear();

    h.explorer.currentPath = '/music/b';
    await nextTick();
    await flushPromises();

    expect(h.invoke).toHaveBeenCalledWith('fs:findDuplicates', '/music/b');
  });

  it('does not scan while closed', async () => {
    mountPanel(false);
    await flushPromises();
    h.invoke.mockClear();

    h.explorer.currentPath = '/music/b';
    await nextTick();
    await flushPromises();

    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('ignores a stale response from a previous folder', async () => {
    let resolveA: (value: unknown) => void = () => {};
    let resolveB: (value: unknown) => void = () => {};
    h.invoke
      .mockImplementationOnce(() => new Promise((resolve) => (resolveA = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveB = resolve)));

    const wrapper = mountPanel(false);
    await wrapper.setProps({ open: true });
    await flushPromises();

    h.explorer.currentPath = '/music/b';
    await nextTick();
    await flushPromises();

    resolveB([{ original: '/music/b/dup.mp3', duplicates: ['/music/b/x.mp3'] }]);
    await flushPromises();
    resolveA([{ original: '/music/a/dup.mp3', duplicates: ['/music/a/x.mp3'] }]);
    await flushPromises();

    const originals = wrapper
      .findAll('[data-original]')
      .map((el) => el.attributes('data-original'));
    expect(originals).toEqual(['/music/b/dup.mp3']);
  });
});
