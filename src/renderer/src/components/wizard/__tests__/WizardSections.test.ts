import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any,
  library: null as any,
  auth: { status: null as any, ensureLoaded: vi.fn() }
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => h.library }));
vi.mock('@renderer/composables/useYoutubeAuth', () => ({ useYoutubeAuth: () => h.auth }));

const StepStub = defineComponent({
  name: 'WizardStep',
  props: {
    title: { type: String },
    description: { type: String },
    descriptionGap: { type: Boolean }
  },
  template: '<div data-testid="step">{{ title }}</div>'
});

import WizardSummary from '../WizardSummary.vue';
import WizardAppearance from '../WizardAppearance.vue';
import WizardLibrary from '../WizardLibrary.vue';

function baseState() {
  h.settings = {
    appearance: { theme: 'system' },
    download: { defaultPath: '' },
    updateAppearance: vi.fn()
  };
  h.library = { folders: [], addFolder: vi.fn(), removeFolder: vi.fn() };
  h.auth.status = ref({ loggedIn: false, method: 'none' });
  h.auth.ensureLoaded = vi.fn().mockResolvedValue(undefined);
}

beforeEach(() => {
  baseState();
});

describe('WizardSummary', () => {
  function mountSummary(scanNow = false) {
    return mount(WizardSummary, {
      props: { scanNow },
      global: { mocks: { $t: (key: string) => key }, stubs: { WizardStep: StepStub } }
    });
  }

  it('loads the auth status on mount', () => {
    mountSummary();

    expect(h.auth.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('shows placeholders for empty selections', () => {
    const text = mountSummary().text();

    expect(text).toContain('wizard.noneSelected');
    expect(text).toContain('settings.system');
    expect(text).toContain('wizard.summaryScanOff');
    expect(text).toContain('wizard.summaryOnlineSkipped');
  });

  it('shows selected folders, path and scan state', () => {
    h.library.folders = ['D:/Music', 'E:/Videos'];
    h.settings.download.defaultPath = 'D:/Downloads';
    const text = mountSummary(true).text();

    expect(text).toContain('D:/Music');
    expect(text).toContain('E:/Videos');
    expect(text).toContain('D:/Downloads');
    expect(text).toContain('wizard.summaryScanOn');
  });

  it('does not scan without folders', () => {
    expect(mountSummary(true).text()).toContain('wizard.summaryScanOff');
  });

  it('shows a custom theme and signed-in state', () => {
    h.settings.appearance.theme = 'custom';
    h.auth.status.value = { loggedIn: true, method: 'browser' };
    const text = mountSummary().text();

    expect(text).toContain('settings.custom');
    expect(text).toContain('wizard.summaryOnlineSigned');
  });
});

describe('WizardAppearance', () => {
  function mountAppearance(theme = 'system') {
    h.settings.appearance.theme = theme;
    return mount(WizardAppearance, {
      global: { mocks: { $t: (key: string) => key }, stubs: { WizardStep: StepStub } }
    });
  }

  it('renders a button per built-in theme', () => {
    const wrapper = mountAppearance();
    const buttons = wrapper.findAll('button');

    expect(buttons.length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain('wizard.appearanceTitle');
    expect(wrapper.text()).toContain('wizard.appearanceHint');
  });

  it('marks the active theme', () => {
    const wrapper = mountAppearance('light');
    const active = wrapper.findAll('button').find((b) => b.classes().includes('border-primary'));

    expect(active).toBeDefined();
  });

  it('updates the theme', async () => {
    const wrapper = mountAppearance();
    const button = wrapper.findAll('button')[0];
    const name = button.text();

    await button.trigger('click');

    expect(h.settings.updateAppearance).toHaveBeenCalledWith({ theme: expect.any(String) });
    expect(name).toBeTruthy();
  });
});

describe('WizardLibrary', () => {
  function mountLibrary(scanNow = false) {
    return mount(WizardLibrary, {
      props: { scanNow },
      global: { mocks: { $t: (key: string) => key }, stubs: { WizardStep: StepStub } }
    });
  }

  it('shows the empty state', () => {
    expect(mountLibrary().text()).toContain('wizard.noneSelected');
  });

  it('lists and removes folders', async () => {
    h.library.folders = ['D:/Music'];
    const wrapper = mountLibrary();

    expect(wrapper.text()).toContain('D:/Music');

    await wrapper.get('[aria-label="common.delete"]').trigger('click');

    expect(h.library.removeFolder).toHaveBeenCalledWith('D:/Music');
  });

  it('adds folders from the dialog', async () => {
    const invoke = vi.fn().mockResolvedValue(['D:/New']);
    (window as unknown as { api: { invoke: typeof invoke } }).api = { invoke };
    const wrapper = mountLibrary();
    const add = wrapper.findAll('button').at(-2)!;

    await add.trigger('click');

    expect(invoke).toHaveBeenCalledWith('dialog:openFolder');
    expect(h.library.addFolder).toHaveBeenCalledWith('D:/New');
  });

  it('ignores cancelled or empty selections', async () => {
    const invoke = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    (window as unknown as { api: { invoke: typeof invoke } }).api = { invoke };
    const wrapper = mountLibrary();
    const add = wrapper.findAll('button').at(-2)!;

    await add.trigger('click');
    await add.trigger('click');

    expect(h.library.addFolder).not.toHaveBeenCalled();
  });

  it('swallows dialog errors', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('cancelled'));
    (window as unknown as { api: { invoke: typeof invoke } }).api = { invoke };
    const wrapper = mountLibrary();

    await expect(wrapper.findAll('button').at(-2)!.trigger('click')).resolves.toBeUndefined();
    expect(h.library.addFolder).not.toHaveBeenCalled();
  });

  it('toggles scanning', async () => {
    const wrapper = mountLibrary(false);
    const toggle = wrapper.get('[role="switch"]');

    expect(toggle.attributes('aria-checked')).toBe('false');

    await toggle.trigger('click');

    expect(wrapper.emitted('update:scanNow')).toEqual([[true]]);
  });

  it('shows an enabled scan switch', () => {
    const toggle = mountLibrary(true).get('[role="switch"]');

    expect(toggle.attributes('aria-checked')).toBe('true');
    expect(toggle.classes()).toContain('bg-primary');
  });
});
