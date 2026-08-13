export interface LibrarySettings {
  viewModes: Record<string, 'list' | 'grid'>;
}

export interface AppSettings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  playback: PlaybackSettings;
  explorer: ExplorerSettings;
  library: LibrarySettings;
  download: DownloadSettings;
  shortcuts: ShortcutSettings;
  network: NetworkSettings;
  apiKeys: ApiKeySettings;
  youtube: YoutubeAuthSettings;
  updates: UpdateSettings;
  toast: ToastSettings;
  dependencies: Record<string, DependencyStatus>;
  favorites?: string[];
}

export interface GeneralSettings {
  autoLaunch: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  restoreSession: boolean;
}

export type YoutubeAuthMethod = 'none' | 'electron' | 'browser' | 'manual';

export interface YoutubeAuthSettings {
  method: YoutubeAuthMethod;
  cookiesPath: string;
  cookiesBrowser: string;
  lastLogin: number | null;
}

export interface ExplorerSettings {
  viewMode: 'extraSmall' | 'small' | 'medium' | 'large' | 'extraLarge' | 'details';
  sortBy: 'name' | 'size' | 'type' | 'modified';
  sortOrder: 'asc' | 'desc';
  confirmBeforeMove: boolean;
}

export interface AppearanceSettings {
  theme: 'dark' | 'light' | 'midnight' | 'spotify' | 'custom';
  accentColor: string;
  fontSize: number;
  density: 'compact' | 'comfortable' | 'spacious';
  sidebarPosition: 'left' | 'right';
  sidebarCollapsed: boolean;
  showPlaylists: boolean;
  showAlbums: boolean;
  locale: 'pl' | 'en' | 'auto';
  animations: boolean;
  transparency: number;
  customBackground?: string;
  audioPipMode: 'minimal' | 'medium' | 'max' | 'wide';
  audioPipAutoShow: boolean;
  audioPipOpacity: number;
  audioPipPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  audioPipEdgePosition: 'top' | 'bottom';
}

export type VisualizationMode = 'circle' | 'bars' | 'particles' | 'wave' | 'radial' | 'none';

export interface VisualizationSettings {
  mode: VisualizationMode;
  primaryColor: string;
  secondaryColor: string;
  sensitivity: number;
}

export interface PlaybackSettings {
  defaultPlayer: 'html5' | 'vlc';
  normalization: boolean;
  replayGain: boolean;
  gaplessPlayback: boolean;
  autoPauseOnFocusLoss: boolean;
  defaultVolume: number;
  rememberPosition: boolean;
  pipPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  pipWidth: number;
  pipHeight: number;
  pipPreBuffer: boolean;
  cursorHide: boolean;
  cursorTimeout: number;
  playbackSpeed: number;
  videoFilter: string;
  visualization: VisualizationSettings;
}

export interface DownloadSettings {
  defaultPath: string;
  defaultKind: 'audio' | 'video';
  defaultAudioFormat: 'best' | 'mp3' | 'flac' | 'ogg' | 'aac' | 'opus' | 'm4a' | 'wav';
  defaultAudioQuality: 'best' | 'high' | 'medium' | 'low';
  defaultVideoQuality: 'best' | '2160p' | '1440p' | '1080p' | '720p' | '480p';
  defaultVideoContainer: 'mp4' | 'mkv' | 'webm';
  defaultCover: 'thumbnail' | 'none' | 'frame' | 'clip';
  defaultCoverFrameTime: number;
  defaultCoverClipStart: number;
  defaultCoverClipEnd: number;
  defaultCoverClipFormat: 'webm' | 'mp4';
  filenameTemplate: string;
  maxConcurrent: number;
  autoDownloadSubscriptions: boolean;
  hashFiles: boolean;
  smartMode: boolean;
  defaultSubs: boolean;
  defaultSubsLangs: string;
  nightScheduleEnabled: boolean;
  nightScheduleStart: number;
  nightScheduleEnd: number;
  autoAddDownloadFolder: boolean;
}

export interface ShortcutSettings {
  [action: string]: string;
}

export interface NetworkSettings {
  proxy: {
    enabled: boolean;
    type: 'http' | 'https' | 'socks5';
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  downloadSpeedLimit: number;
  userAgent: string;
}

export interface ApiKeySettings {
  keys: ApiKeyEntry[];
}

export interface ApiKeyEntry {
  id: string;
  name: string;
  service: string;
  key: string;
  values?: Record<string, string | number | boolean>;
  isActive: boolean;
}

export interface UpdateSettings {
  autoCheck: boolean;
  checkInterval: 'startup' | 'hourly' | 'daily' | 'weekly';
}

export interface ToastSettings {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  showInfo: boolean;
  showSuccess: boolean;
  showWarning: boolean;
  showNative: boolean;
}

export interface DependencyStatus {
  name: string;
  installed: boolean;
  version: string | null;
  checkedAt: number | null;
  path?: string | null;
  managed?: boolean;
  latestVersion?: string | null;
  updateAvailable?: boolean;
}
