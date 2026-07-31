import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useExplorerStore } from '../explorer';

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
    store.switchTab(1); // active = '/b'
    store.reorderTab(2, 0); // '/c' moved to front
    expect(store.tabs.map((t) => t.path)).toEqual(['/c', '/a', '/b']);
    expect(store.activeTabIndex).toBe(2);
  });
});
