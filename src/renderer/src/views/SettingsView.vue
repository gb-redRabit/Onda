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
  Info,
  Power,
  Search,
  RotateCcw,
  FileDown,
  FileUp,
  X,
  Settings,
  Music2,
  Key,
  Wand,
  ArrowLeft
} from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import SettingsOverviewCard from '@renderer/components/settings/SettingsOverviewCard.vue';

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
const SettingsExplorer = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsExplorer.vue')
);
const SettingsApiKeys = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsApiKeys.vue')
);
const SettingsSystemInfo = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsSystemInfo.vue')
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
const SettingsDownloadPaths = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsDownloadPaths.vue')
);
const SettingsDownloadQueue = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsDownloadQueue.vue')
);
const SettingsNetworkPlatform = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsNetworkPlatform.vue')
);
const SettingsPlaybackBuffer = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsPlaybackBuffer.vue')
);
const SettingsSystemLogs = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsSystemLogs.vue')
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

const activeSection = ref<string | null>(null);
const activeTab = ref<string | null>(null);
const search = ref('');

const sections = [
  { id: 'appearance', labelKey: 'settings.sectionAppearance', icon: Palette },
  { id: 'playback', labelKey: 'settings.sectionPlayback', icon: Play },
  { id: 'library', labelKey: 'settings.sectionLibrary', icon: Folder },
  { id: 'network', labelKey: 'settings.sectionNetwork', icon: Globe },
  { id: 'system', labelKey: 'settings.sectionSystem', icon: Power },
  { id: 'advanced', labelKey: 'settings.sectionAdvanced', icon: Key }
] as const;

const tabs = [
  { id: 'playback', labelKey: 'settings.playback', icon: Play, section: 'playback', description: 'Głośność, crossfade, bufor' },
  { id: 'playback-buffer', labelKey: 'settings.playbackBuffer', icon: Music2, section: 'playback', description: 'Preload, sleep timer, per-source' },
  { id: 'pip-video', labelKey: 'settings.pipVideo', icon: PictureInPicture, section: 'playback', description: 'Tryb PiP wideo' },
  { id: 'pip-audio', labelKey: 'settings.pipAudio', icon: Music2, section: 'playback', description: 'Tryb PiP audio' },
  { id: 'theme', labelKey: 'settings.themeTab', icon: Paintbrush, section: 'appearance', description: 'Motywy i kolory' },
  { id: 'appearance', labelKey: 'settings.appearance', icon: Palette, section: 'appearance', description: 'Czcionka, sidebar, animacje' },
  { id: 'network', labelKey: 'settings.network', icon: Globe, section: 'network', description: 'Proxy globalne, prędkość' },
  { id: 'network-platform', labelKey: 'settings.networkPlatform', icon: Globe, section: 'network', description: 'Jakość i proxy YT/SC' },
  { id: 'download', labelKey: 'settings.download', icon: Download, section: 'network', description: 'Konto Google i cookies' },
  { id: 'download-paths', labelKey: 'settings.downloadPaths', icon: Folder, section: 'network', description: 'Foldery docelowe i profile' },
  { id: 'download-queue', labelKey: 'settings.downloadQueue', icon: Download, section: 'network', description: 'Kolejka, retry, hash' },
  { id: 'smart-mode', labelKey: 'settings.smartModeTab', icon: Wand, section: 'network', description: 'Tryb inteligentny' },
  { id: 'library', labelKey: 'settings.library', icon: Folder, section: 'library', description: 'Foldery biblioteki i skan' },
  { id: 'explorer', labelKey: 'settings.explorer', icon: Folder, section: 'library', description: 'Widok i sortowanie plików' },
  { id: 'general', labelKey: 'settings.general', icon: Power, section: 'system', description: 'Autostart, tray, sesja' },
  { id: 'system-logs', labelKey: 'settings.systemLogs', icon: Info, section: 'system', description: 'Logi, rozmiar, eksperymenty' },
  { id: 'shortcuts', labelKey: 'settings.shortcuts', icon: Keyboard, section: 'system', description: 'Skróty klawiszowe' },
  { id: 'toast', labelKey: 'settings.notifications', icon: Bell, section: 'system', description: 'Powiadomienia' },
  { id: 'updates', labelKey: 'settings.updates', icon: RefreshCw, section: 'system', description: 'Aktualizacje' },
  { id: 'dependencies', labelKey: 'settings.dependencies', icon: Box, section: 'system', description: 'yt-dlp, ffmpeg, mkvextract' },
  { id: 'systemInfo', labelKey: 'settings.systemInfo', icon: Info, section: 'system', description: 'Wersje i ścieżki' },
  { id: 'apiKeys', labelKey: 'settings.apiKeys', icon: Key, section: 'advanced', description: 'Klucze API' }
] as const;

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
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- ─── Header ─── -->
    <header class="shrink-0 flex items-center gap-3 px-6 h-14 border-b border-base-300 bg-base-100/(--glass-alpha)">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-box bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/20">
          <Settings :size="15" />
        </div>
        <h1 class="text-[15px] font-bold tracking-tight">{{ t('settings.title') }}</h1>
      </div>

      <div class="relative max-w-xs flex-1 ml-6">
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 pointer-events-none" />
        <input
          v-model="search"
          :placeholder="t('settings.searchSettings')"
          class="w-full pl-9 pr-8 h-9 rounded-field bg-base-200 border border-base-300 text-[13px] text-base-content outline-none transition-all placeholder:text-base-content/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
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

      <div class="ml-auto flex items-center gap-1.5">
        <button
          class="fx-noise flex items-center gap-1.5 px-3 h-9 fx-depth rounded-field text-xs font-medium text-base-content/70 bg-base-300 border border-base-300 hover:bg-base-content/10 hover:text-base-content transition-colors"
          @click="onExport"
        >
          <FileDown :size="13" />
          {{ t('settings.export') }}
        </button>
        <button
          class="fx-noise flex items-center gap-1.5 px-3 h-9 fx-depth rounded-field text-xs font-medium text-base-content/70 bg-base-300 border border-base-300 hover:bg-base-content/10 hover:text-base-content transition-colors"
          @click="onImport"
        >
          <FileUp :size="13" />
          {{ t('settings.import') }}
        </button>
        <button
          class="fx-noise p-2 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :title="t('settings.reset')"
          :aria-label="t('settings.reset')"
          @click="onReset"
        >
          <RotateCcw :size="14" />
        </button>
      </div>
    </header>

    <!-- ─── Section tabs ─── -->
    <nav class="shrink-0 flex items-center gap-1 px-6 h-11 border-b border-base-300 bg-base-100/(--glass-alpha) overflow-x-auto">
      <button
        v-for="section in sections"
        :key="section.id"
        class="flex items-center gap-2 px-3 h-8 rounded-field text-xs font-medium whitespace-nowrap transition-all"
        :class="
          activeSection === section.id
            ? 'bg-primary text-primary-content fx-depth shadow-primary/20'
            : 'text-base-content/60 hover:text-base-content hover:bg-base-content/10'
        "
        @click="selectSection(section.id)"
      >
        <component :is="section.icon" :size="14" />
        {{ t(section.labelKey) }}
      </button>
    </nav>

    <!-- ─── Content ─── -->
    <div class="flex-1 overflow-auto">
      <Transition name="settings-content" mode="out-in">
        <!-- Overview: section grid -->
        <div v-if="isOverview" key="overview" class="px-6 py-8 mx-auto w-full max-w-5xl">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <button
              v-for="section in sections"
              :key="section.id"
              class="group flex flex-col items-center gap-3 p-5 rounded-box border border-base-300/70 bg-base-100 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all text-center"
              @click="selectSection(section.id)"
            >
              <div class="w-12 h-12 rounded-box bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-content transition-colors">
                <component :is="section.icon" :size="22" />
              </div>
              <span class="text-sm font-medium text-base-content">{{ t(section.labelKey) }}</span>
            </button>
          </div>
        </div>

        <!-- Section: sub-tabs grid -->
        <div v-else-if="!activeTab" :key="'section-' + activeSection" class="px-6 py-8 mx-auto w-full max-w-5xl">
          <div class="flex items-center gap-2 mb-6">
            <button
              class="flex items-center gap-1.5 text-xs text-base-content/50 hover:text-base-content transition-colors"
              @click="goHome"
            >
              <component :is="sections.find(s => s.id === activeSection)?.icon" :size="14" />
              {{ t(sections.find(s => s.id === activeSection)?.labelKey ?? '') }}
            </button>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <SettingsOverviewCard
              v-for="card in sectionTabs"
              :id="card.id"
              :key="card.id"
              :icon="card.icon"
              :label-key="card.labelKey"
              :description="(card as any).description"
              :section="card.section"
              @select="selectTab"
            />
          </div>

          <div
            v-if="sectionTabs.length === 0"
            class="flex flex-col items-center justify-center py-20 text-base-content/50"
          >
            <Search :size="40" class="mb-3 opacity-20" />
            <p class="text-sm">{{ t('settings.noResults') }}</p>
          </div>
        </div>

        <!-- Detail panel -->
        <div v-else :key="'tab-' + activeTab" class="px-6 py-8">
          <div class="flex items-center gap-2 mb-6">
            <button
              class="flex items-center gap-1.5 text-xs text-base-content/50 hover:text-base-content transition-colors"
              @click="goBackToSection"
            >
              <ArrowLeft :size="14" />
              {{ t(sections.find(s => s.id === activeSection)?.labelKey ?? '') }}
            </button>
          </div>

          <SettingsTheme v-if="activeTab === 'theme'" />
          <SettingsAppearance v-else-if="activeTab === 'appearance'" />
          <SettingsPlayback v-else-if="activeTab === 'playback'" />
          <SettingsPlaybackBuffer v-else-if="activeTab === 'playback-buffer'" />
          <SettingsPiPVideo v-else-if="activeTab === 'pip-video'" />
          <SettingsPiPAudio v-else-if="activeTab === 'pip-audio'" />
          <SettingsDownload v-else-if="activeTab === 'download'" />
          <SettingsDownloadPaths v-else-if="activeTab === 'download-paths'" />
          <SettingsDownloadQueue v-else-if="activeTab === 'download-queue'" />
          <SettingsSmartMode v-else-if="activeTab === 'smart-mode'" />
          <SettingsShortcuts v-else-if="activeTab === 'shortcuts'" />
          <SettingsNetwork v-else-if="activeTab === 'network'" />
          <SettingsNetworkPlatform v-else-if="activeTab === 'network-platform'" />
          <SettingsUpdates v-else-if="activeTab === 'updates'" />
          <SettingsGeneral v-else-if="activeTab === 'general'" />
          <SettingsSystemLogs v-else-if="activeTab === 'system-logs'" />
          <SettingsToast v-else-if="activeTab === 'toast'" />
          <SettingsLibraryFolders v-else-if="activeTab === 'library'" />
          <SettingsExplorer v-else-if="activeTab === 'explorer'" />
          <SettingsDependencies v-else-if="activeTab === 'dependencies'" />
          <SettingsSystemInfo v-else-if="activeTab === 'systemInfo'" />
          <SettingsDiagnostics v-else-if="activeTab === 'diagnostics'" />
          <SettingsAbout v-else-if="activeTab === 'about'" />
          <SettingsApiKeys v-else-if="activeTab === 'apiKeys'" />
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

<style scoped>
.settings-content-enter-active {
  transition:
    opacity 180ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.settings-content-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}
.settings-content-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.settings-content-leave-to {
  opacity: 0;
}
</style>
