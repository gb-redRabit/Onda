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

export const EQUALIZER_PRESETS: Record<string, Record<number, number>> = {
  flat: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  pop: { 0: -1, 1: 2, 2: 4, 3: 4, 4: 2, 5: -1, 6: -1, 7: -1, 8: 2, 9: 2 },
  rock: { 0: 5, 1: 3, 2: -2, 3: -4, 4: -2, 5: 2, 6: 5, 7: 6, 8: 6, 9: 5 },
  jazz: { 0: 3, 1: 2, 2: 0, 3: 2, 4: -2, 5: -2, 6: 0, 7: 2, 8: 3, 9: 4 },
  classical: { 0: 4, 1: 3, 2: 2, 3: 1, 4: -1, 5: -1, 6: 0, 7: 2, 8: 3, 9: 4 },
  bassBoost: { 0: 8, 1: 6, 2: 4, 3: 2, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  trebleBoost: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 4, 7: 6, 8: 8, 9: 8 },
  vocal: { 0: -2, 1: -3, 2: -3, 3: 1, 4: 4, 5: 4, 6: 3, 7: 1, 8: 0, 9: -2 }
};

export const EQUALIZER_PRESET_LABELS: Record<string, string> = {
  flat: 'Flat',
  pop: 'Pop',
  rock: 'Rock',
  jazz: 'Jazz',
  classical: 'Classical',
  bassBoost: 'Bass',
  trebleBoost: 'Treble',
  vocal: 'Vocal'
};

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
  settings: 'Ctrl+,',
  explorer: 'Ctrl+E',
  library: 'Ctrl+L',
  home: 'Ctrl+H'
};

export const DEFAULT_APPEARANCE = {
  theme: 'dark' as const,
  customBase: 'dark' as const,
  glassAlpha: 100,
  fontSize: 14,
  sidebarPosition: 'left' as const,
  sidebarCollapsed: false,
  showPlaylists: true,
  showAlbums: true,
  locale: 'pl' as const,
  animations: true,
  audioPipMode: 'minimal' as const,
  audioPipAutoShow: true,
  audioPipOpacity: 0.35,
  audioPipPosition: 'bottom-right' as const,
  audioPipEdgePosition: 'top' as const,
  audioLayout: {
    elements: [
      { id: 'visualization' as const, x: 0, y: 0, width: 100, height: 100, opacity: 100, layer: 1, visible: true },
      { id: 'cover' as const, x: 25, y: 15, width: 50, height: 55, opacity: 100, layer: 2, visible: true },
      { id: 'trackInfo' as const, x: 20, y: 73, width: 60, height: 8, opacity: 100, layer: 3, visible: true },
      { id: 'progress' as const, x: 20, y: 83, width: 60, height: 5, opacity: 100, layer: 3, visible: true },
      { id: 'controls' as const, x: 20, y: 90, width: 60, height: 10, opacity: 100, layer: 5, visible: true }
    ],
    preset: 'full' as const,
    autoHideDelay: 3000,
    hudOpacity: 100,
    vizQuality: 'high' as const
  }
};

export const AUDIO_LAYOUT_PRESETS: Record<string, { label: string; elements: typeof DEFAULT_APPEARANCE.audioLayout.elements }> = {
  compact: {
    label: 'Compact',
    elements: [
      { id: 'visualization', x: 0, y: 0, width: 100, height: 100, opacity: 100, layer: 1, visible: true },
      { id: 'cover', x: 5, y: 20, width: 25, height: 60, opacity: 100, layer: 2, visible: true },
      { id: 'trackInfo', x: 35, y: 30, width: 60, height: 15, opacity: 100, layer: 3, visible: true },
      { id: 'progress', x: 35, y: 50, width: 60, height: 5, opacity: 100, layer: 3, visible: true },
      { id: 'controls', x: 35, y: 60, width: 60, height: 20, opacity: 100, layer: 5, visible: true }
    ]
  },
  stacked: {
    label: 'Stacked',
    elements: [
      { id: 'visualization', x: 0, y: 0, width: 100, height: 100, opacity: 100, layer: 1, visible: true },
      { id: 'cover', x: 30, y: 5, width: 40, height: 45, opacity: 100, layer: 2, visible: true },
      { id: 'trackInfo', x: 15, y: 52, width: 70, height: 10, opacity: 100, layer: 3, visible: true },
      { id: 'progress', x: 15, y: 63, width: 70, height: 5, opacity: 100, layer: 3, visible: true },
      { id: 'controls', x: 15, y: 70, width: 70, height: 15, opacity: 100, layer: 5, visible: true }
    ]
  },
  split: {
    label: 'Split',
    elements: [
      { id: 'visualization', x: 50, y: 0, width: 50, height: 100, opacity: 100, layer: 1, visible: true },
      { id: 'cover', x: 5, y: 10, width: 40, height: 50, opacity: 100, layer: 2, visible: true },
      { id: 'trackInfo', x: 5, y: 62, width: 40, height: 10, opacity: 100, layer: 3, visible: true },
      { id: 'progress', x: 5, y: 73, width: 40, height: 5, opacity: 100, layer: 3, visible: true },
      { id: 'controls', x: 5, y: 80, width: 40, height: 15, opacity: 100, layer: 5, visible: true }
    ]
  },
  full: {
    label: 'Full',
    elements: [
      { id: 'visualization', x: 0, y: 0, width: 100, height: 100, opacity: 100, layer: 1, visible: true },
      { id: 'cover', x: 25, y: 15, width: 50, height: 55, opacity: 100, layer: 2, visible: true },
      { id: 'trackInfo', x: 20, y: 73, width: 60, height: 8, opacity: 100, layer: 3, visible: true },
      { id: 'progress', x: 20, y: 83, width: 60, height: 5, opacity: 100, layer: 3, visible: true },
      { id: 'controls', x: 20, y: 90, width: 60, height: 10, opacity: 100, layer: 5, visible: true }
    ]
  },
  immersive: {
    label: 'Immersive',
    elements: [
      { id: 'visualization', x: 0, y: 0, width: 100, height: 100, opacity: 100, layer: 1, visible: true },
      { id: 'cover', x: 35, y: 20, width: 30, height: 40, opacity: 90, layer: 2, visible: true },
      { id: 'trackInfo', x: 10, y: 85, width: 80, height: 5, opacity: 70, layer: 3, visible: true },
      { id: 'progress', x: 10, y: 91, width: 80, height: 3, opacity: 70, layer: 3, visible: true },
      { id: 'controls', x: 30, y: 94, width: 40, height: 6, opacity: 70, layer: 5, visible: true }
    ]
  }
};

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
  /** Globalny katalog źródeł (Sources/API); pusty = defaultPath/api (albo systemowe Pobrane/api). */
  sourcesDir: '',
  /** Domyślna preferencja "podfolder źródła" dla nowych źródeł. */
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
