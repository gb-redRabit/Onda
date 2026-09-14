import type { YoutubeAuthMethod } from '../../../renderer/src/types/settings';

export interface YoutubeAuthStatus {
  method: YoutubeAuthMethod;
  loggedIn: boolean;
  cookiesPath?: string;
  browser?: string;
  lastLogin?: number | null;
  error?: string;
}

export interface AppInfo {
  appName: string;
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  v8: string;
  os: string;
  platform: string;
  arch: string;
  userDataPath: string;
  logPath: string;
  uptime: number;
}

export interface UpdaterState {
  status:
    'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  current: string;
  version: string;
  progress: number;
  error: string;
  enabled: boolean;
}
