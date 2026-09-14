import { defineAsyncComponent } from 'vue';

// Lazy settings-tab components, keyed by tab id. Extracted from
// `views/SettingsView.vue` (plan 2.8) so the view renders `<component :is>`
// instead of a long v-if/v-else-if chain.
export const SETTINGS_TAB_COMPONENTS: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  theme: defineAsyncComponent(() => import('./SettingsTheme.vue')),
  appearance: defineAsyncComponent(() => import('./SettingsAppearance.vue')),
  playback: defineAsyncComponent(() => import('./SettingsPlayback.vue')),
  'playback-buffer': defineAsyncComponent(() => import('./SettingsPlaybackBuffer.vue')),
  'pip-video': defineAsyncComponent(() => import('./SettingsPiPVideo.vue')),
  'pip-audio': defineAsyncComponent(() => import('./SettingsPiPAudio.vue')),
  download: defineAsyncComponent(() => import('./SettingsDownload.vue')),
  'download-paths': defineAsyncComponent(() => import('./SettingsDownloadPaths.vue')),
  'download-queue': defineAsyncComponent(() => import('./SettingsDownloadQueue.vue')),
  'smart-mode': defineAsyncComponent(() => import('./SettingsSmartMode.vue')),
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
  systemInfo: defineAsyncComponent(() => import('./SettingsSystemInfo.vue')),
  diagnostics: defineAsyncComponent(() => import('./SettingsDiagnostics.vue')),
  about: defineAsyncComponent(() => import('./SettingsAbout.vue')),
  apiKeys: defineAsyncComponent(() => import('./SettingsApiKeys.vue')),
  plugins: defineAsyncComponent(() => import('./SettingsPlugins.vue'))
};
