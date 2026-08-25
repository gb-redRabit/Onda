<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { logger } from '@shared/logger';
import {
  Palette,
  Paintbrush,
  Play,
  Download,
  Keyboard,
  Globe,
  RefreshCw,
  Box,
  PictureInPicture,
  Folder,
  Bell,
  Activity,
  Info,
  Power,
  Search,
  RotateCcw,
  FileDown,
  FileUp,
  ArrowLeft,
  X,
  Settings,
  Music2
} from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';

const SettingsAppearance = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsAppearance.vue')
);
const SettingsTheme = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsTheme.vue')
);
const SettingsPlayback = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsPlayback.vue')
);
const SettingsPiPVideo = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsPiPVideo.vue')
);
const SettingsPiPAudio = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsPiPAudio.vue')
);
const SettingsDownload = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsDownload.vue')
);
const SettingsSmartMode = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsSmartMode.vue')
);
const SettingsShortcuts = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsShortcuts.vue')
);
const SettingsNetwork = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsNetwork.vue')
);
const SettingsUpdates = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsUpdates.vue')
);
const SettingsDependencies = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsDependencies.vue')
);
const SettingsLibraryFolders = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsLibraryFolders.vue')
);
const SettingsToast = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsToast.vue')
);
const SettingsDiagnostics = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsDiagnostics.vue')
);
const SettingsAbout = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsAbout.vue')
);
const SettingsGeneral = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsGeneral.vue')
);

const settings = useSettingsStore();
const ui = useUIStore();
const { t } = useI18n();
const {
  promptVisible,
  promptIsConfirm,
  promptMessage,
  promptValue,
  showConfirm,
  promptConfirm,
  promptCancel
} = usePromptDialog();

const tab = ref<string | null>(null);
const search = ref('');

const tabs = [
  // Odtwarzanie
  { id: 'playback', labelKey: 'settings.playback', icon: Play, section: 'playback' },
  { id: 'pip-video', labelKey: 'settings.pipVideo', icon: PictureInPicture, section: 'playback' },
  { id: 'pip-audio', labelKey: 'settings.pipAudio', icon: Music2, section: 'playback' },
  // Wygląd
  { id: 'theme', labelKey: 'settings.themeTab', icon: Paintbrush, section: 'appearance' },
  { id: 'appearance', labelKey: 'settings.appearance', icon: Palette, section: 'appearance' },
  // Sieć i usługi
  { id: 'network', labelKey: 'settings.network', icon: Globe, section: 'network' },
  { id: 'download', labelKey: 'settings.download', icon: Download, section: 'network' },
  { id: 'smart-mode', labelKey: 'settings.smartModeTab', icon: Download, section: 'network' },
  // System
  { id: 'general', labelKey: 'settings.general', icon: Power, section: 'system' },
  { id: 'shortcuts', labelKey: 'settings.shortcuts', icon: Keyboard, section: 'system' },
  { id: 'toast', labelKey: 'settings.notifications', icon: Bell, section: 'system' },
  { id: 'updates', labelKey: 'settings.updates', icon: RefreshCw, section: 'system' },
  { id: 'diagnostics', labelKey: 'settings.diagnostics', icon: Activity, section: 'system' },
  { id: 'about', labelKey: 'settings.about', icon: Info, section: 'system' },
  // Biblioteka
  { id: 'library', labelKey: 'settings.library', icon: Folder, section: 'library' },
  { id: 'dependencies', labelKey: 'settings.dependencies', icon: Box, section: 'library' }
];

const sectionOrder = [
  { id: 'playback', labelKey: 'settings.sectionPlayback' },
  { id: 'appearance', labelKey: 'settings.sectionAppearance' },
  { id: 'network', labelKey: 'settings.sectionNetwork' },
  { id: 'system', labelKey: 'settings.sectionSystem' },
  { id: 'library', labelKey: 'settings.sectionLibrary' }
];

const query = computed(() => search.value.trim().toLowerCase());
const currentTab = computed(() => tabs.find((item) => item.id === tab.value) ?? null);

const visibleSections = computed(() => {
  const matches = (id: string): boolean => {
    if (!query.value) return true;
    const entry = tabs.find((item) => item.id === id);
    return entry ? t(entry.labelKey).toLowerCase().includes(query.value) : false;
  };
  return sectionOrder
    .map((section) => ({
      ...section,
      tabs: tabs.filter((item) => item.section === section.id && matches(item.id))
    }))
    .filter((section) => section.tabs.length > 0);
});

function select(id: string) {
  tab.value = id;
}

function goHome() {
  tab.value = null;
}

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

watch(tab, (_newTab, oldTab) => {
  if (oldTab === 'pip-video') {
    window.api?.pipPreviewStop().catch((err) => logger.error('Settings', 'pipPreviewStop', err));
  }
  if (oldTab === 'pip-audio') {
    window.api
      ?.audioPipPreviewStop()
      .catch((err) => logger.error('Settings', 'audioPipPreviewStop', err));
  }
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- header -->
    <header
      class="shrink-0 flex items-center gap-3 px-6 py-4 border border-b border-base-300 bg-base-100/(--glass-alpha)"
    >
      <template v-if="!tab">
        <div
          class="w-9 h-9 rounded-box bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/20"
        >
          <Settings :size="17" />
        </div>
        <h1 class="text-lg font-bold tracking-tight">{{ $t('settings.title') }}</h1>
        <div class="relative max-w-sm flex-1 ml-4">
          <Search
            :size="15"
            class="absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/50 pointer-events-none"
          />
          <input
            v-model="search"
            :placeholder="$t('settings.searchSettings')"
            class="w-full pl-10 pr-9 h-field fx-depth rounded-field bg-base-200 border border-base-300 text-sm text-base-content outline-none transition-all placeholder:text-base-content/50 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
          />
          <button
            v-if="search"
            class="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            :aria-label="$t('common.close')"
            @click="search = ''"
          >
            <X :size="14" />
          </button>
        </div>
      </template>
      <template v-else>
        <button
          class="fx-noise p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :title="$t('settings.back')"
          :aria-label="$t('settings.back')"
          @click="goHome"
        >
          <ArrowLeft :size="18" />
        </button>
        <h1 class="text-lg font-bold tracking-tight">{{ $t(currentTab!.labelKey) }}</h1>
      </template>

      <div class="ml-auto flex items-center gap-2">
        <button
          class="fx-noise flex items-center gap-1.5 px-3 py-2 fx-depth rounded-field text-xs font-medium text-base-content/70 bg-base-300 border border-base-300 hover:bg-base-content/10 hover:text-base-content transition-colors"
          @click="onExport"
        >
          <FileDown :size="14" />{{ $t('settings.export') }}
        </button>
        <button
          class="fx-noise flex items-center gap-1.5 px-3 py-2 fx-depth rounded-field text-xs font-medium text-base-content/70 bg-base-300 border border-base-300 hover:bg-base-content/10 hover:text-base-content transition-colors"
          @click="onImport"
        >
          <FileUp :size="14" />{{ $t('settings.import') }}
        </button>
        <button
          class="fx-noise p-2 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :title="$t('settings.reset')"
          :aria-label="$t('settings.reset')"
          @click="onReset"
        >
          <RotateCcw :size="15" />
        </button>
      </div>
    </header>

    <!-- body -->
    <div class="flex-1 overflow-auto">
      <Transition name="settings" mode="out-in">
        <!-- overview: cards -->
        <div v-if="!tab" key="home" class="max-w-5xl mx-auto px-6 py-8">
          <template v-for="section in visibleSections" :key="section.id">
            <section class="mb-8 last:mb-0">
              <h2
                class="mb-3 text-[11px] font-semibold uppercase tracking-wider text-base-content/80"
              >
                {{ $t(section.labelKey) }}
              </h2>
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <button
                  v-for="card in section.tabs"
                  :key="card.id"
                  class="group flex flex-col items-start gap-3 p-4 fx-depth rounded-box fx-noise border border-base-300/70 bg-base-100 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                  @click="select(card.id)"
                >
                  <div
                    class="w-10 h-10 rounded-box bg-primary/10 text-primary flex items-center justify-center transition-colors group-hover:bg-primary group-hover:text-primary-content"
                  >
                    <component :is="card.icon" :size="18" />
                  </div>
                  <span class="text-sm font-medium text-base-content">{{ $t(card.labelKey) }}</span>
                </button>
              </div>
            </section>
          </template>

          <div
            v-if="visibleSections.length === 0"
            class="flex flex-col items-center justify-center py-20 text-base-content/50"
          >
            <Search :size="40" class="mb-3 opacity-20" />
            <p class="text-sm">{{ $t('settings.noResults') }}</p>
          </div>
        </div>

        <!-- panel -->
        <div v-else key="panel" class="px-6 py-8">
          <SettingsTheme v-if="tab === 'theme'" />
          <SettingsAppearance v-else-if="tab === 'appearance'" />
          <SettingsPlayback v-else-if="tab === 'playback'" />
          <SettingsPiPVideo v-else-if="tab === 'pip-video'" />
          <SettingsPiPAudio v-else-if="tab === 'pip-audio'" />
          <SettingsDownload v-else-if="tab === 'download'" />
          <SettingsSmartMode v-else-if="tab === 'smart-mode'" />
          <SettingsShortcuts v-else-if="tab === 'shortcuts'" />
          <SettingsNetwork v-else-if="tab === 'network'" />
          <SettingsUpdates v-else-if="tab === 'updates'" />
          <SettingsGeneral v-else-if="tab === 'general'" />
          <SettingsToast v-else-if="tab === 'toast'" />
          <SettingsDiagnostics v-else-if="tab === 'diagnostics'" />
          <SettingsAbout v-else-if="tab === 'about'" />
          <SettingsLibraryFolders v-else-if="tab === 'library'" />
          <SettingsDependencies v-else-if="tab === 'dependencies'" />
        </div>
      </Transition>
    </div>

    <ExplorerPromptDialog
      :visible="promptVisible"
      :is-confirm="promptIsConfirm"
      :message="promptMessage"
      :value="promptValue"
      @update:value="promptValue = $event"
      @confirm="promptConfirm"
      @cancel="promptCancel"
    />
  </div>
</template>
