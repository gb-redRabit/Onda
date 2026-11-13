import { describe, expect, it, vi } from 'vitest';
import { createExplorerTabs } from '../explorer-tabs';

// Explorer tab state: opening, closing, switching and reordering must keep both
// the tab list and its active index consistent, and switching drives navigation.

function setup() {
  const navigate = vi.fn();
  const tabs = createExplorerTabs(navigate);
  return { ...tabs, navigate };
}

function open(store: ReturnType<typeof setup>, paths: string[]) {
  for (const path of paths) store.addTab(path);
}

describe('addTab', () => {
  it('appends a new tab and activates it', () => {
    const store = setup();

    store.addTab('/music');

    expect(store.tabs.value).toHaveLength(1);
    expect(store.tabs.value[0]!.path).toBe('/music');
    expect(store.tabs.value[0]!.label).toBeTruthy();
    expect(store.activeTabIndex.value).toBe(0);
    expect(store.navigate).toHaveBeenLastCalledWith('/music');
  });

  it('switches to an existing tab instead of duplicating it', () => {
    const store = setup();
    open(store, ['/a', '/b']);

    store.addTab('/a');

    expect(store.tabs.value.map((t) => t.path)).toEqual(['/a', '/b']);
    expect(store.activeTabIndex.value).toBe(0);
    expect(store.navigate).toHaveBeenLastCalledWith('/a');
  });

  it('opens a second tab for the path that is already active', () => {
    const store = setup();
    open(store, ['/a']);

    store.addTab('/a');

    expect(store.tabs.value.map((t) => t.path)).toEqual(['/a', '/a']);
    expect(store.activeTabIndex.value).toBe(1);
  });
});

describe('closeTab', () => {
  it('keeps the last remaining tab', () => {
    const store = setup();
    open(store, ['/a']);

    store.closeTab(0);

    expect(store.tabs.value).toHaveLength(1);
  });

  it('activates the tab that slides into the closed position', () => {
    const store = setup();
    open(store, ['/a', '/b', '/c']);
    store.switchTab(1);

    store.closeTab(1);

    expect(store.tabs.value.map((t) => t.path)).toEqual(['/a', '/c']);
    expect(store.activeTabIndex.value).toBe(1);
    expect(store.navigate).toHaveBeenLastCalledWith('/c');
  });

  it('clamps to the new last tab when closing the rightmost active tab', () => {
    const store = setup();
    open(store, ['/a', '/b', '/c']);

    store.closeTab(2);

    expect(store.activeTabIndex.value).toBe(1);
    expect(store.navigate).toHaveBeenLastCalledWith('/b');
  });

  it('shifts the active index left when a tab before it closes', () => {
    const store = setup();
    open(store, ['/a', '/b', '/c']);

    store.closeTab(0);

    expect(store.activeTabIndex.value).toBe(1);
    expect(store.tabs.value.map((t) => t.path)).toEqual(['/b', '/c']);
  });

  it('leaves the active index alone when a later tab closes', () => {
    const store = setup();
    open(store, ['/a', '/b', '/c']);
    store.switchTab(0);

    store.closeTab(2);

    expect(store.activeTabIndex.value).toBe(0);
  });
});

describe('switchTab', () => {
  it('ignores out-of-range indices', () => {
    const store = setup();
    open(store, ['/a']);
    store.navigate.mockClear();

    store.switchTab(-1);
    store.switchTab(5);

    expect(store.activeTabIndex.value).toBe(0);
    expect(store.navigate).not.toHaveBeenCalled();
  });
});

describe('reorderTab', () => {
  it('moves the active tab and keeps it active', () => {
    const store = setup();
    open(store, ['/a', '/b', '/c']);
    store.switchTab(0);

    store.reorderTab(0, 2);

    expect(store.tabs.value.map((t) => t.path)).toEqual(['/b', '/c', '/a']);
    expect(store.activeTabIndex.value).toBe(2);
  });

  it('decrements the active index when a tab moves over it from the left', () => {
    const store = setup();
    open(store, ['/a', '/b', '/c']);

    store.reorderTab(0, 2);

    expect(store.activeTabIndex.value).toBe(1);
  });

  it('increments the active index when the active tab is before the target', () => {
    const store = setup();
    open(store, ['/a', '/b', '/c']);
    store.switchTab(1);

    store.reorderTab(2, 1);

    expect(store.tabs.value.map((t) => t.path)).toEqual(['/a', '/c', '/b']);
    expect(store.activeTabIndex.value).toBe(2);
  });

  it('keeps the active index when the active tab is outside the move', () => {
    const store = setup();
    open(store, ['/a', '/b', '/c', '/d']);
    store.switchTab(3);

    store.reorderTab(1, 2);

    expect(store.tabs.value.map((t) => t.path)).toEqual(['/a', '/c', '/b', '/d']);
    expect(store.activeTabIndex.value).toBe(3);
  });

  it('ignores invalid or no-op moves', () => {
    const store = setup();
    open(store, ['/a', '/b']);
    const before = [...store.tabs.value];

    store.reorderTab(-1, 1);
    store.reorderTab(0, 5);
    store.reorderTab(0, 0);

    expect(store.tabs.value).toEqual(before);
  });
});

describe('syncActiveTab', () => {
  it('rewrites the active tab path and label', () => {
    const store = setup();
    open(store, ['/a']);
    const oldLabel = store.tabs.value[0]!.label;

    store.syncActiveTab('/b');

    expect(store.tabs.value[0]!.path).toBe('/b');
    expect(store.tabs.value[0]!.label).not.toBe(oldLabel);
  });

  it('does nothing without an active tab', () => {
    const store = setup();

    store.syncActiveTab('/a');

    expect(store.tabs.value).toEqual([]);
  });
});
