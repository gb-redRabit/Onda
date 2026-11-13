import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn()
}));

import ToolWindowShell from '../ToolWindowShell.vue';

const Icon = defineComponent({ name: 'ToolIcon', template: '<i data-testid="tool-icon" />' });

function mountShell(props: Record<string, unknown> = {}) {
  return mount(ToolWindowShell, {
    props: { title: 'Tool', ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ToolIcon: Icon }
    },
    slots: {
      actions: '<button data-testid="action">A</button>',
      default: '<div data-testid="content">Body</div>',
      footer: '<button data-testid="footer">F</button>'
    }
  });
}

beforeEach(() => {
  h.invoke.mockReset().mockResolvedValue(undefined);
  h.on.mockReset().mockReturnValue(() => {});
  (window as unknown as { api: unknown }).api = { invoke: h.invoke, on: h.on };
  document.title = '';
});

describe('ToolWindowShell', () => {
  it('renders the title, icon and slots', () => {
    const wrapper = mountShell({ icon: Icon });

    expect(wrapper.find('[data-testid="tool-window-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Tool');
    expect(wrapper.find('[data-testid="tool-icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="action"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="footer"]').exists()).toBe(true);
    expect(document.title).toBe('Tool');
  });

  it('omits the footer slot and icon when absent', () => {
    const wrapper = mount(ToolWindowShell, {
      props: { title: 'Tool' },
      global: { mocks: { $t: (key: string) => key } }
    });

    expect(wrapper.find('footer').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tool-icon"]').exists()).toBe(false);
  });

  it('minimizes, maximizes and closes through IPC', async () => {
    const wrapper = mountShell();

    await wrapper.get('[aria-label="window.minimize"]').trigger('click');
    await wrapper.get('[aria-label="window.maximize"]').trigger('click');
    await wrapper.get('[aria-label="window.close"]').trigger('click');

    expect(h.invoke.mock.calls.map(([channel]) => channel)).toEqual([
      'window:minimize',
      'window:maximize',
      'window:close'
    ]);
  });

  it('closes with Ctrl+W and prevents the browser default', () => {
    const wrapper = mountShell();
    const event = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, cancelable: true });

    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(h.invoke).toHaveBeenCalledWith('window:close');
    wrapper.unmount();
  });

  it('ignores other shortcuts', () => {
    mountShell();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', cancelable: true }));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'q', ctrlKey: true, cancelable: true })
    );

    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('tracks the maximized state from the main process', async () => {
    const wrapper = mountShell();
    const listener = h.on.mock.calls[0][1] as (value: unknown) => void;

    listener(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="window.maximize"]').exists()).toBe(true);

    listener(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="window.maximize"]').exists()).toBe(true);
  });

  it('updates the document title when the prop changes', async () => {
    const wrapper = mountShell();

    await wrapper.setProps({ title: 'Renamed' });

    expect(document.title).toBe('Renamed');
  });

  it('renders a status message with tone classes', () => {
    const busy = mountShell({ status: { tone: 'busy', text: 'Working' } });
    expect(busy.get('[data-testid="tool-window-status"]').text()).toBe('Working');
    expect(busy.get('[data-testid="tool-window-status"]').attributes('aria-live')).toBe('polite');
    expect(busy.get('[data-testid="tool-window-status"]').classes()).toContain(
      'text-base-content/70'
    );

    expect(
      mountShell({ status: { tone: 'error', text: 'Failed' } })
        .get('[data-testid="tool-window-status"]')
        .classes()
    ).toContain('text-error');
    expect(
      mountShell({ status: { tone: 'success', text: 'Done' } })
        .get('[data-testid="tool-window-status"]')
        .classes()
    ).toContain('text-success');
    expect(
      mountShell({ status: { tone: 'idle', text: 'Idle' } })
        .get('[data-testid="tool-window-status"]')
        .classes()
    ).toContain('text-base-content/55');
  });

  it('hides the status without text', () => {
    expect(
      mountShell({ status: { tone: 'idle', text: '' } })
        .find('[data-testid="tool-window-status"]')
        .exists()
    ).toBe(false);
    expect(mountShell({ status: null }).find('[data-testid="tool-window-status"]').exists()).toBe(
      false
    );
  });

  it('cleans listeners on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const unsubscribe = vi.fn();
    h.on.mockReturnValue(unsubscribe);
    const wrapper = mountShell();

    wrapper.unmount();

    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('tolerates a missing preload api', () => {
    (window as unknown as { api?: unknown }).api = undefined;

    expect(() => mountShell().unmount()).not.toThrow();
  });
});
