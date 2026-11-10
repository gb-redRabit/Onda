import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  ui: null as any,
  settings: null as any,
  removeNotification: vi.fn(),
  run: vi.fn()
}));

vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => h.ui }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));

import ToastNotification from '../ToastNotification.vue';

let wrapper: VueWrapper | null = null;

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    type: 'info',
    title: 'Title',
    message: 'Message',
    ...overrides
  };
}

function setup() {
  wrapper = mount(ToastNotification, {
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function toasts() {
  return wrapper!.findAll('[data-testid="toast"]');
}

beforeEach(() => {
  h.removeNotification.mockReset();
  h.run.mockReset();
  h.ui = reactive({
    notifications: [] as Array<Record<string, unknown>>,
    removeNotification: h.removeNotification
  });
  h.settings = reactive({
    toast: {
      showSuccess: true,
      showWarning: true,
      showInfo: true,
      position: 'bottom-right'
    }
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('filtering', () => {
  it('keeps errors and hides disabled categories', () => {
    h.settings.toast.showSuccess = false;
    h.settings.toast.showWarning = false;
    h.settings.toast.showInfo = false;
    h.ui.notifications = [
      notification({ id: 'success', type: 'success' }),
      notification({ id: 'warning', type: 'warning' }),
      notification({ id: 'info', type: 'info' }),
      notification({ id: 'error', type: 'error' })
    ];
    setup();

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].attributes('data-toast-type')).toBe('error');
  });

  it('keeps every category when enabled', () => {
    h.ui.notifications = [
      notification({ id: 'success', type: 'success' }),
      notification({ id: 'warning', type: 'warning' }),
      notification({ id: 'info', type: 'info' }),
      notification({ id: 'error', type: 'error' })
    ];
    setup();

    expect(toasts().map((toast) => toast.attributes('data-toast-type'))).toEqual([
      'success',
      'warning',
      'info',
      'error'
    ]);
  });

  it('renders nothing without notifications', () => {
    setup();
    expect(toasts()).toHaveLength(0);
  });
});

describe('rendering', () => {
  it('applies the configured position classes and falls back to bottom-right', async () => {
    setup();
    expect(wrapper!.get('[role="status"]').classes()).toEqual(
      expect.arrayContaining(['bottom-16', 'right-4'])
    );

    h.settings.toast.position = 'top-left';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[role="status"]').classes()).toEqual(
      expect.arrayContaining(['top-16', 'left-4'])
    );

    h.settings.toast.position = 'somewhere';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[role="status"]').classes()).toEqual(
      expect.arrayContaining(['bottom-16', 'right-4'])
    );
  });

  it('renders title, message and icon colours', async () => {
    h.ui.notifications = [
      notification({ id: 's', type: 'success', title: 'Saved', message: 'Done' }),
      notification({ id: 'w', type: 'warning', title: 'Warn', message: '' }),
      notification({ id: 'e', type: 'error', title: 'Oops' }),
      notification({ id: 'i', type: 'info', title: 'Info' })
    ];
    setup();

    expect(toasts()[0].text()).toContain('Saved');
    expect(toasts()[0].text()).toContain('Done');
    expect(toasts()[0].find('svg').classes()).toContain('text-success');
    expect(toasts()[1].find('svg').classes()).toContain('text-warning');
    expect(toasts()[2].find('svg').classes()).toContain('text-error');
    expect(toasts()[3].find('svg').classes()).toContain('text-primary-text');
    expect(toasts()[1].text()).not.toContain('Message');
  });

  it('marks only errors as alerts', () => {
    h.ui.notifications = [
      notification({ id: 'e', type: 'error' }),
      notification({ id: 'i', type: 'info' })
    ];
    setup();

    expect(toasts()[0].attributes('role')).toBe('alert');
    expect(toasts()[1].attributes('role')).toBeUndefined();
  });

  it('runs actions and dismisses the toast', async () => {
    h.ui.notifications = [
      notification({
        id: 'a',
        type: 'info',
        action: { label: 'Open', run: h.run }
      })
    ];
    setup();

    await wrapper!
      .findAll('button')
      .find((button) => button.text() === 'Open')!
      .trigger('click');

    expect(h.run).toHaveBeenCalled();
    expect(h.removeNotification).toHaveBeenCalledWith('a');
  });

  it('dismisses from the close button', async () => {
    h.ui.notifications = [notification({ id: 'x' })];
    setup();

    await wrapper!.get('[aria-label="common.close"]').trigger('click');

    expect(h.removeNotification).toHaveBeenCalledWith('x');
  });
});
