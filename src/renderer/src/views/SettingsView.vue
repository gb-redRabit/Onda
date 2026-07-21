<script setup lang="ts">
import { ref, watch, defineAsyncComponent } from 'vue';
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
  Bell
} from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';

const SettingsAppearance = defineAsyncComponent(() => import('@renderer/components/settings/SettingsAppearance.vue'));
const SettingsPlayback = defineAsyncComponent(() => import('@renderer/components/settings/SettingsPlayback.vue'));
const SettingsPiP = defineAsyncComponent(() => import('@renderer/components/settings/SettingsPiP.vue'));
const SettingsDownload = defineAsyncComponent(() => import('@renderer/components/settings/SettingsDownload.vue'));
const SettingsShortcuts = defineAsyncComponent(() => import('@renderer/components/settings/SettingsShortcuts.vue'));
const SettingsNetwork = defineAsyncComponent(() => import('@renderer/components/settings/SettingsNetwork.vue'));
const SettingsApiKeys = defineAsyncComponent(() => import('@renderer/components/settings/SettingsApiKeys.vue'));
const SettingsUpdates = defineAsyncComponent(() => import('@renderer/components/settings/SettingsUpdates.vue'));
const SettingsDependencies = defineAsyncComponent(() => import('@renderer/components/settings/SettingsDependencies.vue'));
const SettingsLibraryFolders = defineAsyncComponent(() => import('@renderer/components/settings/SettingsLibraryFolders.vue'));
const SettingsToast = defineAsyncComponent(() => import('@renderer/components/settings/SettingsToast.vue'));

const settings = useSettingsStore();

const tab = ref('appearance');

const tabs = [
  { id: 'appearance', label: 'Wygląd', icon: Palette },
  { id: 'playback', label: 'Odtwarzanie', icon: Play },
  { id: 'pip', label: 'PiP', icon: PictureInPicture },
  { id: 'download', label: 'Pobieranie', icon: Download },
  { id: 'shortcuts', label: 'Skróty', icon: Keyboard },
  { id: 'network', label: 'Sieć', icon: Globe },
  { id: 'api-keys', label: 'Klucze API', icon: Key },
  { id: 'updates', label: 'Aktualizacje', icon: RefreshCw },
  { id: 'toast', label: 'Powiadomienia', icon: Bell },
  { id: 'library', label: 'Biblioteka', icon: Folder },
  { id: 'dependencies', label: 'Zależności', icon: Box }
];

watch(tab, (_newTab, oldTab) => {
  if (oldTab === 'pip') {
    window.api?.pipPreviewStop().catch(() => {});
  }
});
</script>

<template>
  <div class="flex h-full">
    <div class="w-56 border-r border-border-default p-3 shrink-0">
      <div class="flex items-center justify-between mb-3 px-2">
        <h1 class="text-lg font-bold">Ustawienia</h1>
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
          <component :is="t.icon" :size="16" />{{ t.label }}
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
      <SettingsLibraryFolders v-if="tab === 'library'" />
      <SettingsDependencies v-if="tab === 'dependencies'" />
    </div>
  </div>
</template>
