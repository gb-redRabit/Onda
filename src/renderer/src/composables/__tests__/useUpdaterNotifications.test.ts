import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUIStore } from '@renderer/stores/ui';
import { useUpdaterNotifications } from '../useUpdaterNotifications';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && 'version' in params ? `${key}:${String(params.version)}` : key
  })
}));

let handler: ((payload: unknown) => void) | null = null;

beforeEach(() => {
  setActivePinia(createPinia());
  (window as unknown as { api: unknown }).api = {
    on: vi.fn((channel: string, cb: (payload: unknown) => void) => {
      if (channel === 'updater:event') handler = cb;
      return () => {};
    })
  };
  // The subscription is registered once per module (global listener), so the
  // handler captured in the first test is reused by the remaining ones.
  useUpdaterNotifications();
});

describe('useUpdaterNotifications', () => {
  it('toasts an info notification when an update is available', () => {
    const ui = useUIStore();
    handler!({ event: 'update-available', version: '1.2.3' });

    expect(ui.notifications).toHaveLength(1);
    expect(ui.notifications[0].type).toBe('info');
    expect(ui.notifications[0].title).toBe('settings.updateToastAvailableTitle');
    expect(ui.notifications[0].message).toBe('settings.updateToastAvailableMessage:1.2.3');
  });

  it('toasts a success notification when the update is downloaded', () => {
    const ui = useUIStore();
    handler!({ event: 'update-downloaded', version: '4.5.6' });

    expect(ui.notifications).toHaveLength(1);
    expect(ui.notifications[0].type).toBe('success');
    expect(ui.notifications[0].message).toBe('settings.updateToastReadyMessage:4.5.6');
  });

  it('deduplicates repeated events and ignores non-toast events', () => {
    const ui = useUIStore();
    handler!({ event: 'update-available', version: '9.9.9' });
    handler!({ event: 'update-available', version: '9.9.9' });
    handler!({ event: 'download-progress', percent: 50 });
    handler!({ event: 'error', error: 'boom' });

    expect(ui.notifications).toHaveLength(1);

    handler!({ event: 'update-available', version: '9.9.10' });
    expect(ui.notifications).toHaveLength(2);
  });
});
