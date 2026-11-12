import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));

const ModalStub = defineComponent({
  name: 'ModalShell',
  props: ['labelledBy', 'panelClass'],
  emits: ['close', 'escape'],
  template: '<div data-testid="modal"><slot /></div>'
});

import PluginPermissionDialog from '../PluginPermissionDialog.vue';

let wrapper: VueWrapper | null = null;

function plugin(overrides: Record<string, unknown> = {}) {
  return {
    name: 'My Plugin',
    version: '1.2.3',
    author: 'Author',
    description: 'A plugin',
    permissions: {},
    hooks: [] as string[],
    layoutElements: [] as Array<Record<string, string>>,
    uiSlots: [] as string[],
    ...overrides
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(PluginPermissionDialog, {
    props: { plugin: plugin(), ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ModalShell: ModalStub }
    }
  });
  return wrapper;
}

beforeEach(() => {
  h.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('header and description', () => {
  it('renders plugin identity', () => {
    setup();

    expect(wrapper!.text()).toContain('plugins.enableConfirmTitle');
    expect(wrapper!.text()).toContain('My Plugin');
    expect(wrapper!.text()).toContain('v1.2.3');
    expect(wrapper!.text()).toContain('Author');
    expect(wrapper!.text()).toContain('A plugin');
  });

  it('omits optional identity fields', () => {
    setup({ plugin: plugin({ version: '', author: '', description: '' }) });

    expect(wrapper!.text()).not.toContain('v');
    expect(wrapper!.text()).not.toContain('Author');
  });

  it('shows the permission review warning', () => {
    setup({ plugin: plugin({ permissionReviewRequired: true }) });
    expect(wrapper!.text()).toContain('plugins.permissionChangedWarning');
  });
});

describe('capabilities', () => {
  it('reports when there are no optional permissions', () => {
    setup();
    expect(wrapper!.text()).toContain('plugins.noOptionalPermissions');
  });

  it('lists every granted capability', () => {
    setup({
      plugin: plugin({
        permissions: {
          storage: true,
          notifications: true,
          player: true,
          visual: true,
          network: { allow: ['https://api.example/*'] }
        }
      })
    });

    expect(wrapper!.text()).toContain('plugins.permissionStorage');
    expect(wrapper!.text()).toContain('plugins.permissionNotifications');
    expect(wrapper!.text()).toContain('plugins.permissionPlayer');
    expect(wrapper!.text()).toContain('plugins.permissionVisual');
    expect(wrapper!.text()).toContain('plugins.permissionNetwork');
    expect(wrapper!.text()).toContain('https://api.example/*');
    expect(wrapper!.text()).toContain('plugins.networkAllowlist');
    expect(wrapper!.text()).not.toContain('plugins.noOptionalPermissions');
  });

  it('ignores empty network allowlists', () => {
    setup({ plugin: plugin({ permissions: { network: { allow: [] } } }) });

    expect(wrapper!.text()).not.toContain('plugins.permissionNetwork');
    expect(wrapper!.text()).not.toContain('plugins.networkAllowlist');
  });
});

describe('hooks and slots', () => {
  it('lists requested hooks', () => {
    setup({ plugin: plugin({ hooks: ['onLoad', 'onPlay'] }) });

    expect(wrapper!.text()).toContain('onLoad');
    expect(wrapper!.text()).toContain('onPlay');
    expect(wrapper!.text()).not.toContain('plugins.noHooksRequested');
  });

  it('reports missing hooks', () => {
    setup();
    expect(wrapper!.text()).toContain('plugins.noHooksRequested');
  });

  it('lists layout elements', () => {
    setup({
      plugin: plugin({
        layoutElements: [
          { element: 'player', variant: 'compact', label: 'Small' },
          { element: 'header', variant: 'wide' }
        ]
      })
    });

    expect(wrapper!.text()).toContain('plugins.requestedVisualSlots');
    expect(wrapper!.text()).toContain('player');
    expect(wrapper!.text()).toContain('compact');
    expect(wrapper!.text()).toContain('Small');
    expect(wrapper!.text()).toContain('header');
  });

  it('omits the layout section when empty', () => {
    setup();
    expect(wrapper!.text()).not.toContain('plugins.requestedVisualSlots');
  });

  it('lists UI slots', () => {
    setup({ plugin: plugin({ uiSlots: ['sidebar', 'statusbar'] }) });

    expect(wrapper!.find('[data-testid="plugin-permission-ui-slots"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('plugins.requestedUiSlots');
    expect(wrapper!.text()).toContain('sidebar');
    expect(wrapper!.text()).toContain('plugins.uiSlotTextOnly');
  });

  it('omits the UI slot section when empty', () => {
    setup();
    expect(wrapper!.find('[data-testid="plugin-permission-ui-slots"]').exists()).toBe(false);
  });
});

describe('closing', () => {
  it('emits cancel from the X, footer button, backdrop and escape', async () => {
    setup();

    await wrapper!.get('[aria-label="common.close"]').trigger('click');
    const cancel = wrapper!
      .findAll('button')
      .find((button) => button.text() === 'plugins.enableCancel')!;
    await cancel.trigger('click');
    wrapper!.findComponent(ModalStub).vm.$emit('close');
    wrapper!.findComponent(ModalStub).vm.$emit('escape');

    expect(wrapper!.emitted('cancel')).toHaveLength(4);
  });

  it('emits confirm from the primary button', async () => {
    setup();
    const confirm = wrapper!
      .findAll('button')
      .find((button) => button.text() === 'plugins.enableConfirm')!;

    await confirm.trigger('click');

    expect(wrapper!.emitted('confirm')).toHaveLength(1);
    expect(wrapper!.emitted('cancel')).toBeUndefined();
  });
});
