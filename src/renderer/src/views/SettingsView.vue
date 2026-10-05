<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
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

function onMenuDocClick(e: MouseEvent): void {
  if (!menuOpen.value) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('[data-testid="settings-more"], [data-testid="settings-menu"]')) return;
  menuOpen.value = false;
}
function onMenuDocKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && menuOpen.value) menuOpen.value = false;
}
const highlightedId = ref<string | null>(null);

// ---- Wyszukiwanie -----------------------------------------------------------
// Dopasowuje etykiety/opisy zakładek oraz katalog pól (etykieta + słowa kluczowe),
// więc "proxy" lub "głośność" przeskakuje prosto do pola zamiast do karty.
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

// Używane przez ekran startowy przeglądu: zakładki należące do sekcji.
function tabsOfSection(sectionId: string) {
  return SETTINGS_TABS.filter((tab) => tab.section === sectionId);
}

// Wybór sekcji w railu otwiera jej pierwszą zakładkę. Logika w typowanej funkcji,
// a nie w inline handlerze szablonu — vue-tsc nie wnioskuje typu parametru zdarzenia
// z inline `(id) => …` i zgłasza wtedy `implicit any`.
function onSelectSection(id: string): void {
  const first = SETTINGS_TABS.find((tab) => tab.section === id);
  if (first) void openTab(first.id);
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

// ---- Akcje nagłówka ---------------------------------------------------------
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

// ---- Różne ------------------------------------------------------------------
const activeTabMeta = computed(
  () => SETTINGS_TABS.find((item) => item.id === activeTab.value) ?? null
);
const activeTabLabel = computed(() => (activeTabMeta.value ? t(activeTabMeta.value.labelKey) : ''));
const activeTabDesc = computed(() => (activeTabMeta.value ? t(activeTabMeta.value.descKey) : ''));

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
  // Link bezpośredni tylko do sekcji (`?section=network`) otwiera pierwszą
  // zakładkę tej sekcji; samo `/settings` trafia teraz na przegląd zamiast
  // dowolnej pierwszej zakładki.
  if (activeSection.value && !activeTab.value) {
    const first = SETTINGS_TABS.find((tab) => tab.section === activeSection.value);
    if (first) selectTab(first.id);
  }
  document.addEventListener('mousedown', onMenuDocClick);
  document.addEventListener('keydown', onMenuDocKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onMenuDocClick);
  document.removeEventListener('keydown', onMenuDocKeydown);
});
</script>

<template>
  <div data-testid="settings-view" class="flex flex-col h-full">
    <!-- Nagłówek: tytuł + wyszukiwanie + rzadkie akcje pod ⋯ -->
    <PageHeader
      :title="t('settings.title')"
      :icon="Settings"
      compact
      class="shrink-0 relative z-30"
    >
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

        <div class="ml-auto flex items-center gap-1.5 shrink-0 relative z-40">
          <button
            class="ui-icon-button fx-noise fx-depth relative z-40"
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

      <!-- Rzadkie akcje: eksport / import / reset -->
      <template #overlay>
        <div
          v-if="menuOpen"
          class="absolute right-6 top-full z-50 mt-1 w-56 rounded-box border border-base-300 bg-base-100 fx-depth p-1.5 text-[13px]"
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
        @select-section="onSelectSection"
        @select-tab="openTab"
        @reset="onReset"
      />

      <main class="flex-1 min-w-0 overflow-auto">
        <!-- Wyniki wyszukiwania -->
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
                    class="block text-[11px] text-base-content/60 truncate"
                  >
                    {{ hit.description }}
                  </span>
                </span>
                <span
                  v-if="hit.kind === 'field'"
                  class="shrink-0 text-[10px] uppercase tracking-wider text-base-content/60"
                >
                  {{ t('settings.searchField') }}
                </span>
                <CornerDownLeft :size="13" class="shrink-0 text-base-content/55" />
              </button>
            </li>
          </ul>
        </div>

        <!-- Przegląd: ekran startowy ze wszystkimi sekcjami i zakładkami -->
        <div v-else-if="!activeTab" class="px-6 py-6 space-y-8" data-testid="settings-overview">
          <section v-for="section in SETTINGS_SECTIONS" :key="section.id">
            <h3
              class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-base-content/60 mb-3"
            >
              <component :is="section.icon" :size="15" class="text-primary" />
              {{ t(section.labelKey) }}
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <button
                v-for="tab in tabsOfSection(section.id)"
                :key="tab.id"
                class="flex items-start gap-3 p-4 fx-depth fx-noise rounded-box bg-base-100 border border-base-300 text-left transition-colors hover:border-primary/40 hover:bg-base-content/5"
                :data-testid="`settings-overview-${tab.id}`"
                @click="openTab(tab.id)"
              >
                <span
                  class="grid place-items-center w-9 h-9 rounded-field bg-primary/10 text-primary shrink-0"
                >
                  <component :is="tab.icon" :size="17" />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium truncate">{{ t(tab.labelKey) }}</span>
                  <span class="block text-xs text-base-content/55 line-clamp-2 mt-0.5">
                    {{ t(tab.descKey) }}
                  </span>
                </span>
              </button>
            </div>
          </section>
        </div>

        <!-- Aktywna zakładka -->
        <div v-else :key="'tab-' + activeTab" class="px-6 py-6">
          <header class="mb-6 flex items-start gap-3">
            <span
              v-if="activeTabMeta"
              class="grid place-items-center w-10 h-10 rounded-box bg-primary/10 text-primary shrink-0"
            >
              <component :is="activeTabMeta.icon" :size="20" />
            </span>
            <div class="min-w-0">
              <h2 class="text-lg font-bold tracking-tight">{{ activeTabLabel }}</h2>
              <p v-if="activeTabDesc" class="text-sm text-base-content/55 mt-0.5">
                {{ activeTabDesc }}
              </p>
            </div>
          </header>
          <div class="space-y-6">
            <component :is="SETTINGS_TAB_COMPONENTS[activeTab ?? '']" :highlight="highlightedId" />
          </div>
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
