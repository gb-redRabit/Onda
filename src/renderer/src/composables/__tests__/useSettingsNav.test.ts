import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';

const route = reactive<{ query: Record<string, string> }>({ query: {} });
const replace = vi.fn(async (to: { query?: Record<string, string> }) => {
  route.query = { ...(to.query ?? {}) };
});

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace })
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const { useSettingsNav } = await import('../useSettingsNav');

beforeEach(() => {
  route.query = {};
  replace.mockClear();
});

describe('useSettingsNav', () => {
  it('opens the tab from a deep link on first mount', () => {
    route.query = { tab: 'dependencies' };
    const nav = useSettingsNav();

    expect(nav.activeTab.value).toBe('dependencies');
    expect(nav.activeSection.value).toBe('system');
  });

  it('switches the tab when only the query changes (banner click while in settings)', async () => {
    route.query = { tab: 'appearance' };
    const nav = useSettingsNav();
    expect(nav.activeTab.value).toBe('appearance');

    // Baner wypycha /settings?tab=dependencies: ta sama trasa, nowe query.
    route.query = { tab: 'dependencies' };
    await nextTick();

    expect(nav.activeTab.value).toBe('dependencies');
    expect(nav.activeSection.value).toBe('system');
  });

  it('resets to the overview when the query is cleared', async () => {
    route.query = { tab: 'dependencies' };
    const nav = useSettingsNav();

    route.query = {};
    await nextTick();

    expect(nav.activeTab.value).toBeNull();
    expect(nav.activeSection.value).toBeNull();
    expect(nav.isOverview.value).toBe(true);
  });

  it('keeps the url in sync when tabs and sections are picked in the ui', async () => {
    const nav = useSettingsNav();

    nav.selectSection('network');
    expect(replace).toHaveBeenLastCalledWith({ query: { section: 'network' } });
    expect(nav.activeTab.value).toBeNull();

    nav.selectTab('network-platform');
    expect(replace).toHaveBeenLastCalledWith({
      query: { section: 'network', tab: 'network-platform' }
    });
    expect(nav.activeTab.value).toBe('network-platform');

    nav.goBackToSection();
    expect(replace).toHaveBeenLastCalledWith({ query: { section: 'network' } });

    nav.goHome();
    expect(replace).toHaveBeenLastCalledWith({ query: {} });
  });

  it('groups the download tabs under their own section', async () => {
    const nav = useSettingsNav();
    for (const id of ['download', 'download-paths', 'download-queue']) {
      nav.selectTab(id);
      await nextTick();
      expect(nav.activeSection.value).toBe('downloads');
    }
  });

  it('redirects the legacy systemInfo deep link to diagnostics', () => {
    route.query = { tab: 'systemInfo' };
    const nav = useSettingsNav();

    expect(nav.activeSection.value).toBe('system');
    expect(nav.activeTab.value).toBe('diagnostics');
    expect(replace).toHaveBeenLastCalledWith({
      query: { section: 'system', tab: 'diagnostics' }
    });
  });

  it('opens a section from the query without selecting a tab', () => {
    route.query = { section: 'network' };
    const nav = useSettingsNav();

    expect(nav.activeSection.value).toBe('network');
    expect(nav.activeTab.value).toBeNull();
    expect(nav.activeSectionItem.value?.id).toBe('network');
  });

  it('ignores non-string query values', () => {
    route.query = { tab: ['x'] as never, section: 7 as never };
    const nav = useSettingsNav();

    expect(nav.activeSection.value).toBeNull();
    expect(nav.activeTab.value).toBeNull();
    expect(nav.isOverview.value).toBe(true);
    expect(nav.sectionTabs.value).toEqual([]);
  });

  it('filters the section tabs by the normalized search query', () => {
    route.query = { section: 'network' };
    const nav = useSettingsNav();
    const target = nav.sectionTabs.value.find((tab) => tab.id === 'network-platform')!;

    nav.search.value = `  ${target.labelKey.toUpperCase()}  `;
    expect(nav.query.value).toBe(target.labelKey.toLowerCase());
    expect(nav.sectionTabs.value.map((tab) => tab.id)).toContain(target.id);
    expect(
      nav.sectionTabs.value.every((tab) => tab.labelKey.toLowerCase().includes(nav.query.value))
    ).toBe(true);

    nav.search.value = 'no-such-tab';
    expect(nav.sectionTabs.value).toEqual([]);
  });

  it('handles unknown tabs and a missing active section when going back', () => {
    const nav = useSettingsNav();

    nav.selectTab('mystery');
    expect(nav.activeTab.value).toBe('mystery');
    expect(replace).toHaveBeenLastCalledWith({ query: { tab: 'mystery' } });

    nav.goBackToSection();
    expect(replace).toHaveBeenLastCalledWith({ query: {} });
  });
});
