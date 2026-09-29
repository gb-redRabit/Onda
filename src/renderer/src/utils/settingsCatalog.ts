// Settings search catalog: every entry is a jump target. Searching matches the
// translated label plus keywords; picking a result opens `tab` and scrolls to the
// element carrying the entry id (SettingsRow `anchor`).
export interface SettingsCatalogEntry {
  id: string;
  labelKey: string;
  tab: string;
  keywords: string[];
}

export const SETTINGS_CATALOG: SettingsCatalogEntry[] = [
  { id: 'setting-api-keys', labelKey: 'settings.apiKeys', tab: 'apiKeys', keywords: [] },
  {
    id: 'setting-api-keys-encrypted',
    labelKey: 'settings.apiKeysEncrypted',
    tab: 'apiKeys',
    keywords: []
  },
  { id: 'setting-api-keys-title', labelKey: 'settings.apiKeysTitle', tab: 'apiKeys', keywords: [] },
  {
    id: 'setting-animations',
    labelKey: 'settings.animations',
    tab: 'appearance',
    keywords: ['animacje', 'animation']
  },
  {
    id: 'setting-appearance-section',
    labelKey: 'settings.appearanceSection',
    tab: 'appearance',
    keywords: []
  },
  {
    id: 'setting-language',
    labelKey: 'settings.language',
    tab: 'appearance',
    keywords: ['jezyk', 'language', 'locale']
  },
  { id: 'setting-reset', labelKey: 'settings.reset', tab: 'appearance', keywords: [] },
  {
    id: 'setting-sidebar-collapsed',
    labelKey: 'settings.sidebarCollapsed',
    tab: 'appearance',
    keywords: []
  },
  {
    id: 'setting-sidebar-position',
    labelKey: 'settings.sidebarPosition',
    tab: 'appearance',
    keywords: ['sidebar', 'pasek', 'menu']
  },
  {
    id: 'setting-sidebar-sections',
    labelKey: 'settings.sidebarSections',
    tab: 'appearance',
    keywords: []
  },
  { id: 'setting-dep-title', labelKey: 'settings.depTitle', tab: 'dependencies', keywords: [] },
  {
    id: 'setting-diagnostics-title',
    labelKey: 'settings.diagnosticsTitle',
    tab: 'diagnostics',
    keywords: []
  },
  {
    id: 'setting-download-section',
    labelKey: 'settings.downloadSection',
    tab: 'download',
    keywords: []
  },
  {
    id: 'setting-google-account',
    labelKey: 'settings.googleAccount',
    tab: 'download',
    keywords: []
  },
  {
    id: 'setting-download-path',
    labelKey: 'settings.downloadPath',
    tab: 'download-paths',
    keywords: []
  },
  {
    id: 'setting-sources-path',
    labelKey: 'settings.sourcesPath',
    tab: 'download-paths',
    keywords: []
  },
  { id: 'setting-temp-dir', labelKey: 'settings.tempDir', tab: 'download-paths', keywords: [] },
  {
    id: 'setting-auto-add-download-folder',
    labelKey: 'settings.autoAddDownloadFolder',
    tab: 'download-queue',
    keywords: []
  },
  {
    id: 'setting-auto-download-sub',
    labelKey: 'settings.autoDownloadSub',
    tab: 'download-queue',
    keywords: []
  },
  {
    id: 'setting-download-queue-section',
    labelKey: 'settings.downloadQueueSection',
    tab: 'download-queue',
    keywords: []
  },
  {
    id: 'setting-hash-files',
    labelKey: 'settings.hashFiles',
    tab: 'download-queue',
    keywords: ['suma', 'sha', 'hash', 'checksum']
  },
  {
    id: 'setting-night-schedule',
    labelKey: 'settings.nightSchedule',
    tab: 'download-queue',
    keywords: []
  },
  {
    id: 'setting-retry-base-ms',
    labelKey: 'settings.retryBaseMs',
    tab: 'download-queue',
    keywords: []
  },
  {
    id: 'setting-confirm-before-move',
    labelKey: 'settings.confirmBeforeMove',
    tab: 'explorer',
    keywords: []
  },
  { id: 'setting-explorer', labelKey: 'settings.explorer', tab: 'explorer', keywords: [] },
  { id: 'setting-sorting', labelKey: 'settings.sorting', tab: 'explorer', keywords: [] },
  { id: 'setting-view-mode', labelKey: 'settings.viewMode', tab: 'explorer', keywords: [] },
  {
    id: 'setting-auto-launch',
    labelKey: 'settings.autoLaunch',
    tab: 'general',
    keywords: ['autostart', 'uruchamianie']
  },
  {
    id: 'setting-close-to-tray',
    labelKey: 'settings.closeToTray',
    tab: 'general',
    keywords: ['tray', 'zasobnik', 'zamkniecie']
  },
  {
    id: 'setting-general-section',
    labelKey: 'settings.generalSection',
    tab: 'general',
    keywords: []
  },
  {
    id: 'setting-restore-session',
    labelKey: 'settings.restoreSession',
    tab: 'general',
    keywords: []
  },
  {
    id: 'setting-start-minimized',
    labelKey: 'settings.startMinimized',
    tab: 'general',
    keywords: []
  },
  { id: 'setting-lib-title', labelKey: 'settings.libTitle', tab: 'library', keywords: [] },
  { id: 'setting-enable-proxy', labelKey: 'settings.enableProxy', tab: 'network', keywords: [] },
  {
    id: 'setting-network-section',
    labelKey: 'settings.networkSection',
    tab: 'network',
    keywords: []
  },
  { id: 'setting-proxy-host', labelKey: 'settings.proxyHost', tab: 'network', keywords: [] },
  {
    id: 'setting-proxy-password',
    labelKey: 'settings.proxyPassword',
    tab: 'network',
    keywords: []
  },
  { id: 'setting-proxy-port', labelKey: 'settings.proxyPort', tab: 'network', keywords: [] },
  { id: 'setting-proxy-type', labelKey: 'settings.proxyType', tab: 'network', keywords: [] },
  {
    id: 'setting-proxy-username',
    labelKey: 'settings.proxyUsername',
    tab: 'network',
    keywords: []
  },
  {
    id: 'setting-user-agent',
    labelKey: 'settings.userAgent',
    tab: 'network',
    keywords: ['user agent', 'ua', 'przegladarka']
  },
  {
    id: 'setting-network-platform-section',
    labelKey: 'settings.networkPlatformSection',
    tab: 'network-platform',
    keywords: []
  },
  {
    id: 'setting-proxy-per-platform',
    labelKey: 'settings.proxyPerPlatform',
    tab: 'network-platform',
    keywords: ['proxy', 'platforma', 'youtube', 'soundcloud']
  },
  {
    id: 'setting-quality-per-platform',
    labelKey: 'settings.qualityPerPlatform',
    tab: 'network-platform',
    keywords: []
  },
  {
    id: 'setting-audio-pip-auto-hide',
    labelKey: 'settings.audioPipAutoHide',
    tab: 'pip-audio',
    keywords: []
  },
  {
    id: 'setting-audio-pip-auto-show',
    labelKey: 'settings.audioPipAutoShow',
    tab: 'pip-audio',
    keywords: []
  },
  {
    id: 'setting-audio-pip-dock',
    labelKey: 'settings.audioPipDock',
    tab: 'pip-audio',
    keywords: []
  },
  {
    id: 'setting-audio-pip-section',
    labelKey: 'settings.audioPipSection',
    tab: 'pip-audio',
    keywords: []
  },
  { id: 'setting-pip-audio', labelKey: 'settings.pipAudio', tab: 'pip-audio', keywords: [] },
  {
    id: 'setting-pip-position-label',
    labelKey: 'settings.pipPositionLabel',
    tab: 'pip-video',
    keywords: []
  },
  {
    id: 'setting-pip-pre-buffer',
    labelKey: 'settings.pipPreBuffer',
    tab: 'pip-video',
    keywords: []
  },
  { id: 'setting-pip-video', labelKey: 'settings.pipVideo', tab: 'pip-video', keywords: [] },
  {
    id: 'setting-video-pip-section',
    labelKey: 'settings.videoPipSection',
    tab: 'pip-video',
    keywords: []
  },
  {
    id: 'setting-playback-section',
    labelKey: 'settings.playbackSection',
    tab: 'playback',
    keywords: []
  },
  { id: 'setting-video-filter', labelKey: 'settings.videoFilter', tab: 'playback', keywords: [] },
  {
    id: 'setting-visualization',
    labelKey: 'settings.visualization',
    tab: 'playback',
    keywords: []
  },
  {
    id: 'setting-shortcuts-section',
    labelKey: 'settings.shortcutsSection',
    tab: 'shortcuts',
    keywords: []
  },
  { id: 'setting-clip-format', labelKey: 'settings.clipFormat', tab: 'smart-mode', keywords: [] },
  {
    id: 'setting-default-audio-format',
    labelKey: 'settings.defaultAudioFormat',
    tab: 'smart-mode',
    keywords: []
  },
  {
    id: 'setting-default-audio-quality',
    labelKey: 'settings.defaultAudioQuality',
    tab: 'smart-mode',
    keywords: []
  },
  {
    id: 'setting-default-cover',
    labelKey: 'settings.defaultCover',
    tab: 'smart-mode',
    keywords: []
  },
  { id: 'setting-default-kind', labelKey: 'settings.defaultKind', tab: 'smart-mode', keywords: [] },
  { id: 'setting-default-subs', labelKey: 'settings.defaultSubs', tab: 'smart-mode', keywords: [] },
  {
    id: 'setting-default-subs-langs',
    labelKey: 'settings.defaultSubsLangs',
    tab: 'smart-mode',
    keywords: []
  },
  {
    id: 'setting-default-video-container',
    labelKey: 'settings.defaultVideoContainer',
    tab: 'smart-mode',
    keywords: []
  },
  {
    id: 'setting-default-video-quality',
    labelKey: 'settings.defaultVideoQuality',
    tab: 'smart-mode',
    keywords: []
  },
  {
    id: 'setting-filename-template',
    labelKey: 'settings.filenameTemplate',
    tab: 'smart-mode',
    keywords: []
  },
  {
    id: 'setting-smart-mode',
    labelKey: 'settings.smartMode',
    tab: 'smart-mode',
    keywords: ['inteligentny', 'smart']
  },
  {
    id: 'setting-smart-mode-tab',
    labelKey: 'settings.smartModeTab',
    tab: 'smart-mode',
    keywords: []
  },
  {
    id: 'setting-log-level',
    labelKey: 'settings.logLevel',
    tab: 'system-logs',
    keywords: ['logi', 'log', 'poziom', 'debug']
  },
  {
    id: 'setting-logs-section',
    labelKey: 'settings.logsSection',
    tab: 'system-logs',
    keywords: []
  },
  { id: 'setting-theme-tab', labelKey: 'settings.themeTab', tab: 'theme', keywords: [] },
  { id: 'setting-toast-errors', labelKey: 'settings.toastErrors', tab: 'toast', keywords: [] },
  { id: 'setting-toast-info', labelKey: 'settings.toastInfo', tab: 'toast', keywords: [] },
  { id: 'setting-toast-native', labelKey: 'settings.toastNative', tab: 'toast', keywords: [] },
  { id: 'setting-toast-position', labelKey: 'settings.toastPosition', tab: 'toast', keywords: [] },
  { id: 'setting-toast-success', labelKey: 'settings.toastSuccess', tab: 'toast', keywords: [] },
  { id: 'setting-toast-title', labelKey: 'settings.toastTitle', tab: 'toast', keywords: [] },
  { id: 'setting-toast-types', labelKey: 'settings.toastTypes', tab: 'toast', keywords: [] },
  { id: 'setting-toast-warn', labelKey: 'settings.toastWarn', tab: 'toast', keywords: [] },
  {
    id: 'setting-auto-check',
    labelKey: 'settings.autoCheck',
    tab: 'updates',
    keywords: ['aktualizacje', 'updates']
  },
  {
    id: 'setting-check-interval',
    labelKey: 'settings.checkInterval',
    tab: 'updates',
    keywords: []
  },
  {
    id: 'setting-current-version',
    labelKey: 'settings.currentVersion',
    tab: 'updates',
    keywords: []
  },
  { id: 'setting-update-section', labelKey: 'settings.updateSection', tab: 'updates', keywords: [] }
];
