import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { reactive, nextTick } from 'vue';

const h = vi.hoisted(() => ({
  explorer: {} as { currentPath: string; loadFiles: (path: string) => void },
  invoke: vi.fn(),
  confirm: vi.fn(async () => true)
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
      stubs: { Loader: true },
      provide: { showConfirm: h.confirm }
    }
  });
}

describe('ExplorerDuplicatesPanel', () => {
  beforeEach(() => {
    h.explorer = reactive({ currentPath: '/music/a', loadFiles: vi.fn() });
    h.invoke.mockReset();
    h.invoke.mockResolvedValue([]);
    h.confirm.mockReset();
    h.confirm.mockResolvedValue(true);
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

const groups = [
  { original: '/music/a/keep.mp3', duplicates: ['/music/a/dup1.mp3', '/music/a/dup2.mp3'] }
];

async function openWithGroups() {
  h.invoke.mockResolvedValue(groups);
  const wrapper = mountPanel(false);
  await wrapper.setProps({ open: true });
  await flushPromises();
  return wrapper;
}

describe('ExplorerDuplicatesPanel results', () => {
  beforeEach(() => {
    h.explorer = reactive({ currentPath: '/music/a', loadFiles: vi.fn() });
    h.invoke.mockReset();
    h.invoke.mockResolvedValue([]);
    h.confirm.mockReset();
    h.confirm.mockResolvedValue(true);
    Object.defineProperty(window, 'api', {
      value: { invoke: h.invoke },
      configurable: true
    });
  });

  it('skips the scan when no folder is open', async () => {
    h.explorer.currentPath = '';
    const wrapper = mountPanel(false);

    await wrapper.setProps({ open: true });
    await flushPromises();

    expect(h.invoke).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('explorer.duplicatesNone');
  });

  it('falls back to the empty state when the scan fails', async () => {
    h.invoke.mockRejectedValue(new Error('boom'));
    const wrapper = mountPanel(false);

    await wrapper.setProps({ open: true });
    await flushPromises();

    expect(wrapper.text()).toContain('explorer.duplicatesNone');
  });

  it('renders groups, basenames and duplicated files', async () => {
    const wrapper = await openWithGroups();

    expect(wrapper.text()).toContain('explorer.duplicatesFound');
    expect(wrapper.text()).toContain('keep.mp3');
    expect(wrapper.text()).toContain('explorer.duplicatesOriginal');
    expect(wrapper.findAll('[data-testid="explorer-duplicate-check"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('dup1.mp3');
    expect(wrapper.text()).toContain('dup2.mp3');
  });

  it('reveals original and duplicate files', async () => {
    const wrapper = await openWithGroups();

    await wrapper.get('[data-original="/music/a/keep.mp3"] > div:first-child').trigger('click');
    await wrapper
      .findAll('span')
      .find((span) => span.text() === 'dup1.mp3')!
      .trigger('click');

    expect(wrapper.emitted('reveal')).toEqual([['/music/a/keep.mp3'], ['/music/a/dup1.mp3']]);
  });

  it('toggles duplicate selections without revealing', async () => {
    const wrapper = await openWithGroups();
    const checkbox = wrapper.findAll('[data-testid="explorer-duplicate-check"]')[0];

    await checkbox.trigger('click');
    expect((checkbox.element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.emitted('reveal')).toBeUndefined();

    await checkbox.trigger('click');
    expect((checkbox.element as HTMLInputElement).checked).toBe(false);
  });

  it('selects all duplicates and deletes them after confirmation', async () => {
    const wrapper = await openWithGroups();
    const deleteButton = wrapper.get('[data-testid="explorer-duplicates-delete"]');
    expect(deleteButton.attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="explorer-duplicates-select-all"]').trigger('click');
    expect(deleteButton.attributes('disabled')).toBeUndefined();
    expect(deleteButton.text()).toContain('explorer.duplicatesDelete');

    h.invoke.mockResolvedValue([]);
    await deleteButton.trigger('click');
    await flushPromises();

    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('fs:delete', '/music/a/dup1.mp3');
    expect(h.invoke).toHaveBeenCalledWith('fs:delete', '/music/a/dup2.mp3');
    expect(h.invoke).toHaveBeenCalledWith('fs:findDuplicates', '/music/a');
    expect(h.explorer.loadFiles).toHaveBeenCalledWith('/music/a');
  });

  it('keeps files when the confirmation is cancelled', async () => {
    h.confirm.mockResolvedValue(false);
    const wrapper = await openWithGroups();

    await wrapper.get('[data-testid="explorer-duplicates-select-all"]').trigger('click');
    await wrapper.get('[data-testid="explorer-duplicates-delete"]').trigger('click');
    await flushPromises();

    expect(h.invoke).not.toHaveBeenCalledWith('fs:delete', expect.anything());
    expect(h.explorer.loadFiles).not.toHaveBeenCalled();
  });

  it('shows the scanning state and closes the panel', async () => {
    let resolveScan: (value: unknown) => void = () => {};
    h.invoke.mockImplementation(() => new Promise((resolve) => (resolveScan = resolve)));
    const wrapper = mountPanel(false);

    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(wrapper.text()).toContain('explorer.duplicatesScanning');

    resolveScan([]);
    await flushPromises();
    await wrapper.get('[data-testid="explorer-duplicates-close"]').trigger('click');

    expect(wrapper.emitted('update:open')).toEqual([[false]]);
  });
});

describe('ExplorerDuplicatesPanel empty deletion', () => {
  it('does nothing when the selection is empty', async () => {
    const wrapper = await openWithGroups();
    const deleteButton = wrapper.get('[data-testid="explorer-duplicates-delete"]');

    deleteButton.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.explorer.loadFiles).not.toHaveBeenCalled();
  });
});
