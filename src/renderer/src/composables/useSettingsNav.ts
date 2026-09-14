import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { SETTINGS_SECTIONS as sections, SETTINGS_TABS as tabs } from '@renderer/utils/settingsNav';

// Section/tab navigation + search filtering for the settings view. The view
// destructures the returned refs/actions back into the same names.
export function useSettingsNav() {
  const { t } = useI18n();
  const route = useRoute();

  const activeSection = ref<string | null>(null);
  const activeTab = ref<string | null>(null);
  const search = ref('');

  if (typeof route.query.tab === 'string') activeTab.value = route.query.tab;
  if (typeof route.query.section === 'string') activeSection.value = route.query.section;

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

  function selectSection(id: string) {
    activeSection.value = id;
    activeTab.value = null;
  }

  function selectTab(id: string) {
    activeTab.value = id;
  }

  function goBackToSection() {
    activeTab.value = null;
  }

  function goHome() {
    activeSection.value = null;
    activeTab.value = null;
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
