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

export const EQUALIZER_PRESET_IDS = Object.keys(EQUALIZER_PRESETS);

export const DEFAULT_NETWORK: NetworkSettings = {
  proxy: { enabled: false, type: 'http', host: '', port: 8080 },
  downloadSpeedLimit: 0,
  userAgent: ''
};

export const DEFAULT_GENERAL: GeneralSettings = {
  autoLaunch: false,
  startMinimized: false,
  closeToTray: true,
  restoreSession: false
};

export const DEFAULT_LIBRARY: LibrarySettings = {
  viewModes: {
    tracks: 'list',
    video: 'grid',
    albums: 'grid',
    artists: 'grid'
  }
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
  accentColor: '#7c6aef',
  fontSize: 14,
  density: 'comfortable' as const,
  sidebarPosition: 'left' as const,
  sidebarCollapsed: false,
  showPlaylists: true,
  showAlbums: true,
  locale: 'pl' as const,
  animations: true,
  transparency: 1,
  audioPipMode: 'minimal' as const,
  audioPipAutoShow: true,
  audioPipOpacity: 0.35,
  audioPipPosition: 'bottom-right' as const,
  audioPipEdgePosition: 'top' as const
};

export const THEME_PALETTES: Record<
  string,
  {
    bgBase: string;
    bgSurface: string;
    bgOverlay: string;
    bgElevated: string;
    bgHover: string;
    bgActive: string;
    borderDefault: string;
    borderSubtle: string;
    fgBase: string;
    fgMuted: string;
    fgFaint: string;
  }
> = {
  dark: {
    bgBase: '#0f0f17',
    bgSurface: '#181825',
    bgOverlay: '#1e1e2e',
    bgElevated: '#252536',
    bgHover: '#2e2e42',
    bgActive: '#3a3a52',
    borderDefault: '#2a2a40',
    borderSubtle: '#363650',
    fgBase: '#e8e8f0',
    fgMuted: '#a0a0b8',
    fgFaint: '#6a6a84'
  },
  light: {
    bgBase: '#f8f8fa',
    bgSurface: '#f0f0f4',
    bgOverlay: '#e8e8ee',
    bgElevated: '#ffffff',
    bgHover: '#e0e0e8',
    bgActive: '#d0d0da',
    borderDefault: '#d0d0da',
    borderSubtle: '#c0c0cc',
    fgBase: '#1a1a2e',
    fgMuted: '#4a4a60',
    fgFaint: '#8a8aa0'
  },
  midnight: {
    bgBase: '#0d1117',
    bgSurface: '#161b22',
    bgOverlay: '#1c2128',
    bgElevated: '#21262d',
    bgHover: '#292e36',
    bgActive: '#333942',
    borderDefault: '#21262d',
    borderSubtle: '#30363d',
    fgBase: '#c9d1d9',
    fgMuted: '#8b949e',
    fgFaint: '#6e7681'
  },
  spotify: {
    bgBase: '#121212',
    bgSurface: '#181818',
    bgOverlay: '#1e1e1e',
    bgElevated: '#282828',
    bgHover: '#333333',
    bgActive: '#3e3e3e',
    borderDefault: '#282828',
    borderSubtle: '#333333',
    fgBase: '#b3b3b3',
    fgMuted: '#808080',
    fgFaint: '#535353'
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
    primaryColor: '#7c6aef',
    secondaryColor: '#4f46e5',
    sensitivity: 0.5
  }
};

export const DEFAULT_DOWNLOAD = {
  defaultPath: '',
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
  maxConcurrent: 3,
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
