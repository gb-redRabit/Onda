import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { CONTEXT_MENU_WIDTH, useUIStore } from '../ui';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('search modes', () => {
  it('toggles global search', () => {
    const ui = useUIStore();

    expect(ui.searchMode).toBe('closed');
    ui.toggleGlobalSearch();
    expect(ui.searchMode).toBe('global');
    ui.toggleGlobalSearch();
    expect(ui.searchMode).toBe('closed');
  });

  it('toggles view search independently', () => {
    const ui = useUIStore();

    ui.toggleViewSearch();
    expect(ui.searchMode).toBe('view');
    ui.toggleViewSearch();
    expect(ui.searchMode).toBe('closed');
  });

  it('opens and closes search modes', () => {
    const ui = useUIStore();

    ui.openSearch('global');
    expect(ui.searchMode).toBe('global');
    ui.closeSearch();
    expect(ui.searchMode).toBe('closed');

    ui.openSearch('view');
    expect(ui.searchMode).toBe('view');
  });

  it('stores the search query', () => {
    const ui = useUIStore();

    ui.setSearchQuery('lofi');

    expect(ui.searchQuery).toBe('lofi');
  });
});

describe('setup wizard', () => {
  it('opens and closes the wizard', () => {
    const ui = useUIStore();

    expect(ui.setupWizardVisible).toBe(false);
    ui.openSetupWizard();
    expect(ui.setupWizardVisible).toBe(true);
    ui.closeSetupWizard();
    expect(ui.setupWizardVisible).toBe(false);
  });
});

describe('context menu', () => {
  it('shows and hides the menu', () => {
    const ui = useUIStore();
    const items = [{ label: 'Open' }];

    ui.showContextMenu(10, 20, items);
    expect(ui.contextMenu).toEqual({ x: 10, y: 20, items });

    ui.hideContextMenu();
    expect(ui.contextMenu).toBeNull();
    expect(CONTEXT_MENU_WIDTH).toBeGreaterThan(0);
  });
});

describe('notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a notification with default duration', () => {
    const ui = useUIStore();

    ui.notify('info', 'Title', 'Message');

    expect(ui.notifications).toHaveLength(1);
    expect(ui.notifications[0]).toMatchObject({
      type: 'info',
      title: 'Title',
      message: 'Message',
      duration: 5000
    });
  });

  it('keeps a notification when a custom duration is non-positive', () => {
    const ui = useUIStore();

    ui.notify('error', 'Sticky', undefined, 0);

    vi.advanceTimersByTime(100_000);
    expect(ui.notifications).toHaveLength(1);
  });

  it('removes a notification after its duration', () => {
    const ui = useUIStore();
    ui.notify('success', 'Saved', undefined, 1000);

    vi.advanceTimersByTime(999);
    expect(ui.notifications).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ui.notifications).toHaveLength(0);
  });

  it('supports an action and manual removal', () => {
    const ui = useUIStore();
    const run = vi.fn();

    ui.notify('info', 'Undo', undefined, 0, { label: 'Undo', run });
    expect(ui.notifications[0].action).toEqual({ label: 'Undo', run });

    ui.removeNotification(ui.notifications[0].id);
    expect(ui.notifications).toHaveLength(0);
  });

  it('ignores removal of an unknown id', () => {
    const ui = useUIStore();
    ui.notify('warning', 'Warn', undefined, 0);

    ui.removeNotification('missing');

    expect(ui.notifications).toHaveLength(1);
  });
});
