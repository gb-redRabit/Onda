import { defineAsyncComponent } from 'vue';

// Leniwe komponenty zakładek ustawień, kluczowane po id zakładki. Wyodrębnione z
// `views/SettingsView.vue` (plan 2.8), aby widok renderował `<component :is>`
// zamiast długiego łańcucha v-if/v-else-if.
export const SETTINGS_TAB_COMPONENTS: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  theme: defineAsyncComponent(() => import('./SettingsTheme.vue')),
  appearance: defineAsyncComponent(() => import('./SettingsAppearance.vue')),
  playback: defineAsyncComponent(() => import('./SettingsPlayback.vue')),
  'pip-video': defineAsyncComponent(() => import('./SettingsPiPVideo.vue')),
  'pip-audio': defineAsyncComponent(() => import('./SettingsPiPAudio.vue')),
  download: defineAsyncComponent(() => import('./SettingsDownload.vue')),
  'download-paths': defineAsyncComponent(() => import('./SettingsDownloadPaths.vue')),
  'download-queue': defineAsyncComponent(() => import('./SettingsDownloadQueue.vue')),
  shortcuts: defineAsyncComponent(() => import('./SettingsShortcuts.vue')),
  network: defineAsyncComponent(() => import('./SettingsNetwork.vue')),
  'network-platform': defineAsyncComponent(() => import('./SettingsNetworkPlatform.vue')),
  updates: defineAsyncComponent(() => import('./SettingsUpdates.vue')),
  general: defineAsyncComponent(() => import('./SettingsGeneral.vue')),
  'system-logs': defineAsyncComponent(() => import('./SettingsSystemLogs.vue')),
  toast: defineAsyncComponent(() => import('./SettingsToast.vue')),
  library: defineAsyncComponent(() => import('./SettingsLibraryFolders.vue')),
  explorer: defineAsyncComponent(() => import('./SettingsExplorer.vue')),
  dependencies: defineAsyncComponent(() => import('./SettingsDependencies.vue')),
  diagnostics: defineAsyncComponent(() => import('./SettingsDiagnostics.vue')),
  about: defineAsyncComponent(() => import('./SettingsAbout.vue')),
  apiKeys: defineAsyncComponent(() => import('./SettingsApiKeys.vue')),
  plugins: defineAsyncComponent(() => import('./SettingsPlugins.vue'))
};
