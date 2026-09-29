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
  Wand,
  Puzzle,
  Activity
} from '@lucide/vue';

// Settings navigation data extracted from `views/SettingsView.vue` (plan 2.8).

export const SETTINGS_SECTIONS = [
  { id: 'appearance', labelKey: 'settings.sectionAppearance', icon: Palette },
  { id: 'playback', labelKey: 'settings.sectionPlayback', icon: Play },
  { id: 'library', labelKey: 'settings.sectionLibrary', icon: Folder },
  { id: 'network', labelKey: 'settings.sectionNetwork', icon: Globe },
  { id: 'system', labelKey: 'settings.sectionSystem', icon: Power },
  { id: 'advanced', labelKey: 'settings.sectionAdvanced', icon: Key }
] as const;

export const SETTINGS_TABS = [
  {
    id: 'playback',
    labelKey: 'settings.playback',
    icon: Play,
    section: 'playback'
  },
  {
    id: 'pip-video',
    labelKey: 'settings.pipVideo',
    icon: PictureInPicture,
    section: 'playback'
  },
  {
    id: 'pip-audio',
    labelKey: 'settings.pipAudio',
    icon: Music2,
    section: 'playback'
  },
  {
    id: 'theme',
    labelKey: 'settings.themeTab',
    icon: Paintbrush,
    section: 'appearance'
  },
  {
    id: 'appearance',
    labelKey: 'settings.appearance',
    icon: Palette,
    section: 'appearance'
  },
  {
    id: 'network',
    labelKey: 'settings.network',
    icon: Globe,
    section: 'network'
  },
  {
    id: 'network-platform',
    labelKey: 'settings.networkPlatform',
    icon: Globe,
    section: 'network'
  },
  {
    id: 'download',
    labelKey: 'settings.download',
    icon: Download,
    section: 'network'
  },
  {
    id: 'download-paths',
    labelKey: 'settings.downloadPaths',
    icon: Folder,
    section: 'network'
  },
  {
    id: 'download-queue',
    labelKey: 'settings.downloadQueue',
    icon: Download,
    section: 'network'
  },
  {
    id: 'smart-mode',
    labelKey: 'settings.smartModeTab',
    icon: Wand,
    section: 'network'
  },
  {
    id: 'library',
    labelKey: 'settings.library',
    icon: Folder,
    section: 'library'
  },
  {
    id: 'explorer',
    labelKey: 'settings.explorer',
    icon: Folder,
    section: 'library'
  },
  {
    id: 'general',
    labelKey: 'settings.general',
    icon: Power,
    section: 'system'
  },
  {
    id: 'system-logs',
    labelKey: 'settings.systemLogs',
    icon: Info,
    section: 'system'
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.shortcuts',
    icon: Keyboard,
    section: 'system'
  },
  {
    id: 'toast',
    labelKey: 'settings.notifications',
    icon: Bell,
    section: 'system'
  },
  {
    id: 'updates',
    labelKey: 'settings.updates',
    icon: RefreshCw,
    section: 'system'
  },
  {
    id: 'dependencies',
    labelKey: 'settings.dependencies',
    icon: Box,
    section: 'system'
  },
  {
    id: 'diagnostics',
    labelKey: 'settings.diagnostics',
    icon: Activity,
    section: 'system'
  },
  {
    id: 'apiKeys',
    labelKey: 'settings.apiKeys',
    icon: Key,
    section: 'advanced'
  },
  {
    id: 'plugins',
    labelKey: 'settings.plugins',
    icon: Puzzle,
    section: 'advanced'
  }
] as const;
