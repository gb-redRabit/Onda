<script setup lang="ts">
import { ref, watch, defineAsyncComponent } from 'vue';
import { logger } from '@renderer/utils/logger';
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
  Languages
} from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';

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

const tab = ref('appearance');

const tabs = [
  { id: 'appearance', labelKey: 'settings.appearance', icon: Palette },
  { id: 'playback', labelKey: 'settings.playback', icon: Play },
  { id: 'pip', labelKey: 'settings.pip', icon: PictureInPicture },
  { id: 'download', labelKey: 'settings.download', icon: Download },
  { id: 'shortcuts', labelKey: 'settings.shortcuts', icon: Keyboard },
  { id: 'network', labelKey: 'settings.network', icon: Globe },
  { id: 'api-keys', labelKey: 'settings.apiKeys', icon: Key },
  { id: 'updates', labelKey: 'settings.updates', icon: RefreshCw },
  { id: 'toast', labelKey: 'settings.notifications', icon: Bell },
  { id: 'language', labelKey: 'settings.language', icon: Languages },
  { id: 'library', labelKey: 'settings.library', icon: Folder },
  { id: 'dependencies', labelKey: 'settings.dependencies', icon: Box }
];

watch(tab, (_newTab, oldTab) => {
  if (oldTab === 'pip') {
    window.api?.pipPreviewStop().catch((err) => logger.error('Settings', 'pipPreviewStop', err));
  }
});
</script>

<template>
  <div class="flex h-full">
    <div class="w-56 border-r border-border-default p-3 shrink-0">
      <div class="flex items-center justify-between mb-3 px-2">
        <h1 class="text-lg font-bold">{{ $t('settings.title') }}</h1>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover transition-colors"
          @click="settings.resetToDefaults"
        >
          <RotateCcw :size="14" />
        </button>
      </div>
      <div class="space-y-0.5">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
          :class="
            tab === t.id
              ? 'bg-accent-ghost text-accent-base'
              : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'
          "
          @click="tab = t.id"
        >
          <component :is="t.icon" :size="16" />{{ $t(t.labelKey) }}
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
  </div>
</template>
