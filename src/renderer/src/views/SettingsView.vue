<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { logger } from '@shared/logger';
import {
  Palette,
  Play,
  Download,
  Keyboard,
  Globe,
  Key,
  RefreshCw,
  Box,
  PictureInPicture,
  RotateCcw,
  Folder,
  Bell,
  Languages,
  Search,
  FileDown,
  FileUp
} from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';

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
const SettingsLanguage = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsLanguage.vue')
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
  { id: 'language', labelKey: 'settings.language', icon: Languages, section: 'appearance' },
  { id: 'toast', labelKey: 'settings.notifications', icon: Bell, section: 'appearance' },
  { id: 'network', labelKey: 'settings.network', icon: Globe, section: 'network' },
  { id: 'api-keys', labelKey: 'settings.apiKeys', icon: Key, section: 'network' },
  { id: 'updates', labelKey: 'settings.updates', icon: RefreshCw, section: 'network' },
  { id: 'library', labelKey: 'settings.library', icon: Folder, section: 'library' },
  { id: 'dependencies', labelKey: 'settings.dependencies', icon: Box, section: 'library' }
];

const sectionOrder = [
  { id: 'playback', labelKey: 'settings.sectionPlayback' },
  { id: 'appearance', labelKey: 'settings.sectionAppearance' },
  { id: 'network', labelKey: 'settings.sectionNetwork' },
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
    <div class="w-64 border-r border-border-default p-3 shrink-0 flex flex-col">
      <div class="flex items-center justify-between mb-3 px-2">
        <h1 class="text-lg font-bold">{{ $t('settings.title') }}</h1>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover transition-colors"
          title="Reset"
          @click="onReset"
        >
          <RotateCcw :size="14" />
        </button>
      </div>

      <div class="relative mb-3">
        <Search
          :size="14"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint pointer-events-none"
        />
        <input
          v-model="search"
          :placeholder="$t('settings.searchSettings')"
          class="w-full pl-8 pr-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm text-fg-base outline-none focus:ring-1 focus:ring-accent-base"
        />
      </div>

      <div class="flex-1 overflow-auto space-y-4">
        <template v-if="query">
          <div class="space-y-0.5">
            <div v-if="!filteredTabs.length" class="px-3 py-2 text-xs text-fg-faint">
              {{ $t('settings.noResults') }}
            </div>
            <button
              v-for="ft in filteredTabs"
              :key="ft.id"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              :class="
                tab === ft.id
                  ? 'bg-accent-ghost text-accent-base'
                  : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'
              "
              @click="tab = ft.id"
            >
              <component :is="ft.icon" :size="16" />{{ $t(ft.labelKey) }}
            </button>
          </div>
        </template>

        <template v-for="section in sectionOrder" v-else :key="section.id">
          <div>
            <div class="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              {{ $t(section.labelKey) }}
            </div>
            <div class="space-y-0.5">
              <button
                v-for="st in tabs.filter((tab) => tab.section === section.id)"
                :key="st.id"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                :class="
                  tab === st.id
                    ? 'bg-accent-ghost text-accent-base'
                    : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'
                "
                @click="tab = st.id"
              >
                <component :is="st.icon" :size="16" />{{ $t(st.labelKey) }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <div class="border-t border-border-default pt-3 mt-3 space-y-1">
        <button
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
          @click="onExport"
        >
          <FileDown :size="16" />{{ $t('settings.export') }}
        </button>
        <button
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
          @click="onImport"
        >
          <FileUp :size="16" />{{ $t('settings.import') }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-6">
      <SettingsAppearance v-if="tab === 'appearance'" />
      <SettingsPlayback v-if="tab === 'playback'" />
      <SettingsPiP v-if="tab === 'pip'" />
      <SettingsDownload v-if="tab === 'download'" />
      <SettingsShortcuts v-if="tab === 'shortcuts'" />
      <SettingsNetwork v-if="tab === 'network'" />
      <SettingsApiKeys v-if="tab === 'api-keys'" />
      <SettingsUpdates v-if="tab === 'updates'" />
      <SettingsToast v-if="tab === 'toast'" />
      <SettingsLanguage v-if="tab === 'language'" />
      <SettingsLibraryFolders v-if="tab === 'library'" />
      <SettingsDependencies v-if="tab === 'dependencies'" />
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