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
    section: 'playback',
    description: 'Głośność, crossfade, bufor'
  },
  {
    id: 'playback-buffer',
    labelKey: 'settings.playbackBuffer',
    icon: Music2,
    section: 'playback',
    description: 'Preload, sleep timer, per-source'
  },
  {
    id: 'pip-video',
    labelKey: 'settings.pipVideo',
    icon: PictureInPicture,
    section: 'playback',
    description: 'Tryb PiP wideo'
  },
  {
    id: 'pip-audio',
    labelKey: 'settings.pipAudio',
    icon: Music2,
    section: 'playback',
    description: 'Tryb PiP audio'
  },
  {
    id: 'theme',
    labelKey: 'settings.themeTab',
    icon: Paintbrush,
    section: 'appearance',
    description: 'Motywy i kolory'
  },
  {
    id: 'appearance',
    labelKey: 'settings.appearance',
    icon: Palette,
    section: 'appearance',
    description: 'Czcionka, sidebar, animacje'
  },
  {
    id: 'network',
    labelKey: 'settings.network',
    icon: Globe,
    section: 'network',
    description: 'Proxy globalne, prędkość'
  },
  {
    id: 'network-platform',
    labelKey: 'settings.networkPlatform',
    icon: Globe,
    section: 'network',
    description: 'Jakość i proxy YT/SC'
  },
  {
    id: 'download',
    labelKey: 'settings.download',
    icon: Download,
    section: 'network',
    description: 'Konto Google i cookies'
  },
  {
    id: 'download-paths',
    labelKey: 'settings.downloadPaths',
    icon: Folder,
    section: 'network',
    description: 'Foldery docelowe i profile'
  },
  {
    id: 'download-queue',
    labelKey: 'settings.downloadQueue',
    icon: Download,
    section: 'network',
    description: 'Kolejka, retry, hash'
  },
  {
    id: 'smart-mode',
    labelKey: 'settings.smartModeTab',
    icon: Wand,
    section: 'network',
    description: 'Tryb inteligentny'
  },
  {
    id: 'library',
    labelKey: 'settings.library',
    icon: Folder,
    section: 'library',
    description: 'Foldery biblioteki i skan'
  },
  {
    id: 'explorer',
    labelKey: 'settings.explorer',
    icon: Folder,
    section: 'library',
    description: 'Widok i sortowanie plików'
  },
  {
    id: 'general',
    labelKey: 'settings.general',
    icon: Power,
    section: 'system',
    description: 'Autostart, tray, sesja'
  },
  {
    id: 'system-logs',
    labelKey: 'settings.systemLogs',
    icon: Info,
    section: 'system',
    description: 'Logi, rozmiar, eksperymenty'
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.shortcuts',
    icon: Keyboard,
    section: 'system',
    description: 'Skróty klawiszowe'
  },
  {
    id: 'toast',
    labelKey: 'settings.notifications',
    icon: Bell,
    section: 'system',
    description: 'Powiadomienia'
  },
  {
    id: 'updates',
    labelKey: 'settings.updates',
    icon: RefreshCw,
    section: 'system',
    description: 'Aktualizacje'
  },
  {
    id: 'dependencies',
    labelKey: 'settings.dependencies',
    icon: Box,
    section: 'system',
    description: 'yt-dlp, ffmpeg, mkvextract'
  },
  {
    id: 'systemInfo',
    labelKey: 'settings.systemInfo',
    icon: Info,
    section: 'system',
    description: 'Wersje i ścieżki'
  },
  {
    id: 'diagnostics',
    labelKey: 'settings.diagnostics',
    icon: Activity,
    section: 'system',
    description: 'Resolver, ostrzeżenia, cache, reset'
  },
  {
    id: 'apiKeys',
    labelKey: 'settings.apiKeys',
    icon: Key,
    section: 'advanced',
    description: 'Klucze API'
  },
  {
    id: 'plugins',
    labelKey: 'settings.plugins',
    icon: Puzzle,
    section: 'advanced',
    description: 'Rozszerzenia Onda'
  }
] as const;
