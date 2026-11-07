import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { computed, nextTick, reactive, ref } from 'vue';
import SettingsView from '../SettingsView.vue';
import { SETTINGS_SECTIONS, SETTINGS_TABS } from '@renderer/utils/settingsNav';

const state = vi.hoisted(() => ({
  settings: null as any,
  ui: null as any,
  prompt: null as any,
  nav: null as any,
  invoke: vi.fn(),
  pipPreviewStop: vi.fn(),
  audioPipPreviewStop: vi.fn(),
  waitForSettingElement: vi.fn(),
  highlight: vi.fn(),
  loggerError: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/composables/usePromptDialog', () => ({ usePromptDialog: () => state.prompt }));
vi.mock('@renderer/composables/useSettingsNav', () => ({ useSettingsNav: () => state.nav }));
vi.mock('@renderer/utils/settingsDefaults', () => ({ bindSettingsStore: vi.fn() }));
vi.mock('@renderer/utils/settingsHighlight', () => ({
  waitForSettingElement: state.waitForSettingElement,
  highlightSettingsElement: state.highlight
}));
vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));
vi.mock('@renderer/components/settings/lazySettingsTabs', async () => {
  const { SETTINGS_TABS: tabs } = await import('@renderer/utils/settingsNav');
  const components: Record<string, unknown> = {};
  for (const tab of tabs) {
    components[tab.id] = { template: `<div data-testid="tab-body">${tab.id}</div>` };
  }
  return { SETTINGS_TAB_COMPONENTS: components };
});

const PageHeaderStub = {
  props: ['title', 'subtitle', 'icon', 'compact'],
  template: '<header><slot name="actions" /><slot name="overlay" /><slot /></header>'
};
const RailStub = {
  props: ['sections', 'tabs', 'activeSection', 'activeTab'],
  emits: ['select-section', 'select-tab', 'reset'],
  template: '<aside data-testid="settings-rail" />'
};
const EmptyStub = {
  props: ['title', 'icon'],
  template: '<div data-testid="empty">{{ title }}</div>'
};
const PromptStub = {
  props: ['visible', 'isConfirm', 'message', 'value'],
  emits: ['confirm', 'cancel'],
  template: '<div data-testid="prompt" />'
};

let wrapper: VueWrapper | null = null;

function mountView() {
  wrapper = mount(SettingsView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        PageHeader: PageHeaderStub,
        SettingsRail: RailStub,
        EmptyState: EmptyStub,
        ExplorerPromptDialog: PromptStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await nextTick();
}

function searchInput() {
  return wrapper!.get('[data-testid="settings-search"]');
}

async function typeSearch(text: string): Promise<void> {
  const input = searchInput();
  (input.element as HTMLInputElement).value = text;
  await input.trigger('input');
}

function menu() {
  return wrapper!.findAll('[data-testid="settings-menu"]')[0];
}

function menuExists(): boolean {
  return wrapper!.findAll('[data-testid="settings-menu"]').length > 0;
}

async function openMenu(): Promise<void> {
  await wrapper!.get('[data-testid="settings-more"]').trigger('click');
  await nextTick();
  await nextTick();
}

async function menuAction(id: string): Promise<void> {
  await openMenu();
  await wrapper!.get(`[data-testid="${id}"]`).trigger('click');
  await flush();
}

beforeEach(() => {
  state.settings = reactive({
    resetToDefaults: vi.fn(),
    applyImported: vi.fn()
  });
  state.ui = { notify: vi.fn() };
  state.prompt = {
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    showConfirm: vi.fn(async () => true),
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
  const nav: any = {
    activeSection: ref<string | null>(null),
    activeTab: ref<string | null>(null),
    search: ref(''),
    selectTab: vi.fn(),
    goHome: vi.fn(),
    goBackToSection: vi.fn()
  };
  nav.selectTab.mockImplementation((id: string) => {
    nav.activeTab.value = id;
    const tab = SETTINGS_TABS.find((item) => item.id === id);
    if (tab) nav.activeSection.value = tab.section;
  });
  nav.goHome.mockImplementation(() => {
    nav.activeSection.value = null;
    nav.activeTab.value = null;
  });
  nav.goBackToSection.mockImplementation(() => {
    nav.activeTab.value = null;
  });
  nav.activeSectionItem = computed(() =>
    SETTINGS_SECTIONS.find((section) => section.id === nav.activeSection.value)
  );
  state.nav = nav;

  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ success: true });
  state.pipPreviewStop.mockReset();
  state.pipPreviewStop.mockResolvedValue(undefined);
  state.audioPipPreviewStop.mockReset();
  state.audioPipPreviewStop.mockResolvedValue(undefined);
  state.waitForSettingElement.mockReset();
  state.waitForSettingElement.mockResolvedValue(null);
  state.highlight.mockClear();
  state.loggerError.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    pipPreviewStop: state.pipPreviewStop,
    audioPipPreviewStop: state.audioPipPreviewStop
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('overview and navigation', () => {
  it('renders every section and tab in the overview', () => {
    mountView();

    expect(wrapper!.findAll('[data-testid="settings-overview"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid^="settings-section-header-"]')).toHaveLength(
      SETTINGS_SECTIONS.length
    );
    expect(wrapper!.findAll('[data-testid^="settings-overview-"]')).toHaveLength(
      SETTINGS_TABS.length
    );
    expect(wrapper!.findAll('[data-testid="settings-rail"]')).toHaveLength(0);
  });

  it('opens a tab card with its section', async () => {
    mountView();
    await wrapper!.get('[data-testid="settings-overview-theme"]').trigger('click');

    expect(state.nav.selectTab).toHaveBeenCalledWith('theme');
    expect(state.nav.activeSection.value).toBe('appearance');
    expect(wrapper!.get('[data-testid="tab-body"]').text()).toBe('theme');
    expect(wrapper!.findAll('[data-testid="settings-rail"]')).toHaveLength(1);
  });

  it('opens the first tab from a section header', async () => {
    mountView();
    await wrapper!.get('[data-testid="settings-section-header-network"]').trigger('click');

    expect(state.nav.selectTab).toHaveBeenCalledWith('network');
    expect(state.nav.activeSection.value).toBe('network');
  });

  it('handles rail navigation and reset', async () => {
    state.nav.activeTab.value = 'playback';
    state.nav.activeSection.value = 'playback';
    mountView();
    const rail = wrapper!.findComponent(RailStub);

    rail.vm.$emit('select-tab', 'network');
    await nextTick();
    expect(state.nav.activeTab.value).toBe('network');

    rail.vm.$emit('select-section', 'downloads');
    await nextTick();
    expect(state.nav.selectTab).toHaveBeenCalledWith('download');

    state.prompt.showConfirm.mockResolvedValueOnce(false);
    rail.vm.$emit('reset');
    await flush();
    expect(state.settings.resetToDefaults).not.toHaveBeenCalled();
  });

  it('opens the first tab for a section deep link', async () => {
    state.nav.activeSection.value = 'appearance';
    mountView();
    await flush();
    expect(state.nav.selectTab).toHaveBeenCalledWith('theme');
  });

  it('renders the active tab header, breadcrumbs and body', async () => {
    state.nav.activeTab.value = 'playback';
    state.nav.activeSection.value = 'playback';
    mountView();

    expect(wrapper!.text()).toContain('settings.playback');
    expect(wrapper!.text()).toContain('settings.tabDesc.playback');
    expect(wrapper!.get('[data-testid="tab-body"]').text()).toBe('playback');

    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'settings.sectionPlayback')!
      .trigger('click');
    expect(state.nav.goBackToSection).toHaveBeenCalled();
  });

  it('returns to the overview from the breadcrumb', async () => {
    state.nav.activeTab.value = 'playback';
    state.nav.activeSection.value = 'playback';
    mountView();

    await wrapper!.get('[data-testid="settings-breadcrumb-home"]').trigger('click');
    expect(state.nav.goHome).toHaveBeenCalled();
    await nextTick();
    expect(wrapper!.findAll('[data-testid="settings-overview"]')).toHaveLength(1);
  });

  it('omits the section crumb when the section is unknown', () => {
    state.nav.activeTab.value = 'playback';
    state.nav.activeSection.value = null;
    mountView();

    expect(wrapper!.findAll('nav button')).toHaveLength(1);
    expect(wrapper!.get('[data-testid="tab-body"]').text()).toBe('playback');
  });
});

describe('search', () => {
  it('lists field hits and jumps to the matching element', async () => {
    const element = document.createElement('div');
    element.id = 'setting-language';
    element.scrollIntoView = vi.fn();
    document.body.appendChild(element);
    state.waitForSettingElement.mockResolvedValue(element);
    mountView();

    await typeSearch('language');
    const hits = wrapper!.findAll('[data-testid="settings-search-hit"]');
    expect(hits.length).toBeGreaterThan(0);
    expect(wrapper!.text()).toContain('settings.language');
    expect(wrapper!.text()).toContain('settings.general');
    expect(wrapper!.text()).toContain('settings.searchField');

    await hits[0].get('button').trigger('click');
    await flush();
    expect(state.waitForSettingElement).toHaveBeenCalledWith('setting-language');
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(state.highlight).toHaveBeenCalledWith(element);
    expect(state.nav.search.value).toBe('');
    expect(state.nav.activeTab.value).toBe('general');
  });

  it('opens the first hit on Enter and skips missing elements', async () => {
    mountView();
    await typeSearch('language');
    state.waitForSettingElement.mockResolvedValueOnce(null);

    await searchInput().trigger('keydown', { key: 'Enter' });
    await flush();
    expect(state.nav.activeTab.value).toBe('general');
    expect(state.highlight).not.toHaveBeenCalled();
  });

  it('clears the query on Escape and blurs the input', async () => {
    mountView();
    await typeSearch('language');
    const blur = vi.spyOn(searchInput().element as HTMLInputElement, 'blur');

    await searchInput().trigger('keydown', { key: 'Escape' });
    expect(state.nav.search.value).toBe('');
    expect(blur).toHaveBeenCalled();
  });

  it('shows an empty state for no matches', async () => {
    mountView();
    await typeSearch('zzzzzz-no-match');

    expect(wrapper!.findAll('[data-testid="settings-search-hit"]')).toHaveLength(0);
    expect(wrapper!.get('[data-testid="empty"]').text()).toBe('settings.noResults');
  });

  it('includes tab hits without the field badge', async () => {
    mountView();
    await typeSearch('about');

    expect(wrapper!.text()).toContain('settings.about');
    expect(wrapper!.text()).not.toContain('settings.searchField');
  });

  it('ignores Enter when there are no hits', async () => {
    mountView();
    await typeSearch('zzzzzz-no-match');
    await searchInput().trigger('keydown', { key: 'Enter' });
    await flush();
    expect(state.nav.selectTab).not.toHaveBeenCalled();
  });
});

describe('more menu', () => {
  it('toggles the menu and focuses the first item', async () => {
    mountView();
    expect(menuExists()).toBe(false);

    await openMenu();
    expect(menuExists()).toBe(true);
    expect(wrapper!.get('[data-testid="settings-more"]').attributes('aria-expanded')).toBe('true');

    const items = menu().findAll('[role="menuitem"]');
    expect(document.activeElement).toBe(items[0].element);
  });

  it('navigates items with the keyboard and closes on Escape', async () => {
    mountView();
    await openMenu();
    const menuEl = menu();
    const items = menuEl.findAll('[role="menuitem"]');

    await menuEl.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1].element);
    await menuEl.trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0].element);
    await menuEl.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1].element);
    await menuEl.trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(items[0].element);

    await menuEl.trigger('keydown', { key: 'Escape' });
    expect(menuExists()).toBe(false);
  });

  it('closes on outside clicks and document Escape but not inside clicks', async () => {
    mountView();
    await openMenu();

    menu().element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    expect(menuExists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    expect(menuExists()).toBe(false);

    await openMenu();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(menuExists()).toBe(false);
  });

  it('ignores document events while the menu is closed', async () => {
    mountView();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menuExists()).toBe(false);
  });
});

describe('header actions', () => {
  it('exports successfully and reports failures', async () => {
    mountView();
    await menuAction('settings-export');
    expect(state.invoke).toHaveBeenCalledWith('settings:export');
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'settings.exportSuccess');
    expect(menuExists()).toBe(false);

    state.ui.notify.mockClear();
    state.invoke.mockResolvedValueOnce({ success: false, error: 'disk full' });
    await menuAction('settings-export');
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'settings.exportError', 'disk full');

    state.ui.notify.mockClear();
    state.invoke.mockResolvedValueOnce({ success: false, canceled: true });
    await menuAction('settings-export');
    expect(state.ui.notify).not.toHaveBeenCalled();
  });

  it('logs export errors', async () => {
    state.invoke.mockRejectedValueOnce(new Error('boom'));
    mountView();
    await menuAction('settings-export');
    expect(state.loggerError).toHaveBeenCalledWith('Settings', 'export failed', expect.any(Error));
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'settings.exportError');
  });

  it('imports data and reports failures or cancellation', async () => {
    state.invoke.mockResolvedValueOnce({ success: true, data: { theme: 'dark' } });
    mountView();
    await menuAction('settings-import');
    expect(state.settings.applyImported).toHaveBeenCalledWith({ theme: 'dark' });
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'settings.importSuccess');

    state.ui.notify.mockClear();
    state.invoke.mockResolvedValueOnce({ success: false, error: 'bad file' });
    await menuAction('settings-import');
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'settings.importError', 'bad file');

    state.ui.notify.mockClear();
    state.invoke.mockResolvedValueOnce({ success: false, canceled: true });
    await menuAction('settings-import');
    expect(state.ui.notify).not.toHaveBeenCalled();
  });

  it('logs import errors', async () => {
    state.invoke.mockRejectedValueOnce(new Error('bad'));
    mountView();
    await menuAction('settings-import');
    expect(state.loggerError).toHaveBeenCalledWith('Settings', 'import failed', expect.any(Error));
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'settings.importError');
  });

  it('resets only after confirmation', async () => {
    mountView();
    await menuAction('settings-reset-menu');
    expect(state.prompt.showConfirm).toHaveBeenCalledWith('settings.resetConfirm');
    expect(state.settings.resetToDefaults).toHaveBeenCalled();
    expect(state.ui.notify).toHaveBeenCalledWith(
      'success',
      'settings.reset',
      'settings.importSuccess'
    );

    state.settings.resetToDefaults.mockClear();
    state.ui.notify.mockClear();
    state.prompt.showConfirm.mockResolvedValueOnce(false);
    await menuAction('settings-reset-menu');
    expect(state.settings.resetToDefaults).not.toHaveBeenCalled();
    expect(state.ui.notify).not.toHaveBeenCalled();
  });

  it('stops the PiP previews when leaving their tabs', async () => {
    state.nav.activeTab.value = 'playback';
    state.nav.activeSection.value = 'playback';
    mountView();

    state.nav.activeTab.value = 'pip-video';
    await nextTick();
    expect(state.pipPreviewStop).not.toHaveBeenCalled();

    state.nav.activeTab.value = 'pip-audio';
    await flush();
    expect(state.pipPreviewStop).toHaveBeenCalled();

    state.nav.activeTab.value = 'theme';
    await flush();
    expect(state.audioPipPreviewStop).toHaveBeenCalled();
  });

  it('logs PiP preview stop failures', async () => {
    state.nav.activeTab.value = 'pip-video';
    state.nav.activeSection.value = 'playback';
    state.pipPreviewStop.mockRejectedValueOnce(new Error('no window'));
    mountView();

    state.nav.activeTab.value = 'theme';
    await flush();
    expect(state.loggerError).toHaveBeenCalledWith('Settings', 'pipPreviewStop', expect.any(Error));

    state.nav.activeTab.value = 'pip-audio';
    await flush();
    state.audioPipPreviewStop.mockRejectedValueOnce(new Error('no audio'));
    state.nav.activeTab.value = 'theme';
    await flush();
    expect(state.loggerError).toHaveBeenCalledWith(
      'Settings',
      'audioPipPreviewStop',
      expect.any(Error)
    );
  });

  it('wires the prompt dialog events', () => {
    state.prompt.promptVisible.value = true;
    mountView();

    const prompt = wrapper!.findComponent(PromptStub);
    expect(prompt.props('visible')).toBe(true);
    prompt.vm.$emit('confirm');
    prompt.vm.$emit('cancel');
    expect(state.prompt.promptConfirm).toHaveBeenCalled();
    expect(state.prompt.promptCancel).toHaveBeenCalled();
  });
});
