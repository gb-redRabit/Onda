export const APP_NAME = 'Onda';
export const APP_VERSION = '1.0.0';

export const SUPPORTED_AUDIO_FORMATS = [
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
  '.wma',
  '.opus',
  '.aiff',
  '.alac'
];

export const SUPPORTED_VIDEO_FORMATS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.webm',
  '.mov',
  '.wmv',
  '.m4v',
  '.ts',
  '.ogv'
];

export const SUPPORTED_PLAYLIST_FORMATS = ['.m3u', '.m3u8', '.pls', '.asx'];

export const SUPPORTED_SUBTITLE_FORMATS = ['.srt', '.vtt', '.ass', '.ssa', '.sub'];

export const SUPPORTED_IMAGE_FORMATS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.ico',
  '.tiff',
  '.tif'
];

export const ALL_MEDIA_FORMATS = [
  ...SUPPORTED_AUDIO_FORMATS,
  ...SUPPORTED_VIDEO_FORMATS,
  ...SUPPORTED_PLAYLIST_FORMATS
];

import type {
  NetworkSettings,
  ExplorerSettings,
  LibrarySettings,
  ApiKeySettings,
  UpdateSettings,
  ToastSettings
} from '@renderer/types/settings';

export const DEFAULT_NETWORK: NetworkSettings = {
  proxy: { enabled: false, type: 'http', host: '', port: 8080 },
  downloadSpeedLimit: 0,
  userAgent: ''
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

export const DEFAULT_UPDATES: UpdateSettings = {
  autoCheck: true,
  checkInterval: 'startup'
};

export const DEFAULT_TOAST: ToastSettings = {
  position: 'bottom-right',
  showInfo: true,
  showSuccess: true,
  showWarning: true
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

export const DEFAULT_EQUALIZER_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

export const EQUALIZER_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pop: [-1, 2, 4, 5, 3, 0, -1, -1, -1, -1],
  rock: [5, 4, 3, 1, -1, -1, 0, 2, 3, 4],
  jazz: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  classical: [0, 0, 0, 0, 0, 0, -3, -3, -3, -5],
  bassBoost: [6, 5, 4, 2, 0, -1, -1, -1, -1, -1],
  trebleBoost: [-1, -1, -1, -1, 0, 2, 4, 5, 6, 6],
  vocal: [-2, -1, 0, 3, 5, 5, 3, 1, 0, -1]
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
  audioPipPosition: 'bottom-right' as const
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
  defaultAudioFormat: 'mp3' as const,
  defaultVideoQuality: 'best' as const,
  filenameTemplate: '{title} - {artist}',
  maxConcurrent: 3,
  autoDownloadSubscriptions: false,
  hashFiles: true
};
