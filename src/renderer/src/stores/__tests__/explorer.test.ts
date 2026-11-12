import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useExplorerStore } from '../explorer';
import { useSettingsStore } from '../settings';
import { VIEW_MODES } from '@renderer/types/explorer';
import type { FileItem } from '@renderer/types/explorer';

function setupStore() {
  const store = useExplorerStore();
  store.addTab('/a');
  store.addTab('/b');
  store.addTab('/c');
  return store;
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('explorer reorderTab', () => {
  it('moves a tab to a later position', () => {
    const store = setupStore();
    store.reorderTab(0, 2);
    expect(store.tabs.map((t) => t.path)).toEqual(['/b', '/c', '/a']);
  });

  it('moves a tab to an earlier position', () => {
    const store = setupStore();
    store.reorderTab(2, 0);
    expect(store.tabs.map((t) => t.path)).toEqual(['/c', '/a', '/b']);
  });

  it('is a no-op when from === to', () => {
    const store = setupStore();
    store.reorderTab(1, 1);
    expect(store.tabs.map((t) => t.path)).toEqual(['/a', '/b', '/c']);
  });

  it('keeps the active tab following the moved tab', () => {
    const store = setupStore();
    store.switchTab(0);
    store.reorderTab(0, 2);
    expect(store.activeTabIndex).toBe(2);
    expect(store.tabs[2].path).toBe('/a');
  });

  it('adjusts active index when moving a non-active tab across it', () => {
    const store = setupStore();
    store.switchTab(1); // aktywna = '/b'
    store.reorderTab(2, 0); // '/c' przeniesiona na przód
    expect(store.tabs.map((t) => t.path)).toEqual(['/c', '/a', '/b']);
    expect(store.activeTabIndex).toBe(2);
  });
});

describe('explorer drive list vs drive root', () => {
  it('treats the empty path as the drive list', () => {
    const store = useExplorerStore();
    store.navigateTo('');
    expect(store.isDriveList).toBe(true);
    expect(store.canGoUp).toBe(false);
  });

  it('treats a drive root as a regular folder listing', () => {
    const store = useExplorerStore();
    store.navigateTo('D:\\Music');
    expect(store.isDriveList).toBe(false);

    store.goUp();
    expect(store.currentPath).toBe('D:');
    expect(store.isDriveList).toBe(false);
    expect(store.canGoUp).toBe(true);
  });

  it('goes up from a drive root back to the drive list', () => {
    const store = useExplorerStore();
    store.navigateTo('D:\\Music');
    store.goUp(); // D:\Music -> D:
    store.goUp(); // D: -> lista dysków

    expect(store.currentPath).toBe('');
    expect(store.isDriveList).toBe(true);
    expect(store.canGoUp).toBe(false);
  });
});

function file(path: string): FileItem {
  return {
    name: path,
    path,
    isDirectory: false,
    size: 1,
    modifiedAt: 0,
    createdAt: 0,
    extension: 'mp3',
    mimeType: 'audio/mpeg'
  };
}

describe('explorer history', () => {
  it('walks back and forward through visited folders', () => {
    const store = useExplorerStore();
    store.navigateTo('/a');
    store.navigateTo('/b');
    store.navigateTo('/c');

    expect(store.canGoBack).toBe(true);
    expect(store.canGoForward).toBe(false);

    store.goBack();
    expect(store.currentPath).toBe('/b');
    expect(store.canGoForward).toBe(true);

    store.goForward();
    expect(store.currentPath).toBe('/c');
  });

  it('does nothing at the ends of the history', () => {
    const store = useExplorerStore();

    store.goUp();
    expect(store.currentPath).toBe('');

    store.goBack();
    expect(store.currentPath).toBe('');

    store.navigateTo('/only');
    store.goForward();
    expect(store.currentPath).toBe('/only');
  });

  it('drops forward history when navigating from the past', () => {
    const store = useExplorerStore();
    store.navigateTo('/a');
    store.navigateTo('/b');
    store.navigateTo('/c');
    store.goBack();

    store.navigateTo('/d');

    expect(store.history).toEqual(['/a', '/b', '/d']);
    expect(store.historyIndex).toBe(2);
    expect(store.canGoForward).toBe(false);
  });

  it('clears the selection when navigating', () => {
    const store = useExplorerStore();
    store.files = [file('/a/one.mp3')];
    store.selectAll();
    expect(store.selectedCount).toBe(1);

    store.navigateTo('/b');

    expect(store.selectedCount).toBe(0);
  });
});

describe('explorer selection', () => {
  it('toggles, selects all and clears paths', () => {
    const store = useExplorerStore();
    store.files = [file('/a/one.mp3'), file('/a/two.mp3')];

    store.toggleSelect('/a/one.mp3');
    expect(store.selectedFiles.has('/a/one.mp3')).toBe(true);
    store.toggleSelect('/a/one.mp3');
    expect(store.selectedFiles.has('/a/one.mp3')).toBe(false);

    store.selectAll();
    expect(store.selectedCount).toBe(2);

    store.clearSelection();
    expect(store.selectedCount).toBe(0);
  });
});

describe('explorer view and sorting', () => {
  it('cycles view modes in both directions', () => {
    const store = useExplorerStore();
    store.setViewMode(VIEW_MODES[0]);

    store.prevViewMode();
    expect(store.viewMode).toBe(VIEW_MODES[VIEW_MODES.length - 1]);

    store.nextViewMode();
    expect(store.viewMode).toBe(VIEW_MODES[0]);

    store.setViewMode('details');
    expect(store.viewMode).toBe('details');
  });

  it('toggles the order of the active field and switches fields', () => {
    const store = useExplorerStore();
    store.toggleSort('name');
    const firstOrder = store.sortOrder;
    store.toggleSort('name');
    expect(store.sortOrder).not.toBe(firstOrder);

    store.toggleSort('size');
    expect(store.sortBy).toBe('size');
    expect(store.sortOrder).toBe('asc');
  });

  it('persists view mode and sorting changes', async () => {
    const store = useExplorerStore();
    const settings = useSettingsStore();

    store.setViewMode('large');
    await nextTick();
    expect(settings.explorer.viewMode).toBe('large');

    store.toggleSort('size');
    await nextTick();
    expect(settings.explorer.sortBy).toBe('size');
    expect(settings.explorer.sortOrder).toBe('asc');

    store.toggleSort('size');
    await nextTick();
    expect(settings.explorer.sortOrder).toBe('desc');
  });

  it('shows the raw order while files are loading', () => {
    const store = useExplorerStore();
    store.files = [file('/b.mp3'), file('/a.mp3')];
    store.isLoading = true;

    expect(store.sortedFiles.map((item) => item.path)).toEqual(['/b.mp3', '/a.mp3']);

    store.isLoading = false;
    expect(store.sortedFiles.map((item) => item.path)).toEqual(['/a.mp3', '/b.mp3']);
  });
});
