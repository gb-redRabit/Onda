import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { SETTINGS_SECTIONS as sections, SETTINGS_TABS as tabs } from '@renderer/utils/settingsNav';

// Section/tab navigation + search filtering for the settings view. The view
// destructures the returned refs/actions back into the same names.
export function useSettingsNav() {
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();

  const activeSection = ref<string | null>(null);
  const activeTab = ref<string | null>(null);
  const search = ref('');

  function sectionOfTab(tabId: string): string | null {
    return tabs.find((item) => item.id === tabId)?.section ?? null;
  }

  // Deep links (`/settings?tab=dependencies`) must also work while the settings
  // view is already open: the missing-dependencies banner points here from the
  // settings screen itself, where only the query changes and the view is not
  // re-created. A tab without an explicit section reveals its section too, so the
  // sidebar shows where the user landed.
  function applyRouteQuery(): void {
    const requestedTab = typeof route.query.tab === 'string' ? route.query.tab : null;
    const tab = requestedTab === 'systemInfo' ? 'diagnostics' : requestedTab;
    const section = typeof route.query.section === 'string' ? route.query.section : null;
    if (requestedTab === 'systemInfo') {
      activeSection.value = 'system';
      activeTab.value = 'diagnostics';
      void router.replace({ query: { section: 'system', tab: 'diagnostics' } });
      return;
    }
    if (section) {
      activeSection.value = section;
      activeTab.value = tab;
      return;
    }
    if (tab) {
      activeSection.value = sectionOfTab(tab);
      activeTab.value = tab;
      return;
    }
    activeSection.value = null;
    activeTab.value = null;
  }

  applyRouteQuery();
  watch(() => [route.query.tab, route.query.section], applyRouteQuery);

  const query = computed(() => search.value.trim().toLowerCase());

  const sectionTabs = computed(() => {
    if (!activeSection.value) return [];
    const q = query.value;
    return tabs.filter((item) => {
      if (item.section !== activeSection.value) return false;
      if (!q) return true;
      return t(item.labelKey).toLowerCase().includes(q);
    });
  });

  const isOverview = computed(() => !activeSection.value && !activeTab.value);

  const activeSectionItem = computed(() => sections.find((s) => s.id === activeSection.value));

  // Keep the URL in sync with the visible tab/section (`replace`: browsing the
  // settings must not flood the history), so a later banner/menu link always
  // changes the query and the watcher above picks it up.
  function selectSection(id: string) {
    activeSection.value = id;
    activeTab.value = null;
    void router.replace({ query: { section: id } });
  }

  function selectTab(id: string) {
    activeTab.value = id;
    const section = sectionOfTab(id) ?? activeSection.value;
    void router.replace({ query: section ? { section, tab: id } : { tab: id } });
  }

  function goBackToSection() {
    activeTab.value = null;
    void router.replace({ query: activeSection.value ? { section: activeSection.value } : {} });
  }

  function goHome() {
    activeSection.value = null;
    activeTab.value = null;
    void router.replace({ query: {} });
  }

  return {
    sections,
    activeSection,
    activeTab,
    search,
    query,
    sectionTabs,
    isOverview,
    activeSectionItem,
    selectSection,
    selectTab,
    goBackToSection,
    goHome
  };
}
