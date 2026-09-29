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

    // The banner pushes /settings?tab=dependencies: same route, new query.
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

    nav.selectTab('download');
    expect(replace).toHaveBeenLastCalledWith({ query: { section: 'network', tab: 'download' } });
    expect(nav.activeTab.value).toBe('download');

    nav.goBackToSection();
    expect(replace).toHaveBeenLastCalledWith({ query: { section: 'network' } });

    nav.goHome();
    expect(replace).toHaveBeenLastCalledWith({ query: {} });
  });
});
