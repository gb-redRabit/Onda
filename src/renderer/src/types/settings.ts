export interface AppSettings {
  appearance: AppearanceSettings;
  playback: PlaybackSettings;
  explorer: ExplorerSettings;
  download: DownloadSettings;
  shortcuts: ShortcutSettings;
  network: NetworkSettings;
  apiKeys: ApiKeySettings;
  updates: UpdateSettings;
  toast: ToastSettings;
  dependencies: Record<string, DependencyStatus>;
}

export interface ExplorerSettings {
  viewMode: 'extraSmall' | 'small' | 'medium' | 'large' | 'extraLarge' | 'details';
  sortBy: 'name' | 'size' | 'type' | 'modified';
  sortOrder: 'asc' | 'desc';
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
  locale: 'pl' | 'en';
  animations: boolean;
  transparency: number;
  customBackground?: string;
  audioPipMode: 'minimal' | 'medium' | 'max' | 'wide';
  audioPipAutoShow: boolean;
  audioPipOpacity: number;
  audioPipPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
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
  cursorHide: boolean;
  cursorTimeout: number;
  playbackSpeed: number;
  videoFilter: string;
}

export interface DownloadSettings {
  defaultPath: string;
  defaultAudioFormat: 'mp3' | 'flac' | 'ogg' | 'aac';
  defaultVideoQuality: 'best' | '1080p' | '720p' | '480p';
  filenameTemplate: string;
  maxConcurrent: number;
  autoDownloadSubscriptions: boolean;
  hashFiles: boolean;
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
}

export interface DependencyStatus {
  name: string;
  installed: boolean;
  version: string | null;
  checkedAt: number | null;
}
