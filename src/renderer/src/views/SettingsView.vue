<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { logger } from '@shared/logger';
import { Palette, Play, Download, Keyboard, Globe, Key, RefreshCw, Box, PictureInPicture, Folder, Bell, Activity, Info } from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import SettingsSidebar from '@renderer/components/settings/SettingsSidebar.vue';

const SettingsAppearance = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsAppearance.vue')
);
const SettingsPlayback = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsPlayback.vue')
);
const SettingsPiP = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsPiP.vue')
);
const SettingsDownload = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsDownload.vue')
);
const SettingsShortcuts = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsShortcuts.vue')
);
const SettingsNetwork = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsNetwork.vue')
);
const SettingsApiKeys = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsApiKeys.vue')
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

const settings = useSettingsStore();
const ui = useUIStore();
const { t } = useI18n();
const { promptVisible, promptIsConfirm, promptMessage, promptValue, showConfirm, promptConfirm, promptCancel } =
  usePromptDialog();

const tab = ref('appearance');
const search = ref('');

const tabs = [
  { id: 'appearance', labelKey: 'settings.appearance', icon: Palette, section: 'playback' },
  { id: 'playback', labelKey: 'settings.playback', icon: Play, section: 'playback' },
  { id: 'pip', labelKey: 'settings.pip', icon: PictureInPicture, section: 'playback' },
  { id: 'download', labelKey: 'settings.download', icon: Download, section: 'playback' },
  { id: 'shortcuts', labelKey: 'settings.shortcuts', icon: Keyboard, section: 'playback' },
  { id: 'toast', labelKey: 'settings.notifications', icon: Bell, section: 'appearance' },
  { id: 'network', labelKey: 'settings.network', icon: Globe, section: 'network' },
  { id: 'api-keys', labelKey: 'settings.apiKeys', icon: Key, section: 'network' },
  { id: 'updates', labelKey: 'settings.updates', icon: RefreshCw, section: 'network' },
  { id: 'diagnostics', labelKey: 'settings.diagnostics', icon: Activity, section: 'system' },
  { id: 'about', labelKey: 'settings.about', icon: Info, section: 'system' },
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
const filteredTabs = computed(() => {
  if (!query.value) return tabs;
  return tabs.filter((tab) => t(tab.labelKey).toLowerCase().includes(query.value));
});

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
  if (oldTab === 'pip') {
    window.api?.pipPreviewStop().catch((err) => logger.error('Settings', 'pipPreviewStop', err));
  }
});
</script>

<template>
  <div class="flex h-full">
    <SettingsSidebar
      :tab="tab"
      :search="search"
      :query="query"
      :tabs="tabs"
      :filtered-tabs="filteredTabs"
      :section-order="sectionOrder"
      @select="tab = $event"
      @update-search="search = $event"
      @reset="onReset"
      @export="onExport"
      @import="onImport"
    />

    <main class="flex-1 min-w-0 overflow-auto p-6 lg:p-8">
      <SettingsAppearance v-if="tab === 'appearance'" />
      <SettingsPlayback v-if="tab === 'playback'" />
      <SettingsPiP v-if="tab === 'pip'" />
      <SettingsDownload v-if="tab === 'download'" />
      <SettingsShortcuts v-if="tab === 'shortcuts'" />
      <SettingsNetwork v-if="tab === 'network'" />
      <SettingsApiKeys v-if="tab === 'api-keys'" />
      <SettingsUpdates v-if="tab === 'updates'" />
      <SettingsToast v-if="tab === 'toast'" />
      <SettingsDiagnostics v-if="tab === 'diagnostics'" />
      <SettingsAbout v-if="tab === 'about'" />
      <SettingsLibraryFolders v-if="tab === 'library'" />
      <SettingsDependencies v-if="tab === 'dependencies'" />
    </main>

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
