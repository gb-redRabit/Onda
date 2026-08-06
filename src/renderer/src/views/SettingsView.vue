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
  Search,
  FileDown,
  FileUp,
  Activity,
  Info,
  X,
  Settings
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
    <aside class="w-72 border-r border-border-default shrink-0 flex flex-col bg-bg-surface/50">
      <div class="flex items-center justify-between px-4 pt-5 pb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-accent-ghost flex items-center justify-center text-accent-base">
            <Settings :size="16" />
          </div>
          <h1 class="text-base font-bold tracking-tight">{{ $t('settings.title') }}</h1>
        </div>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover hover:text-fg-base transition-colors"
          :title="$t('settings.reset')"
          @click="onReset"
        >
          <RotateCcw :size="14" />
        </button>
      </div>

      <div class="px-4 pb-4">
        <div class="relative">
          <Search
            :size="15"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint pointer-events-none"
          />
          <input
            v-model="search"
            :placeholder="$t('settings.searchSettings')"
            class="w-full pl-9 pr-8 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm text-fg-base outline-none transition-all focus:border-accent-base/60 focus:ring-2 focus:ring-accent-base/15"
          />
          <button
            v-if="search"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-fg-faint hover:text-fg-base transition-colors"
            @click="search = ''"
          >
            <X :size="14" />
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto px-2 pb-4 space-y-6">
        <template v-if="query">
          <div class="space-y-1">
            <div
              v-if="!filteredTabs.length"
              class="px-3 py-3 text-xs text-fg-faint text-center"
            >
              {{ $t('settings.noResults') }}
            </div>
            <button
              v-for="ft in filteredTabs"
              :key="ft.id"
              class="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors"
              :class="tab === ft.id ? 'bg-accent-ghost' : 'hover:bg-bg-hover'"
              @click="tab = ft.id"
            >
              <span
                class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-accent-base transition-opacity"
                :class="tab === ft.id ? 'opacity-100' : 'opacity-0'"
              />
              <component
                :is="ft.icon"
                :size="16"
                :class="tab === ft.id ? 'text-accent-base' : 'text-fg-faint group-hover:text-fg-base'"
              />
              <span
                class="min-w-0 truncate"
                :class="
                  tab === ft.id
                    ? 'text-accent-base font-semibold'
                    : 'text-fg-muted group-hover:text-fg-base'
                "
              >{{ $t(ft.labelKey) }}</span>
            </button>
          </div>
        </template>

        <template v-for="section in sectionOrder" v-else :key="section.id">
          <div>
            <div class="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
              {{ $t(section.labelKey) }}
            </div>
            <div class="space-y-1">
              <button
                v-for="st in tabs.filter((tab) => tab.section === section.id)"
                :key="st.id"
                class="group relative flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors"
                :class="tab === st.id ? 'bg-accent-ghost' : 'hover:bg-bg-hover'"
                @click="tab = st.id"
              >
                <span
                  class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-accent-base transition-opacity"
                  :class="tab === st.id ? 'opacity-100' : 'opacity-0'"
                />
                <component
                  :is="st.icon"
                  :size="16"
                  :class="
                    tab === st.id ? 'text-accent-base' : 'text-fg-faint group-hover:text-fg-base'
                  "
                />
                <span
                  class="min-w-0 truncate"
                  :class="
                    tab === st.id
                      ? 'text-accent-base font-semibold'
                      : 'text-fg-muted group-hover:text-fg-base'
                  "
                >{{ $t(st.labelKey) }}</span>
              </button>
            </div>
          </div>
        </template>
      </div>

      <div class="border-t border-border-default p-2.5 space-y-1">
        <button
          class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
          @click="onExport"
        >
          <FileDown :size="16" />{{ $t('settings.export') }}
        </button>
        <button
          class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
          @click="onImport"
        >
          <FileUp :size="16" />{{ $t('settings.import') }}
        </button>
      </div>
    </aside>

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