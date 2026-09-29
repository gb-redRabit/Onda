<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Search,
  X,
  Settings,
  MoreHorizontal,
  RotateCcw,
  FileDown,
  FileUp,
  CornerDownLeft
} from '@lucide/vue';
import { logger } from '@shared/logger';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import SettingsRail from '@renderer/components/settings/SettingsRail.vue';
import { SETTINGS_TAB_COMPONENTS } from '@renderer/components/settings/lazySettingsTabs';
import { SETTINGS_SECTIONS, SETTINGS_TABS } from '@renderer/utils/settingsNav';
import { SETTINGS_CATALOG, type SettingsCatalogEntry } from '@renderer/utils/settingsCatalog';
import { bindSettingsStore } from '@renderer/utils/settingsDefaults';
import { useSettingsNav } from '@renderer/composables/useSettingsNav';
import PageHeader from '@renderer/components/ui/PageHeader.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';

const settings = useSettingsStore();
const ui = useUIStore();
const { t } = useI18n();
bindSettingsStore(settings);

const {
  promptVisible,
  promptIsConfirm,
  promptMessage,
  promptValue,
  showConfirm,
  promptConfirm,
  promptCancel
} = usePromptDialog();

const { activeSection, activeTab, search, selectTab } = useSettingsNav();

const searchInput = ref<HTMLInputElement | null>(null);
const menuOpen = ref(false);
const highlightedId = ref<string | null>(null);

// ---- Search ------------------------------------------------------------------
// Matches the tab labels/descriptions and the field catalog (label + keywords),
// so "proxy" or "głośność" jumps straight to the field instead of a card.
interface SearchHit {
  kind: 'tab' | 'field';
  id: string;
  label: string;
  tab: string;
  description?: string;
}

const query = computed(() => search.value.trim().toLowerCase());

const hits = computed<SearchHit[]>(() => {
  const q = query.value;
  if (!q) return [];
  const tabLabel = (id: string) => {
    const tab = SETTINGS_TABS.find((item) => item.id === id);
    return tab ? t(tab.labelKey) : id;
  };
  const tabHits: SearchHit[] = SETTINGS_TABS.filter((tab) =>
    t(tab.labelKey).toLowerCase().includes(q)
  ).map((tab) => ({ kind: 'tab', id: tab.id, label: t(tab.labelKey), tab: tab.id }));

  const fieldHits: SearchHit[] = SETTINGS_CATALOG.filter((entry: SettingsCatalogEntry) => {
    const haystack =
      `${t(entry.labelKey)} ${entry.keywords.join(' ')} ${tabLabel(entry.tab)}`.toLowerCase();
    return haystack.includes(q);
  }).map((entry) => ({
    kind: 'field',
    id: entry.id,
    label: t(entry.labelKey),
    tab: entry.tab,
    description: tabLabel(entry.tab)
  }));

  return [...fieldHits.slice(0, 24), ...tabHits.slice(0, 8)];
});

async function openHit(hit: SearchHit): Promise<void> {
  search.value = '';
  await openTab(hit.tab);
  if (hit.kind === 'field') {
    await nextTick();
    const el = document.getElementById(hit.id);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    highlightedId.value = hit.id;
    window.setTimeout(() => {
      if (highlightedId.value === hit.id) highlightedId.value = null;
    }, 1600);
  }
}

async function openTab(tabId: string): Promise<void> {
  const tab = SETTINGS_TABS.find((item) => item.id === tabId);
  if (tab) activeSection.value = tab.section;
  selectTab(tabId);
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    search.value = '';
    searchInput.value?.blur();
    return;
  }
  if (event.key === 'Enter' && hits.value.length) {
    void openHit(hits.value[0]);
  }
}

// ---- Header actions ----------------------------------------------------------
async function onReset() {
  const ok = await showConfirm(t('settings.resetConfirm'));
  if (!ok) return;
  settings.resetToDefaults();
  ui.notify('success', t('settings.reset'), t('settings.importSuccess'));
}

async function onExport() {
  try {
    const result = await window.api?.invoke('settings:export');
    if (result?.success) {
      ui.notify('success', t('settings.exportSuccess'));
    } else if (result && !result.canceled) {
      ui.notify('error', t('settings.exportError'), result.error);
    }
  } catch (e) {
    logger.error('Settings', 'export failed', e);
    ui.notify('error', t('settings.exportError'));
  }
}

async function onImport() {
  try {
    const result = await window.api?.invoke('settings:import');
    if (result?.success && result.data) {
      settings.applyImported(result.data);
      ui.notify('success', t('settings.importSuccess'));
    } else if (result && !result.canceled) {
      ui.notify('error', t('settings.importError'), result.error);
    }
  } catch (e) {
    logger.error('Settings', 'import failed', e);
    ui.notify('error', t('settings.importError'));
  }
}

function onMenuAction(action: 'export' | 'import' | 'reset'): void {
  menuOpen.value = false;
  if (action === 'export') void onExport();
  else if (action === 'import') void onImport();
  else void onReset();
}

// ---- Misc --------------------------------------------------------------------
const activeTabLabel = computed(() => {
  const tab = SETTINGS_TABS.find((item) => item.id === activeTab.value);
  return tab ? t(tab.labelKey) : '';
});

watch(activeTab, (_newTab, oldTab) => {
  if (oldTab === 'pip-video') {
    window.api?.pipPreviewStop().catch((err) => logger.error('Settings', 'pipPreviewStop', err));
  }
  if (oldTab === 'pip-audio') {
    window.api
      ?.audioPipPreviewStop()
      .catch((err) => logger.error('Settings', 'audioPipPreviewStop', err));
  }
});

onMounted(() => {
  if (!activeTab.value) {
    const first = SETTINGS_TABS.find(
      (tab) => tab.section === (activeSection.value ?? 'appearance')
    );
    if (first) activeSection.value = first.section;
    if (!activeTab.value && first) selectTab(first.id);
  }
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header: title + search + rare actions under ⋯ -->
    <PageHeader :title="t('settings.title')" :icon="Settings" compact class="shrink-0">
      <template #actions>
        <div class="relative ml-2 w-[min(42vw,24rem)]">
          <Search
            :size="14"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 pointer-events-none"
          />
          <input
            ref="searchInput"
            v-model="search"
            :placeholder="t('settings.searchSettings')"
            class="w-full pl-9 pr-8 h-9 rounded-field bg-base-200 border border-base-300 text-[13px] text-base-content outline-none transition-all placeholder:text-base-content/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
            data-testid="settings-search"
            @keydown="onSearchKeydown"
          />
          <button
            v-if="search"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            :aria-label="t('common.close')"
            @click="search = ''"
          >
            <X :size="13" />
          </button>
        </div>

        <div class="ml-auto flex items-center gap-1.5 shrink-0">
          <button
            class="ui-icon-button fx-noise fx-depth"
            :title="t('settings.more')"
            :aria-label="t('settings.more')"
            :aria-expanded="menuOpen"
            data-testid="settings-more"
            @click="menuOpen = !menuOpen"
          >
            <MoreHorizontal :size="16" />
          </button>
        </div>
      </template>

      <!-- Rare actions: export / import / reset -->
      <template #overlay>
        <div
          v-if="menuOpen"
          class="absolute right-6 top-full z-30 mt-1 w-56 rounded-box border border-base-300 bg-base-100 fx-depth p-1.5 text-[13px]"
          data-testid="settings-menu"
        >
          <button
            class="flex items-center gap-2 w-full px-2.5 h-8 rounded-field text-left hover:bg-base-content/10 transition-colors"
            data-testid="settings-export"
            @click="onMenuAction('export')"
          >
            <FileDown :size="14" />{{ t('settings.export') }}
          </button>
          <button
            class="flex items-center gap-2 w-full px-2.5 h-8 rounded-field text-left hover:bg-base-content/10 transition-colors"
            data-testid="settings-import"
            @click="onMenuAction('import')"
          >
            <FileUp :size="14" />{{ t('settings.import') }}
          </button>
          <div class="my-1 h-px bg-base-300" />
          <button
            class="flex items-center gap-2 w-full px-2.5 h-8 rounded-field text-left text-error hover:bg-error/10 transition-colors"
            data-testid="settings-reset-menu"
            @click="onMenuAction('reset')"
          >
            <RotateCcw :size="14" />{{ t('settings.reset') }}
          </button>
        </div>
      </template>
    </PageHeader>

    <div class="flex flex-1 min-h-0">
      <SettingsRail
        :sections="SETTINGS_SECTIONS"
        :tabs="SETTINGS_TABS"
        :active-section="activeSection"
        :active-tab="activeTab"
        @select-section="
          (id) => {
            const first = SETTINGS_TABS.find((tab) => tab.section === id);
            if (first) openTab(first.id);
          }
        "
        @select-tab="openTab"
        @reset="onReset"
      />

      <main class="flex-1 min-w-0 overflow-auto">
        <!-- Search results -->
        <div v-if="query" class="px-6 py-5">
          <EmptyState v-if="!hits.length" :title="t('settings.noResults')" :icon="Search" />
          <ul v-else class="space-y-0.5">
            <li v-for="hit in hits" :key="hit.id" data-testid="settings-search-hit">
              <button
                class="flex items-center gap-3 w-full px-3 py-2 rounded-field text-left hover:bg-base-content/5 transition-colors"
                @click="openHit(hit)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block text-[13px] text-base-content truncate">{{ hit.label }}</span>
                  <span
                    v-if="hit.description"
                    class="block text-[11px] text-base-content/45 truncate"
                  >
                    {{ hit.description }}
                  </span>
                </span>
                <span
                  v-if="hit.kind === 'field'"
                  class="shrink-0 text-[10px] uppercase tracking-wider text-base-content/35"
                >
                  {{ t('settings.searchField') }}
                </span>
                <CornerDownLeft :size="13" class="shrink-0 text-base-content/30" />
              </button>
            </li>
          </ul>
        </div>

        <!-- Active tab -->
        <div v-else :key="'tab-' + activeTab" class="px-6 py-4">
          <h2 class="text-lg font-bold tracking-tight mb-1">{{ activeTabLabel }}</h2>
          <component :is="SETTINGS_TAB_COMPONENTS[activeTab ?? '']" :highlight="highlightedId" />
        </div>
      </main>
    </div>

    <ExplorerPromptDialog
      v-if="promptVisible"
      :visible="promptVisible"
      :is-confirm="promptIsConfirm"
      :message="promptMessage"
      :value="promptValue"
      @confirm="promptConfirm"
      @cancel="promptCancel"
    />
  </div>
</template>
