export interface AppSettings {
  appearance: AppearanceSettings
  playback: PlaybackSettings
  download: DownloadSettings
  shortcuts: ShortcutSettings
  network: NetworkSettings
  apiKeys: ApiKeySettings
  updates: UpdateSettings
  dependencies: Record<string, DependencyStatus>
}

export interface AppearanceSettings {
  theme: 'dark' | 'light' | 'midnight' | 'spotify' | 'custom'
  accentColor: string
  fontSize: number
  density: 'compact' | 'comfortable' | 'spacious'
  sidebarPosition: 'left' | 'right'
  animations: boolean
  transparency: number
  customBackground?: string
}

export interface PlaybackSettings {
  defaultPlayer: 'html5' | 'vlc'
  crossfadeDuration: number
  normalization: boolean
  replayGain: boolean
  gaplessPlayback: boolean
  autoPauseOnFocusLoss: boolean
  defaultVolume: number
  rememberPosition: boolean
  pipPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  pipWidth: number
  pipHeight: number
  cursorHide: boolean
  cursorTimeout: number
  playbackSpeed: number
  videoFilter: string
}

export interface DownloadSettings {
  defaultPath: string
  defaultAudioFormat: 'mp3' | 'flac' | 'ogg' | 'aac'
  defaultVideoQuality: 'best' | '1080p' | '720p' | '480p'
  filenameTemplate: string
  maxConcurrent: number
  autoDownloadSubscriptions: boolean
  hashFiles: boolean
}

export interface ShortcutSettings {
  [action: string]: string
}

export interface NetworkSettings {
  proxy: {
    enabled: boolean
    type: 'http' | 'https' | 'socks5'
    host: string
    port: number
    username?: string
    password?: string
  }
  downloadSpeedLimit: number
  userAgent: string
}

export interface ApiKeySettings {
  keys: ApiKeyEntry[]
}

export interface ApiKeyEntry {
  id: string
  name: string
  service: string
  key: string
  values?: Record<string, string | number | boolean>
  isActive: boolean
}

export interface UpdateSettings {
  autoCheck: boolean
  checkInterval: 'startup' | 'hourly' | 'daily' | 'weekly'
}

export interface DependencyStatus {
  name: string
  installed: boolean
  version: string | null
  checkedAt: number | null
}
