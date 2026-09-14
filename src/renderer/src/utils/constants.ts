import type {
  NetworkSettings,
  ExplorerSettings,
  LibrarySettings,
  ApiKeySettings,
  UpdateSettings,
  ToastSettings,
  YoutubeAuthSettings,
  GeneralSettings
} from '@renderer/types/settings';

export * from './constants/audio';

export const DEFAULT_NETWORK: NetworkSettings = {
  proxy: { enabled: false, type: 'http', host: '', port: 8080 },
  proxyPerPlatform: false,
  proxyYoutube: { enabled: false, type: 'http', host: '', port: 8080 },
  proxySoundcloud: { enabled: false, type: 'http', host: '', port: 8080 },
  defaultQualityPerPlatform: false,
  youtubeQuality: 'best',
  soundcloudQuality: 'best',
  downloadSpeedLimit: 0,
  userAgent: ''
};

export const DEFAULT_GENERAL: GeneralSettings = {
  autoLaunch: false,
  startMinimized: false,
  closeToTray: true,
  restoreSession: false,
  logLevel: 'info' as const,
  logMaxSizeMB: 10,
  experimentalEnabled: false
};

export const DEFAULT_LIBRARY: LibrarySettings = {
  viewModes: {
    tracks: 'list',
    video: 'grid',
    albums: 'grid',
    artists: 'grid'
  },
  coverCacheMaxEntries: 2000
};

export const DEFAULT_EXPLORER: ExplorerSettings = {
  viewMode: 'medium',
  sortBy: 'name',
  sortOrder: 'asc',
  confirmBeforeMove: true
};

export const DEFAULT_API_KEYS: ApiKeySettings = {
  keys: []
};

export const DEFAULT_YOUTUBE_AUTH: YoutubeAuthSettings = {
  method: 'none',
  cookiesPath: '',
  cookiesBrowser: 'chrome',
  lastLogin: null
};

export const DEFAULT_UPDATES: UpdateSettings = {
  autoCheck: true,
  checkInterval: 'startup'
};

export const DEFAULT_TOAST: ToastSettings = {
  position: 'bottom-right',
  showInfo: true,
  showSuccess: true,
  showWarning: true,
  showNative: true
};

import type { StatusBarSettings } from '@renderer/types/settings';

export const DEFAULT_STATUS_BAR: StatusBarSettings = {
  visible: true,
  sections: [
    'playing',
    'separator',
    'viewCounts',
    'downloads',
    'youtube',
    'dependencies',
    'version',
    'clock'
  ]
};

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'play-pause': 'Space',
  'skip-forward': 'ArrowRight',
  'skip-backward': 'ArrowLeft',
  'volume-up': 'ArrowUp',
  'volume-down': 'ArrowDown',
  mute: 'M',
  fullscreen: 'F',
  'speed-up': '>',
  'speed-down': '<',
  'jump-start': '0',
  'next-track': 'MediaTrackNext',
  'prev-track': 'MediaTrackPrevious',
  search: 'Ctrl+K',
  'view-search': 'Ctrl+F',
  settings: 'Ctrl+,',
  explorer: 'Ctrl+E',
  library: 'Ctrl+L',
  home: 'Ctrl+H'
};

export * from './constants/appearance';

export const DEFAULT_PLAYBACK = {
  defaultPlayer: 'html5' as const,
  normalization: false,
  replayGain: false,
  gaplessPlayback: true,
  autoPauseOnFocusLoss: false,
  defaultVolume: 0.8,
  rememberPosition: true,
  pipPosition: 'bottom-right' as const,
  pipWidth: 480,
  pipHeight: 290,
  pipPreBuffer: false,
  cursorHide: true,
  cursorTimeout: 3,
  resumePromptTimeout: 7,
  playbackSpeed: 1,
  videoFilter: 'none',
  visualization: {
    mode: 'circle' as const,
    primaryColor: '#8b7cf0',
    secondaryColor: '#4f46e5',
    sensitivity: 0.5,
    smoothing: 0.8,
    fpsCap: 60
  },
  crossfadeSeconds: 0,
  streamPreloadSeconds: 5,
  perSourceVolume: false,
  autoResume: true,
  sleepTimerMinutes: 0
};

export const DEFAULT_DOWNLOAD = {
  defaultPath: '',
  /** Globalny katalog ĹşrĂłdeĹ‚ (Sources/API); pusty = defaultPath/api (albo systemowe Pobrane/api). */
  sourcesDir: '',
  /** DomyĹ›lna preferencja "podfolder ĹşrĂłdĹ‚a" dla nowych ĹşrĂłdeĹ‚. */
  sourcesFolder: true,
  defaultKind: 'audio' as const,
  defaultAudioFormat: 'mp3' as const,
  defaultAudioQuality: 'best' as const,
  defaultVideoQuality: 'best' as const,
  defaultVideoContainer: 'mp4' as const,
  defaultCover: 'thumbnail' as const,
  defaultCoverFrameTime: 30,
  defaultCoverClipStart: 0,
  defaultCoverClipEnd: 30,
  defaultCoverClipFormat: 'webm' as const,
  filenameTemplate: '{title} - {artist}',
  maxConcurrent: 1,
  retryAttempts: 3,
  retryBaseMs: 1500,
  tempDir: '',
  autoDownloadSubscriptions: false,
  hashFiles: true,
  smartMode: true,
  defaultSubs: false,
  defaultSubsLangs: 'pl,en',
  nightScheduleEnabled: false,
  nightScheduleStart: 22,
  nightScheduleEnd: 6,
  autoAddDownloadFolder: false
};

export const FILENAME_TEMPLATE_PRESETS: string[] = [
  '{title} - {artist}',
  '{artist} - {title}',
  '{title} ({year})',
  '{title}',
  '{artist} - {album}',
  '{artist} - {album} - {title} ({year})'
];
