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
  Music2,
  Key,
  Puzzle,
  Activity
} from '@lucide/vue';

// Settings navigation data extracted from `views/SettingsView.vue` (plan 2.8).

export const SETTINGS_SECTIONS = [
  { id: 'appearance', labelKey: 'settings.sectionAppearance', icon: Palette },
  { id: 'playback', labelKey: 'settings.sectionPlayback', icon: Play },
  { id: 'downloads', labelKey: 'settings.sectionDownloads', icon: Download },
  { id: 'library', labelKey: 'settings.sectionLibrary', icon: Folder },
  { id: 'network', labelKey: 'settings.sectionNetwork', icon: Globe },
  { id: 'system', labelKey: 'settings.sectionSystem', icon: Power },
  { id: 'advanced', labelKey: 'settings.sectionAdvanced', icon: Key }
] as const;

export const SETTINGS_TABS = [
  {
    id: 'playback',
    labelKey: 'settings.playback',
    descKey: 'settings.tabDesc.playback',
    icon: Play,
    section: 'playback'
  },
  {
    id: 'pip-video',
    labelKey: 'settings.pipVideo',
    descKey: 'settings.tabDesc.pipVideo',
    icon: PictureInPicture,
    section: 'playback'
  },
  {
    id: 'pip-audio',
    labelKey: 'settings.pipAudio',
    descKey: 'settings.tabDesc.pipAudio',
    icon: Music2,
    section: 'playback'
  },
  {
    id: 'theme',
    labelKey: 'settings.themeTab',
    descKey: 'settings.tabDesc.theme',
    icon: Paintbrush,
    section: 'appearance'
  },
  {
    id: 'appearance',
    labelKey: 'settings.appearance',
    descKey: 'settings.tabDesc.appearance',
    icon: Palette,
    section: 'appearance'
  },
  {
    id: 'network',
    labelKey: 'settings.network',
    descKey: 'settings.tabDesc.network',
    icon: Globe,
    section: 'network'
  },
  {
    id: 'network-platform',
    labelKey: 'settings.networkPlatform',
    descKey: 'settings.tabDesc.networkPlatform',
    icon: Globe,
    section: 'network'
  },
  {
    id: 'download',
    labelKey: 'settings.download',
    descKey: 'settings.tabDesc.download',
    icon: Download,
    section: 'downloads'
  },
  {
    id: 'download-paths',
    labelKey: 'settings.downloadPaths',
    descKey: 'settings.tabDesc.downloadPaths',
    icon: Folder,
    section: 'downloads'
  },
  {
    id: 'download-queue',
    labelKey: 'settings.downloadQueue',
    descKey: 'settings.tabDesc.downloadQueue',
    icon: Download,
    section: 'downloads'
  },
  {
    id: 'library',
    labelKey: 'settings.library',
    descKey: 'settings.tabDesc.library',
    icon: Folder,
    section: 'library'
  },
  {
    id: 'explorer',
    labelKey: 'settings.explorer',
    descKey: 'settings.tabDesc.explorer',
    icon: Folder,
    section: 'library'
  },
  {
    id: 'general',
    labelKey: 'settings.general',
    descKey: 'settings.tabDesc.general',
    icon: Power,
    section: 'system'
  },
  {
    id: 'system-logs',
    labelKey: 'settings.systemLogs',
    descKey: 'settings.tabDesc.systemLogs',
    icon: Info,
    section: 'system'
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.shortcuts',
    descKey: 'settings.tabDesc.shortcuts',
    icon: Keyboard,
    section: 'system'
  },
  {
    id: 'toast',
    labelKey: 'settings.notifications',
    descKey: 'settings.tabDesc.toast',
    icon: Bell,
    section: 'system'
  },
  {
    id: 'updates',
    labelKey: 'settings.updates',
    descKey: 'settings.tabDesc.updates',
    icon: RefreshCw,
    section: 'system'
  },
  {
    id: 'dependencies',
    labelKey: 'settings.dependencies',
    descKey: 'settings.tabDesc.dependencies',
    icon: Box,
    section: 'system'
  },
  {
    id: 'diagnostics',
    labelKey: 'settings.diagnostics',
    descKey: 'settings.tabDesc.diagnostics',
    icon: Activity,
    section: 'system'
  },
  {
    id: 'apiKeys',
    labelKey: 'settings.apiKeys',
    descKey: 'settings.tabDesc.apiKeys',
    icon: Key,
    section: 'advanced'
  },
  {
    id: 'plugins',
    labelKey: 'settings.plugins',
    descKey: 'settings.tabDesc.plugins',
    icon: Puzzle,
    section: 'advanced'
  }
] as const;
